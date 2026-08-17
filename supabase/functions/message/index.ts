// supabase/functions/message/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { classifyIntent, fallbackLLMClassifyIntent, rewriteFollowUp } from './classifier.ts';
import { handleStateMachine, checkDuplicateConflict } from './state_machine.ts';
import { retrieveContext, buildContextualPayload, getEmbedding } from './retriever.ts';
import { rerankLogs } from './reranker.ts';
import {
  callLLM,
  synthesizeQueryAnswer,
  synthesizeChatReply,
  synthesizeLogEntry
} from './synthesis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { text, userId = 1, draftContext = null, config, history = [], imageUrl } = body;

    console.log('[serve] Received request payload:', JSON.stringify({
      text: body.text,
      userId,
      hasDraftContext: !!draftContext,
      historyLength: history?.length || 0,
      imageUrl: imageUrl || 'none',
      provider: config?.provider
    }));

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Message text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedText = text.trim();
    const finalImageUrl = imageUrl || draftContext?.imageUrl || null;

    // ── STEP 1: DETERMINISTIC CONFIRMATION STATE MACHINE ──
    if (draftContext) {
      const smResult = await handleStateMachine(
        draftContext,
        trimmedText,
        userId,
        supabaseClient,
        config,
        corsHeaders,
        callLLM
      );
      if (smResult.handled && smResult.response) {
        return smResult.response;
      }
    }

    // ── STEP 2: FAST INTENT ROUTER ──
    const route = classifyIntent(trimmedText, !!finalImageUrl, !!draftContext);
    let intent = route.intent;

    if (!intent) {
      intent = await fallbackLLMClassifyIntent(config, trimmedText, history, draftContext, callLLM);
    }
    console.log(`[serve] Resolved intent: ${intent}`);

    // ── STEP 3A: CHAT INTENT (CONVERSATIONAL FRIEND & AUTO MOOD LOG) ──
    if (intent === 'CHAT') {
      const chatReply = await synthesizeChatReply(config, trimmedText, history, userId, supabaseClient);
      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: chatReply,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STEP 3B: QUERY INTENT (PARALLEL RAG & TWO-STAGE RE-RANKING) ──
    if (intent === 'QUERY') {
      const effectiveQuery = await rewriteFollowUp(config, trimmedText, history, callLLM);
      const retrieved = await retrieveContext(effectiveQuery, route, userId, supabaseClient);
      const rerankLimit = route.isQuantitative ? 30 : 10;
      const rerankedLogs = rerankLogs(effectiveQuery, retrieved.candidates, rerankLimit);
      const answer = await synthesizeQueryAnswer(config, effectiveQuery, rerankedLogs, retrieved, history);

      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: answer,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STEP 3C: LOG INTENT (STRUCTURED LOGGING & DUPLICATE CHECKS) ──
    const { data: recentEntries } = await supabaseClient
      .from('entries')
      .select('id, raw_text, category, entry_time, data, tags')
      .eq('user_id', userId)
      .order('entry_time', { ascending: false })
      .limit(15);

    const parsed = await synthesizeLogEntry(config, trimmedText, history, recentEntries || [], finalImageUrl);
    console.log('[serve] Structured LLM Parse:', JSON.stringify(parsed));

    // Programmatic Doubt-Buster Guard
    const explicitLoggingVerbs = [
      'spent', 'paid', 'bought', 'cost', 'costs', 'purchase', 'purchased', 'buy',
      'ate', 'had', 'drank', 'ordered', 'eating', 'drinking',
      'slept', 'sleep', 'sleeping',
      'ran', 'walked', 'exercised', 'gym', 'workout', 'jog', 'jogged', 'swam', 'jogging', 'walking', 'running',
      'log', 'save', 'remember', 'note', 'record', 'add', 'create', 'write',
      'work', 'worked'
    ];
    const hasExplicitVerb = explicitLoggingVerbs.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(trimmedText));
    const hasStructuredMetric = /\d+\s*(h|hr|hrs|hours|min|mins|minutes|km|kg|ml|l|inr|rs|rupees|days|d|%)/i.test(trimmedText);
    const hasValidParsedData = parsed.category && parsed.category !== 'other' && (
      (parsed.category === 'sleep' && Number(parsed.data?.hours) > 0) ||
      (parsed.category === 'expense' && (Number(parsed.data?.amount) > 0 || parsed.data?.description)) ||
      (parsed.category === 'meal' && (parsed.data?.items?.length > 0 || parsed.data?.meal_type)) ||
      (parsed.category === 'work' && (Number(parsed.data?.duration_hours) > 0 || parsed.data?.description)) ||
      (parsed.category === 'exercise' && (parsed.data?.activity || Number(parsed.data?.duration_minutes) > 0)) ||
      (parsed.action === 'bulk_insert' && parsed.bulk_entries && parsed.bulk_entries.length > 0)
    );

    if (intent === 'LOG' && !finalImageUrl && !hasExplicitVerb && !hasStructuredMetric && !hasValidParsedData && !parsed.needs_clarification) {
      console.log(`[serve] Programmatic Doubt-Buster triggered: "${trimmedText}".`);
      parsed.needs_clarification = true;
      parsed.clarification_prompt = `I noticed you mentioned '${trimmedText}'. Did you want me to log this, or is it just a comment?`;
    }

    if (parsed.delete_entry_ids) {
      parsed.delete_entry_ids = parsed.delete_entry_ids.filter((id: string) => uuidRegex.test(id));
      if (parsed.delete_entry_ids.length === 0) parsed.delete_entry_ids = null;
    }
    if (parsed.update_entry_id && !uuidRegex.test(parsed.update_entry_id)) {
      parsed.update_entry_id = null;
    }

    // Check for Duplicate Conflict
    if ((parsed.action === 'insert' || parsed.action === 'bulk_insert') && !parsed.needs_clarification) {
      const conflictResponse = await checkDuplicateConflict(parsed, trimmedText, userId, supabaseClient, finalImageUrl);
      if (conflictResponse) {
        return conflictResponse;
      }
    }

    if (parsed.needs_clarification) {
      parsed.raw_text = trimmedText;
      parsed.entry_time = parsed.entry_time || new Date().toISOString();
      if (!parsed.tags) parsed.tags = [];
      if (finalImageUrl) parsed.imageUrl = finalImageUrl;

      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: parsed.clarification_prompt,
        needs_clarification: true,
        draftContext: parsed,
        interactiveCard: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (finalImageUrl) {
      if (!parsed.data) parsed.data = {};
      parsed.data.image_url = finalImageUrl;
    }

    // Contextual Embedding
    const embedPayload = buildContextualPayload(trimmedText, parsed.category, parsed.data, parsed.entry_time);
    const embedding = await getEmbedding(embedPayload);

    const insertPayload: any = {
      user_id: userId,
      raw_text: trimmedText,
      category: parsed.category,
      entry_time: parsed.entry_time || new Date().toISOString(),
      data: parsed.data,
      tags: parsed.tags || [],
      event_date: parsed.event_date || null
    };
    if (embedding) insertPayload.embedding = embedding;

    // Handle Update Action
    if (parsed.action === 'update' && parsed.update_entry_id) {
      console.log('[serve] Updating existing entry ID:', parsed.update_entry_id);
      const { data: updated, error } = await supabaseClient
        .from('entries')
        .update(insertPayload)
        .eq('id', parsed.update_entry_id)
        .select();

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({
        entry: updated[0],
        acknowledgment: updated[0] ? (parsed.acknowledgment || 'Entry updated successfully.') : 'No matching log found to update.',
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle Bulk Insert Action
    if (parsed.action === 'bulk_insert' && parsed.bulk_entries && parsed.bulk_entries.length > 0) {
      console.log(`[serve] Direct Bulk Inserting ${parsed.bulk_entries.length} entries...`);
      const insertRows = [];
      for (const entry of parsed.bulk_entries) {
        const raw = entry.raw_text || `${entry.category} entry`;
        const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
        const rowEmbedPayload = buildContextualPayload(raw, entry.category || 'other', entry.data || {}, entry.entry_time);
        const rowEmbedding = await getEmbedding(rowEmbedPayload);

        insertRows.push({
          user_id: userId,
          raw_text: raw,
          category: entry.category || 'other',
          entry_time: entry.entry_time || new Date().toISOString(),
          data: entry.data || {},
          embedding: rowEmbedding || undefined,
          tags: rowTags,
          event_date: entry.event_date || null
        });
      }

      const { data: inserted, error } = await supabaseClient.from('entries').insert(insertRows).select();
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({
        entry: inserted[0],
        acknowledgment: parsed.acknowledgment || `Successfully logged ${inserted.length} separate items.`,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Standard Insert Action
    console.log('[serve] Inserting new log entry to database...');
    const { data: inserted, error } = await supabaseClient.from('entries').insert([insertPayload]).select();
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({
      entry: inserted[0],
      acknowledgment: parsed.acknowledgment,
      needs_clarification: false,
      draftContext: null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[serve] Uncaught error in Edge Function:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
