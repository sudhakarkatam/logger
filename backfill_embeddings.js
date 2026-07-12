// backfill_embeddings.js
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://szfjzwltuhbpobkjpobj.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseAnonKey) {
  console.error('Error: Neither VITE_SUPABASE_ANON_KEY nor SUPABASE_KEY is defined in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function backfill() {
  console.log('Fetching entries with NULL embeddings...');
  
  // 1. Fetch all entries where embedding is null
  const { data: entries, error: fetchErr } = await supabase
    .from('entries')
    .select('id, category, raw_text, data')
    .is('embedding', null);

  if (fetchErr) {
    console.error('Error fetching entries:', fetchErr.message);
    return;
  }

  if (!entries || entries.length === 0) {
    console.log('No entries with NULL embeddings found. All entries are up to date! 🎉');
    return;
  }

  console.log(`Found ${entries.length} entries to backfill. Starting generation...`);

  // 2. Loop through and update each entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const embedPayload = `${entry.category}: ${entry.raw_text} - Data: ${JSON.stringify(entry.data)}`;
    console.log(`[${i+1}/${entries.length}] Generating embedding for: "${entry.raw_text.substring(0, 30)}..."`);

    try {
      // Call the deployed 'embed' function to generate the 768-dimensional vector
      const embedUrl = `${supabaseUrl}/functions/v1/embed`;
      const res = await fetch(embedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({ text: embedPayload })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`  ❌ Failed to get embedding (HTTP ${res.status}): ${errText}`);
        continue;
      }

      const json = await res.json();
      const embedding = json.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        console.error('  ❌ Embedding response did not contain a valid vector array.');
        continue;
      }

      // 3. Update the entry row in Supabase
      const { error: updateErr } = await supabase
        .from('entries')
        .update({ embedding })
        .eq('id', entry.id);

      if (updateErr) {
        console.error(`  ❌ Database update error for row ${entry.id}:`, updateErr.message);
      } else {
        console.log(`  ✅ Successfully updated row (vector length: ${embedding.length})`);
      }

    } catch (err) {
      console.error(`  ❌ Network/unhandled error:`, err.message);
    }
  }

  console.log('\nBackfill task completed!');
}

backfill();
