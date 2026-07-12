import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const userId = parseInt(url.searchParams.get('userId') || '1');
    const days = parseInt(url.searchParams.get('days') || '7');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Fetch entries excluding the massive 'embedding' vector column for high-speed delivery
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('id, user_id, raw_text, category, entry_time, data, created_at')
      .eq('user_id', userId)
      .gte('entry_time', cutoffDate.toISOString())
      .order('entry_time', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Group entries by category
    const grouped: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
      if (!grouped[entry.category]) {
        grouped[entry.category] = [];
      }
      grouped[entry.category].push({
        id: entry.id,
        user_id: entry.user_id,
        raw_text: entry.raw_text,
        category: entry.category,
        entry_time: entry.entry_time,
        data: entry.data,
        created_at: entry.created_at
      });
    });

    // Group entries by day
    const byDay: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
      const day = (entry.entry_time || new Date().toISOString()).split('T')[0];
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push({
        id: entry.id,
        user_id: entry.user_id,
        raw_text: entry.raw_text,
        category: entry.category,
        entry_time: entry.entry_time,
        data: entry.data,
        created_at: entry.created_at
      });
    });

    // Compute summary stats
    const stats = {
      totalEntries: entries.length,
      categories: Object.keys(grouped).map(cat => ({
        category: cat,
        count: grouped[cat].length,
      })),
      daysLogged: Object.keys(byDay).length,
      mostActiveCategory: Object.keys(grouped).sort(
        (a, b) => grouped[b].length - grouped[a].length
      )[0] || null,
    };

    return new Response(JSON.stringify({ 
      entries: entries.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        raw_text: e.raw_text,
        category: e.category,
        entry_time: e.entry_time,
        data: e.data,
        created_at: e.created_at
      })), 
      grouped, 
      byDay, 
      stats 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
