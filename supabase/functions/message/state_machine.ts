// supabase/functions/message/state_machine.ts

import { getEmbedding, buildContextualPayload, getIndianDateStr } from './retriever.ts';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StateMachineResult {
  handled: boolean;
  response?: Response;
}

/**
 * Deterministic & Fallback Confirmation State Machine
 */
export async function handleStateMachine(
  draftContext: any,
  trimmedText: string,
  userId: string,
  supabaseClient: any,
  config: any,
  corsHeaders: Record<string, string>,
  callLLM: (config: any, sys: string, user: string) => Promise<string>
): Promise<StateMachineResult> {
  if (!draftContext) {
    return { handled: false };
  }

  // ── 0. Generic Multi-Turn Slot Filling Intercept ──
  let isSlotFill = false;
  let slotFillPayload: any = null;

  try {
    const slotFillPrompt = `You are a conversation state assistant for Buddy AI.
The user was previously asked a clarification or follow-up question: "${draftContext.clarification_prompt || 'Can you provide details?'}"
Pending Draft Context: ${JSON.stringify(draftContext)}
Current Calendar Date (IST): ${getIndianDateStr()}

User replied: "${trimmedText}"

Determine if the user's reply is answering the question, providing missing details (e.g. number of hours, amount, meal items, project/work details, exercise mins, multi-day span, or log confirmation), or instructing to log the data for ANY category.

Return ONLY a JSON object:
{
  "is_slot_fill": boolean,
  "action": "insert" | "bulk_insert" | "update" | "delete" | "cancel" | null,
  "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "work" | "other" | null,
  "data": object | null,
  "entry_time": ISO 8601 string or null,
  "event_date": "YYYY-MM-DD" or null,
  "bulk_entries": [
    {
      "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "work" | "other",
      "entry_time": ISO 8601 string,
      "data": object,
      "raw_text": string
    }
  ] | null,
  "acknowledgment": "A warm, articulate, supportive 1-2 sentence companion reply. Confirm what was logged AND include a personalized encouraging comment or wish. Speak like a caring close friend." | null
}
If is_slot_fill is true, merge the new information from user's reply with draftContext. If the user specifies a multi-day span (e.g. "for past 3 days", "every day"), populate bulk_entries with separate items for each day. Otherwise set is_slot_fill to false.`;

    const slotResText = await callLLM(config, slotFillPrompt, trimmedText);
    let cleanedSlotRes = slotResText.trim();
    const slotJsonMatch = cleanedSlotRes.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (slotJsonMatch) cleanedSlotRes = slotJsonMatch[1].trim();
    const jsonMatchObj = cleanedSlotRes.match(/\{[\s\S]*?\}/);
    if (jsonMatchObj) cleanedSlotRes = jsonMatchObj[0];

    const slotParsed = JSON.parse(cleanedSlotRes);
    if (slotParsed && slotParsed.is_slot_fill) {
      isSlotFill = true;
      slotFillPayload = slotParsed;
      console.log('[state_machine] Slot-Filling detected:', JSON.stringify(slotFillPayload));
    }
  } catch (err) {
    console.warn('[state_machine] Slot-filling evaluation failed:', err);
  }

  if (isSlotFill && slotFillPayload) {
    const action = slotFillPayload.action || draftContext.action || 'insert';
    if (action === 'bulk_insert' && slotFillPayload.bulk_entries && slotFillPayload.bulk_entries.length > 0) {
      const insertRows = [];
      for (const entry of slotFillPayload.bulk_entries) {
        const raw = entry.raw_text || `${entry.category} entry`;
        const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
        const embedPayload = buildContextualPayload(raw, entry.category || 'other', entry.data || {}, entry.entry_time);
        const emb = await getEmbedding(embedPayload);

        insertRows.push({
          user_id: userId,
          raw_text: raw,
          category: entry.category || draftContext.category || 'other',
          entry_time: entry.entry_time || new Date().toISOString(),
          data: entry.data || {},
          embedding: emb || undefined,
          tags: rowTags,
          event_date: entry.event_date || slotFillPayload.event_date || null
        });
      }

      const { data: inserted, error } = await supabaseClient.from('entries').insert(insertRows).select();
      if (error) throw new Error(error.message);

      return {
        handled: true,
        response: new Response(JSON.stringify({
          entry: inserted[0],
          acknowledgment: slotFillPayload.acknowledgment || `Successfully logged ${inserted.length} entries!`,
          needs_clarification: false,
          draftContext: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      };
    } else {
      const category = slotFillPayload.category || draftContext.category || 'other';
      const dataPayload = slotFillPayload.data || draftContext.data || {};
      const rawText = trimmedText || draftContext.raw_text || `${category} log`;
      const rowTags = (rawText.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
      const embedPayload = buildContextualPayload(rawText, category, dataPayload, slotFillPayload.entry_time || draftContext.entry_time);
      const emb = await getEmbedding(embedPayload);

      const insertPayload: any = {
        user_id: userId,
        raw_text: rawText,
        category,
        entry_time: slotFillPayload.entry_time || draftContext.entry_time || new Date().toISOString(),
        data: dataPayload,
        tags: rowTags,
        event_date: slotFillPayload.event_date || draftContext.event_date || null
      };
      if (emb) insertPayload.embedding = emb;

      const { data: inserted, error } = await supabaseClient.from('entries').insert([insertPayload]).select();
      if (error) throw new Error(error.message);

      return {
        handled: true,
        response: new Response(JSON.stringify({
          entry: inserted[0],
          acknowledgment: slotFillPayload.acknowledgment || `Successfully logged your ${category} entry!`,
          needs_clarification: false,
          draftContext: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      };
    }
  }

  // ── 1. Deterministic Fast Confirmation Matching ──
  const lowerConfirm = trimmedText.toLowerCase().trim();
  let isAccumulate = ['accumulate', 'add to total', 'sum', 'combine', 'total', 'add'].some(k => lowerConfirm.includes(k));
  let isConfirm = ['yes', 'yeah', 'yep', 'y', 'sure', 'confirm', 'do it', 'overwrite', 'update', 'delete', 'yes please', 'do that', 'ok', 'okay'].includes(lowerConfirm);
  let isCancel = ['no', 'cancel', 'dont', 'don\'t', 'stop', 'nay', 'n', 'no thanks', 'reject', 'leave', 'skip'].some(k => lowerConfirm.includes(k));
  let isKeepBoth = ['keep both', 'add both', 'add anyway', 'keep', 'insert anyway', 'separate'].includes(lowerConfirm);

  // Fallback single LLM decision if not cleanly matched by static keywords
  if (!isAccumulate && !isConfirm && !isCancel && !isKeepBoth) {
    try {
      const confirmPrompt = `You are a conversation state assistant.
The user was asked a confirmation question: "${draftContext.clarification_prompt || 'Are you sure?'}"
The user replied: "${trimmedText}"

Classify the user's reply into one of the following categories:
- 'accumulate': The user wants to accumulate, add to total, sum up, or combine values (e.g., "accumulate", "add to total", "sum them", "combine", "yes accumulate", "total").
- 'confirm': The user is agreeing, confirming, saying yes, or instructing to overwrite/update/replace (e.g., "yes", "overwrite", "do it", "replace", "yeah", "confirm").
- 'keep_both': The user wants to keep both entries as separate logs (e.g., "keep both", "separate", "add both", "keep separate").
- 'cancel': The user is denying, cancelling, or saying no (e.g., "no", "cancel", "dont", "skip").
- 'new_command': The user is typing a completely new topic.

Return ONLY one of these strings: 'accumulate', 'confirm', 'keep_both', 'cancel', or 'new_command'.`;

      const decisionText = await callLLM(config, confirmPrompt, trimmedText);
      const decision = decisionText.trim().toLowerCase();
      console.log('[state_machine] State Machine LLM Decision:', decision);

      if (decision.includes('accumulate')) isAccumulate = true;
      else if (decision.includes('confirm')) isConfirm = true;
      else if (decision.includes('keep_both')) isKeepBoth = true;
      else if (decision.includes('cancel')) isCancel = true;
    } catch (err) {
      console.error('[state_machine] LLM confirmation classification exception:', err);
    }
  }

  if (isAccumulate || isConfirm || isCancel || isKeepBoth) {
    console.log(`[state_machine] Triggered. User reply: "${trimmedText}". isAccumulate: ${isAccumulate}, isConfirm: ${isConfirm}, isCancel: ${isCancel}, isKeepBoth: ${isKeepBoth}`);

    // A. Deletion Confirmation
    if (draftContext.delete_entry_ids && draftContext.delete_entry_ids.length > 0) {
      if (isConfirm) {
        const validIds = draftContext.delete_entry_ids.filter((id: string) => uuidRegex.test(id));
        if (validIds.length > 0) {
          const { error } = await supabaseClient.from('entries').delete().in('id', validIds);
          if (error) throw new Error(error.message);
          return {
            handled: true,
            response: new Response(JSON.stringify({
              entry: null,
              acknowledgment: 'Successfully deleted the specified log entries.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          };
        }
      } else {
        return {
          handled: true,
          response: new Response(JSON.stringify({
            entry: null,
            acknowledgment: 'Deletion cancelled.',
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        };
      }
    }

    // B. Conflict / Overwrite / Accumulate Confirmation
    if (draftContext.update_entry_id) {
      const remainingBulkEntries = draftContext.bulk_entries && draftContext.bulk_entries.length > 1
        ? draftContext.bulk_entries.filter((e: any) => !(e.category === draftContext.category && (e.data?.meal_type === draftContext.data?.meal_type || e.category !== 'meal')))
        : [];

      if (isAccumulate && draftContext.accumulated_data) {
        const embedText = buildContextualPayload(draftContext.accumulated_text || draftContext.raw_text, draftContext.category, draftContext.accumulated_data, draftContext.entry_time);
        const embedding = await getEmbedding(embedText);

        const updatePayload: any = {
          user_id: userId,
          raw_text: draftContext.accumulated_text || draftContext.raw_text,
          category: draftContext.category,
          data: draftContext.accumulated_data,
          tags: draftContext.tags || [],
          event_date: draftContext.event_date || null
        };
        if (embedding) updatePayload.embedding = embedding;

        const { data: updated, error } = await supabaseClient.from('entries').update(updatePayload).eq('id', draftContext.update_entry_id).select();
        if (error) throw new Error(error.message);

        return {
          handled: true,
          response: new Response(JSON.stringify({
            entry: updated[0],
            acknowledgment: `Successfully accumulated ${draftContext.category} log into daily total! 📊`,
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        };
      } else if (isConfirm) {
        const embedText = buildContextualPayload(draftContext.raw_text, draftContext.category, draftContext.data || {}, draftContext.entry_time);
        const embedding = await getEmbedding(embedText);

        const updatePayload: any = {
          user_id: userId,
          raw_text: draftContext.raw_text,
          category: draftContext.category,
          entry_time: draftContext.entry_time || new Date().toISOString(),
          data: draftContext.data || {},
          tags: draftContext.tags || [],
          event_date: draftContext.event_date || null
        };
        if (embedding) updatePayload.embedding = embedding;

        const { data: updated, error } = await supabaseClient.from('entries').update(updatePayload).eq('id', draftContext.update_entry_id).select();
        if (error) throw new Error(error.message);

        // Insert remaining non-conflicting bulk entries if any
        if (remainingBulkEntries.length > 0) {
          const insertRows = [];
          for (const entry of remainingBulkEntries) {
            const raw = entry.raw_text || `${entry.category} entry`;
            const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
            const embedPayload = buildContextualPayload(raw, entry.category || 'other', entry.data || {}, entry.entry_time);
            const emb = await getEmbedding(embedPayload);

            insertRows.push({
              user_id: userId,
              raw_text: raw,
              category: entry.category || 'other',
              entry_time: entry.entry_time || new Date().toISOString(),
              data: entry.data || {},
              embedding: emb || undefined,
              tags: rowTags,
              event_date: entry.event_date || null
            });
          }
          await supabaseClient.from('entries').insert(insertRows);
        }

        return {
          handled: true,
          response: new Response(JSON.stringify({
            entry: updated[0],
            acknowledgment: remainingBulkEntries.length > 0
              ? `Updated ${draftContext.category} and logged ${remainingBulkEntries.length} remaining items!`
              : 'Successfully updated your existing entry.',
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        };
      } else if (isKeepBoth) {
        const entriesToInsert = draftContext.bulk_entries && draftContext.bulk_entries.length > 0
          ? draftContext.bulk_entries
          : [{ raw_text: draftContext.raw_text, category: draftContext.category, data: draftContext.data || {}, tags: draftContext.tags || [], event_date: draftContext.event_date || null }];

        const insertRows = [];
        for (const entry of entriesToInsert) {
          const raw = entry.raw_text || `${entry.category} entry`;
          const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
          const embedPayload = buildContextualPayload(raw, entry.category || 'other', entry.data || {}, entry.entry_time);
          const emb = await getEmbedding(embedPayload);

          insertRows.push({
            user_id: userId,
            raw_text: raw,
            category: entry.category || 'other',
            entry_time: entry.entry_time || new Date().toISOString(),
            data: entry.data || {},
            embedding: emb || undefined,
            tags: rowTags,
            event_date: entry.event_date || null
          });
        }

        const { data: inserted, error } = await supabaseClient.from('entries').insert(insertRows).select();
        if (error) throw new Error(error.message);

        return {
          handled: true,
          response: new Response(JSON.stringify({
            entry: inserted[0],
            acknowledgment: `Added ${inserted.length} entries.`,
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        };
      } else {
        // User cancelled the conflicting item — log remaining bulk items if any
        if (remainingBulkEntries.length > 0) {
          const insertRows = [];
          for (const entry of remainingBulkEntries) {
            const raw = entry.raw_text || `${entry.category} entry`;
            const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
            const embedPayload = buildContextualPayload(raw, entry.category || 'other', entry.data || {}, entry.entry_time);
            const emb = await getEmbedding(embedPayload);

            insertRows.push({
              user_id: userId,
              raw_text: raw,
              category: entry.category || 'other',
              entry_time: entry.entry_time || new Date().toISOString(),
              data: entry.data || {},
              embedding: emb || undefined,
              tags: rowTags,
              event_date: entry.event_date || null
            });
          }

          const { data: inserted, error } = await supabaseClient.from('entries').insert(insertRows).select();
          if (error) throw new Error(error.message);

          const itemsSummary = remainingBulkEntries.map((e: any) => e.raw_text).join(', ');
          return {
            handled: true,
            response: new Response(JSON.stringify({
              entry: inserted[0],
              acknowledgment: `Skipped ${draftContext.category} update. Successfully logged remaining item(s): "${itemsSummary}"! 🎬`,
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          };
        }

        return {
          handled: true,
          response: new Response(JSON.stringify({
            entry: null,
            acknowledgment: 'Cancelled.',
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        };
      }
    }
  }

  // Fall-through: User typed a completely new command or prompt
  return { handled: false };
}

function getDayBoundaryUTC(targetDateStr: string) {
  const [y, m, d] = targetDateStr.split('-').map(Number);
  const startUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - (5.5 * 3600 * 1000)).toISOString();
  const endUTC = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - (5.5 * 3600 * 1000)).toISOString();
  return { startUTC, endUTC };
}

/**
 * Check for duplicate entries (Sleep, Meals, Work, Exercise, Expense)
 */
export async function checkDuplicateConflict(
  parsed: any,
  trimmedText: string,
  userId: string,
  supabaseClient: any,
  finalImageUrl: string | null
): Promise<Response | null> {
  const targetDate = parsed.entry_time ? getIndianDateStr(parsed.entry_time) : getIndianDateStr();
  const { startUTC, endUTC } = getDayBoundaryUTC(targetDate);
  let conflictEntryId = null;
  let conflictDetails = '';
  let conflictingBulkIndex = -1;

  const itemsToCheck = parsed.action === 'bulk_insert' && parsed.bulk_entries && parsed.bulk_entries.length > 0
    ? parsed.bulk_entries
    : [parsed];

  for (let i = 0; i < itemsToCheck.length; i++) {
    const item = itemsToCheck[i];
    const itemCategory = item.category;
    const itemData = item.data || {};

    if (itemCategory === 'sleep') {
      const { data: conflicts } = await supabaseClient
        .from('entries')
        .select('id, data')
        .eq('user_id', userId)
        .eq('category', 'sleep')
        .gte('entry_time', startUTC)
        .lte('entry_time', endUTC);

      if (conflicts && conflicts.length > 0) {
        conflictEntryId = conflicts[0].id;
        conflictDetails = `sleep log (${conflicts[0].data?.hours || 8} hours)`;
        conflictingBulkIndex = i;
        break;
      }
    } else if (itemCategory === 'meal' && itemData?.meal_type) {
      const { data: conflicts } = await supabaseClient
        .from('entries')
        .select('id, data, raw_text')
        .eq('user_id', userId)
        .eq('category', 'meal')
        .eq('data->>meal_type', itemData.meal_type)
        .gte('entry_time', startUTC)
        .lte('entry_time', endUTC);

      if (conflicts && conflicts.length > 0) {
        conflictEntryId = conflicts[0].id;
        const existingText = conflicts[0].raw_text || conflicts[0].data?.items?.join(', ') || itemData.meal_type;
        conflictDetails = `${itemData.meal_type} log ("${existingText}")`;
        conflictingBulkIndex = i;
        break;
      }
    } else if (itemCategory === 'work') {
      const { data: conflicts } = await supabaseClient
        .from('entries')
        .select('id, data, raw_text')
        .eq('user_id', userId)
        .eq('category', 'work')
        .gte('entry_time', startUTC)
        .lte('entry_time', endUTC);

      if (conflicts && conflicts.length > 0) {
        conflictEntryId = conflicts[0].id;
        const prevHours = Number(conflicts[0].data?.duration_hours) || 0;
        const newHours = Number(itemData.duration_hours) || 0;
        const accumTotal = prevHours + newHours;
        const accumMsg = accumTotal > 0 ? ` (accumulate to ${accumTotal}h total)` : '';
        conflictDetails = `work log (${prevHours > 0 ? prevHours + 'h' : conflicts[0].raw_text})${accumMsg}`;
        conflictingBulkIndex = i;
        if (accumTotal > 0) {
          item.accumulated_data = { ...conflicts[0].data, duration_hours: accumTotal };
          item.accumulated_text = `Worked ${accumTotal} hours total (${conflicts[0].raw_text} + ${item.raw_text || newHours + 'h'})`;
        }
        break;
      }
    } else if (itemCategory === 'exercise') {
      const { data: conflicts } = await supabaseClient
        .from('entries')
        .select('id, data, raw_text')
        .eq('user_id', userId)
        .eq('category', 'exercise')
        .gte('entry_time', startUTC)
        .lte('entry_time', endUTC);

      if (conflicts && conflicts.length > 0) {
        conflictEntryId = conflicts[0].id;
        const prevMins = Number(conflicts[0].data?.duration_minutes) || 0;
        const newMins = Number(itemData.duration_minutes) || 0;
        const accumTotal = prevMins + newMins;
        const accumMsg = accumTotal > 0 ? ` (accumulate to ${accumTotal} mins total)` : '';
        conflictDetails = `exercise log (${prevMins > 0 ? prevMins + ' mins' : conflicts[0].raw_text})${accumMsg}`;
        conflictingBulkIndex = i;
        if (accumTotal > 0) {
          item.accumulated_data = { ...conflicts[0].data, duration_minutes: accumTotal };
          item.accumulated_text = `${itemData.activity || 'Exercise'} for ${accumTotal} mins total`;
        }
        break;
      }
    } else if (itemCategory === 'expense') {
      const { data: conflicts } = await supabaseClient
        .from('entries')
        .select('id, data, raw_text')
        .eq('user_id', userId)
        .eq('category', 'expense')
        .gte('entry_time', startUTC)
        .lte('entry_time', endUTC);

      if (conflicts && conflicts.length > 0) {
        conflictEntryId = conflicts[0].id;
        const prevAmount = Number(conflicts[0].data?.amount) || 0;
        const newAmount = Number(itemData.amount) || 0;
        const accumTotal = prevAmount + newAmount;
        const accumMsg = accumTotal > 0 ? ` (accumulate to ₹${accumTotal} total)` : '';
        conflictDetails = `expense log (₹${prevAmount})${accumMsg}`;
        conflictingBulkIndex = i;
        if (accumTotal > 0) {
          item.accumulated_data = { ...conflicts[0].data, amount: accumTotal };
          item.accumulated_text = `₹${accumTotal} total spent (${conflicts[0].data?.description || conflicts[0].raw_text} + ${itemData.description || item.raw_text})`;
        }
        break;
      }
    }
  }

  if (conflictEntryId) {
    console.log(`[state_machine] Conflict intercepted: ${conflictDetails} (ID: ${conflictEntryId})`);
    parsed.needs_clarification = true;
    parsed.update_entry_id = conflictEntryId;
    parsed.clarification_prompt = `You already logged a ${conflictDetails} for ${targetDate}. Do you want to update it, or keep both?`;

    parsed.raw_text = trimmedText;
    parsed.entry_time = parsed.entry_time || new Date().toISOString();
    if (!parsed.tags) parsed.tags = [];

    if (parsed.action === 'bulk_insert' && conflictingBulkIndex >= 0) {
      const conflictingItem = parsed.bulk_entries[conflictingBulkIndex];
      parsed.category = conflictingItem.category;
      parsed.data = conflictingItem.data;
      parsed.raw_text = conflictingItem.raw_text;
    }

    if (finalImageUrl) {
      parsed.imageUrl = finalImageUrl;
    }

    return new Response(JSON.stringify({
      entry: null,
      acknowledgment: parsed.clarification_prompt,
      needs_clarification: true,
      draftContext: parsed,
      interactiveCard: null,
    }), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }

  return null;
}
