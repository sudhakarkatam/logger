// supabase/functions/message/classifier.ts

export interface ParsedRoute {
  intent: 'LOG' | 'QUERY' | 'CHAT' | null;
  isQuantitative: boolean;
  targetCategories: string[];
  mathParams?: {
    category: string;
    op: 'count' | 'sum' | 'avg';
    field: string | null;
    filter_key: string | null;
    filter_val: string | null;
    days: number;
  };
}

export function classifyIntent(text: string, hasImage: boolean, hasDraftContext: boolean): ParsedRoute {
  const lower = text.toLowerCase().trim();

  // If an image is attached, force LOG
  if (hasImage) {
    return { intent: 'LOG', isQuantitative: false, targetCategories: [] };
  }

  // Explicit force-log keywords or prefixes
  const forceLogKeywords = [
    'log this message', 'log this', 'remember this', 'remember to', 'save this',
    'remind me to', 'note down', 'note this', 'log it', 'remember it'
  ];
  const isExplicitLogPrefix = lower.startsWith('log ') ||
    lower.startsWith('log for ') ||
    lower.startsWith('log note:') ||
    lower.startsWith('log meal:') ||
    lower.startsWith('log sleep:') ||
    lower.startsWith('log expense:');

  if (forceLogKeywords.some(kw => lower.includes(kw)) || isExplicitLogPrefix) {
    return { intent: 'LOG', isQuantitative: false, targetCategories: [] };
  }

  // Question & query keywords
  const questionPrefixes = [
    'can i', 'can we', 'may i', 'should i', 'could i', 'is it', 'do i', 'does ', 'what if',
    'how can', 'why ', 'shall i', 'am i', 'are we', 'would it', 'can u', 'can you', 'is there', 'are there',
    'question'
  ];
  const isQuestionPhrase = questionPrefixes.some(qp => lower.startsWith(qp) || lower.includes(` ${qp}`)) || lower.endsWith('?');

  const queryKeywords = [
    'today logs', 'today\'s logs', 'todays logs', 'show logs', 'my logs', 'recent logs', 'all logs', 'get logs', 'view logs', 'log history',
    'show', 'display', 'list', 'what', 'how', 'when', 'where', 'did i', 'have i', 'history', 'summary', 'report', 'tell me',
    'what did i', 'show me', 'list my', 'get my', 'view my', 'check my', 'find my', 'any logs', 'my entries'
  ];
  const isQueryPhrase = (isQuestionPhrase || queryKeywords.some(kw => lower.includes(kw))) && !isExplicitLogPrefix;
  const isSingleWordCategory = ['sleep', 'expense', 'expenses', 'meals', 'meal', 'mood', 'exercise', 'exercises', 'history', 'logs'].includes(lower);
  const onlyHashtagsRegex = /^#[a-zA-Z0-9\-_]+(\s+#[a-zA-Z0-9\-_]+)*$/;

  if (isQueryPhrase || isSingleWordCategory || onlyHashtagsRegex.test(text.trim())) {
    const isQuantitative = /(how\s+(many|much)|total|average|avg|sum\s+of|frequency\s+of|how\s+often)/i.test(lower);
    const targetCategories = detectCategories(lower);
    let mathParams;
    if (isQuantitative) {
      mathParams = extractMathParams(lower);
    }
    return { intent: 'QUERY', isQuantitative, targetCategories, mathParams };
  }

  // Force LOG: explicit logging verbs
  const explicitLoggingVerbs = [
    'spent', 'paid', 'bought', 'cost', 'costs', 'purchase', 'purchased', 'buy',
    'ate', 'had', 'drank', 'ordered', 'eating', 'drinking',
    'slept', 'sleep', 'sleeping',
    'ran', 'walked', 'exercised', 'gym', 'workout', 'jog', 'jogged', 'swam', 'jogging', 'walking', 'running',
    'log', 'save', 'remember', 'note', 'record', 'add', 'create', 'write',
    'work', 'worked'
  ];
  if (explicitLoggingVerbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(lower))) {
    return { intent: 'LOG', isQuantitative: false, targetCategories: [] };
  }

  // Casual pleasantries / chat phrases
  const isConversationalPleasantry = /^(good|nice|cool|great)\s+(buddy|job|night|morning|afternoon|evening|work|one|thanks|thank you|bro|man)/i.test(lower) ||
    /(sounds|looks|all|that's|is)\s+good/i.test(lower) ||
    /^(hi|hello|hey|good|nice|cool|awesome|great|ok|okay|thanks|thank you|sup|yo)$/i.test(lower);

  if (isConversationalPleasantry) {
    return { intent: 'CHAT', isQuantitative: false, targetCategories: [] };
  }

  // Ambiguous: return null to allow fallback LLM classifier
  return { intent: null, isQuantitative: false, targetCategories: detectCategories(lower) };
}

