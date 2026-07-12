// test_embeddings.js
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

async function runTest() {
  console.log('--- TEST 1: Calling the "embed" Edge Function ---');
  try {
    const embedUrl = `${supabaseUrl}/functions/v1/embed`;
    console.log(`Sending fetch request to: ${embedUrl}`);
    
    const res = await fetch(embedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({ text: 'Testing if the newly deployed embed microservice generates vector dimensions' })
    });
    
    console.log('HTTP Status:', res.status);
    const json = await res.json();
    if (json.error) {
      console.error('Edge Function Error Response:', json.error);
    } else {
      const embedding = json.embedding;
      console.log('Embedding type:', typeof embedding);
      console.log('Is Array?', Array.isArray(embedding));
      console.log('Length (dimensions):', embedding ? embedding.length : 0);
      if (embedding) {
        console.log('First 5 values:', embedding.slice(0, 5));
      }
    }
  } catch (err) {
    console.error('Failed to contact "embed" Edge Function:', err.message);
  }
}

runTest();