// Category detection via keyword mapping (replaces LLM Category Router)
export function detectCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const map: Record<string, string[]> = {
    meal: ['eat', 'ate', 'food', 'meal', 'breakfast', 'lunch', 'dinner', 'snack', 'oats', 'biryani', 'chicken', 'rice', 'cook', 'nutrition', 'calories', 'skip', 'skipped', 'drink', 'drank', 'coffee', 'tea'],
    sleep: ['sleep', 'slept', 'nap', 'rest', 'hours of sleep', 'insomnia', 'woke', 'wake'],
    expense: ['spent', 'spend', 'expense', 'cost', 'paid', 'bill', 'bills', 'bought', 'purchase', 'rupees', 'inr', 'rs', 'money', 'wifi', 'rent'],
    mood: ['mood', 'feeling', 'happy', 'sad', 'anxious', 'stressed', 'tired', 'frustrated', 'exhausted', 'horrible', 'depressed', 'excited', 'good', 'bad'],
    exercise: ['exercise', 'workout', 'gym', 'run', 'walk', 'jog', 'swim', 'cycling', 'workout', 'fitness', 'steps', 'km'],
    work: ['work', 'worked', 'project', 'meeting', 'coding', 'office', 'laptop', 'client', 'study', 'studied']
  };

  const isGeneral = ['log', 'logs', 'history', 'everything', 'all', 'summary', 'summarize', 'report', 'show all', 'list all'].some(kw => lower.includes(kw));
  if (isGeneral) {
    return ['meal', 'sleep', 'expense', 'mood', 'exercise', 'work', 'other'];
  }

  const matched: string[] = [];
  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(kw => lower.includes(kw))) {
      matched.push(cat);
    }
  }
  return matched.length > 0 ? matched : ['meal', 'sleep', 'expense', 'mood', 'exercise', 'work', 'other'];
}

// Extract quantitative parameters deterministically where possible
export function extractMathParams(text: string): { category: string; op: 'count' | 'sum' | 'avg'; field: string | null; filter_key: string | null; filter_val: string | null; days: number; } | undefined {
  const lower = text.toLowerCase();

  // Days lookback
  let days = 30;
  const daysMatch = lower.match(/(\d+)\s*days?/);
  const monthsMatch = lower.match(/(\d+)\s*months?/);
  const weeksMatch = lower.match(/(\d+)\s*weeks?/);
  const yearsMatch = lower.match(/(\d+)\s*years?/);
  if (daysMatch) {
    days = parseInt(daysMatch[1], 10);
  } else if (monthsMatch) {
    days = parseInt(monthsMatch[1], 10) * 30;
  } else if (weeksMatch) {
    days = parseInt(weeksMatch[1], 10) * 7;
  } else if (yearsMatch) {
    days = parseInt(yearsMatch[1], 10) * 365;
  } else if (lower.includes('today') || lower.includes('yesterday')) {
    days = 1;
  } else if (lower.includes('week')) {
    days = 7;
  } else if (lower.includes('month')) {
    days = 30;
  } else if (lower.includes('year')) {
    days = 365;
  }

  // Operation
  let op: 'count' | 'sum' | 'avg' = 'count';
  if (lower.includes('total') || lower.includes('sum') || lower.includes('how much')) {
    op = 'sum';
  } else if (lower.includes('average') || lower.includes('avg')) {
    op = 'avg';
  }

  // Category & Fields
  if (lower.includes('spent') || lower.includes('expense') || lower.includes('cost') || lower.includes('money') || lower.includes('bill')) {
    let filterKey: string | null = null;
    let filterVal: string | null = null;
    if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant') || lower.includes('biryani') || lower.includes('snack')) {
      filterKey = 'subcategory';
      filterVal = 'food';
    } else if (lower.includes('bill') || lower.includes('wifi') || lower.includes('electricity') || lower.includes('rent')) {
      filterKey = 'subcategory';
      filterVal = 'bills';
    } else if (lower.includes('travel') || lower.includes('transport') || lower.includes('cab') || lower.includes('auto') || lower.includes('fuel')) {
      filterKey = 'subcategory';
      filterVal = 'transport';
    }
    return {
      category: 'expense',
      op: op === 'count' && lower.includes('how many') ? 'count' : 'sum',
      field: 'amount',
      filter_key: filterKey,
      filter_val: filterVal,
      days
    };
  }

  if (lower.includes('sleep') || lower.includes('slept')) {
    return {
      category: 'sleep',
      op: op === 'count' && lower.includes('how many times') ? 'count' : (op === 'count' ? 'sum' : op),
      field: 'hours',
      filter_key: null,
      filter_val: null,
      days
    };
  }

  if (lower.includes('work') || lower.includes('worked')) {
    return {
      category: 'work',
      op: op === 'count' && lower.includes('how many times') ? 'count' : (op === 'count' ? 'sum' : op),
      field: 'duration_hours',
      filter_key: null,
      filter_val: null,
      days
    };
  }

  if (lower.includes('exercise') || lower.includes('workout') || lower.includes('gym') || lower.includes('run') || lower.includes('walk')) {
    return {
      category: 'exercise',
      op: op === 'count' && lower.includes('how many times') ? 'count' : (op === 'count' ? 'sum' : op),
      field: 'duration_minutes',
      filter_key: null,
      filter_val: null,
      days
    };
  }

  // Meals / Food items
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (const mt of mealTypes) {
    if (lower.includes(mt)) {
      return {
        category: 'meal',
        op: 'count',
        field: null,
        filter_key: 'meal_type',
        filter_val: mt,
        days
      };
    }
  }

  // Dynamic food / item extraction for meals (e.g. "how many times I had pasta / noodles / salmon / oats")
  const foodActionMatch = lower.match(/(?:how\s+many\s+times\s+(?:did\s+i\s+|i\s+)?(?:had|have|ate|eat|drink|drank|ordered|consume)\s+)([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)/i);
  if (foodActionMatch && foodActionMatch[1]) {
    const rawItem = foodActionMatch[1].trim();
    const cleanItem = rawItem.replace(/\b(in|for|past|last|this|today|yesterday|during|at|a|an|the)\b.*$/i, '').trim();
    if (cleanItem && cleanItem.length >= 2 && !mealTypes.includes(cleanItem)) {
      return {
        category: 'meal',
        op: 'count',
        field: null,
        filter_key: 'items',
        filter_val: cleanItem,
        days
      };
    }
  }

  // Fallback default
  return {
    category: 'meal',
    op,
    field: null,
    filter_key: null,
    filter_val: null,
    days
  };
}

// Fallback LLM Intent Classifier for genuinely ambiguous messages
export async function fallbackLLMClassifyIntent(
  config: any,
  trimmedText: string,
  history: any[],
  draftContext: any,
  callLLM: (config: any, sys: string, user: string) => Promise<string>
): Promise<'LOG' | 'QUERY' | 'CHAT'> {
  try {
    const classifierPrompt = `You are an intent classifier for a personal AI companion.
Analyze the user's message: "${trimmedText}"
${history && history.length > 0 ? `\nRecent conversation history:\n${history.slice(-4).map((h: any) => `${h.role}: "${h.content}"`).join('\n')}\n` : ''}
${draftContext ? `Pending Clarification Question: "${draftContext.clarification_prompt}"\n` : ''}

Classify into ONE of 3 categories:
- 'QUERY': User is asking to view, list, check, search, summarize, or ask questions about existing stored logs, history, or pantry (e.g. "today logs", "show logs", "what did I eat", "how much spent").
- 'LOG': User is instructing to record, log, save, or add structured data/metrics/activities, or replying to a pending log prompt (e.g. "log for last 3 days", "ate oats", "spent 200", "slept 7 hours", "log I am frustrated", "worked 4h").
- 'CHAT': Greetings, casual remarks, conversational chitchat, or direct answers to Buddy's previous non-log questions (e.g. "hi", "bad", "fine", "will meet afternoon", "asking you", "thanks", "ok").

Reply with strictly ONE word: 'LOG', 'QUERY', or 'CHAT'.`;

    const check = await callLLM(config, classifierPrompt, trimmedText);
    const res = check.toUpperCase().trim();
    if (res.includes('QUERY')) return 'QUERY';
    if (res.includes('LOG')) return 'LOG';
    return 'CHAT';
  } catch (_) {
    return 'CHAT';
  }
}

// Conversational Follow-Up Query Context Rewriter
export async function rewriteFollowUp(
  config: any,
  trimmedText: string,
  history: any[],
  callLLM: (config: any, sys: string, user: string) => Promise<string>
): Promise<string> {
  if (!history || history.length === 0) return trimmedText;

  try {
    const contextualizerPrompt = `You are a conversational query context resolver.
Given the recent conversation history and the user's latest message, rephrase the latest message into a standalone, self-contained search query.

Rules:
1. If the user's latest message is a follow-up query, layout request, date filter, or refinement, resolve implicit topics and categories from the conversation history so that the rephrased query is 100% self-contained.
2. If the latest message is already self-contained, return it unchanged.
3. Do NOT answer the question. Return ONLY the single rephrased query text string without quotes or explanations.`;

    const contextHistoryText = history.slice(-6).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n');
    const reworded = await callLLM(config, contextualizerPrompt, `CONVERSATION HISTORY:\n${contextHistoryText}\n\nLATEST USER MESSAGE: "${trimmedText}"`);
    if (reworded && reworded.trim()) {
      return reworded.trim().replace(/^["']|["']$/g, '');
    }
  } catch (err) {
    console.warn('[rewriteFollowUp] Contextual query rewriter failed, falling back to raw query:', err);
  }
  return trimmedText;
}
