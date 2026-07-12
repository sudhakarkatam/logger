// test_key.js
const API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";

async function testEmbedding() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${API_KEY}`;
  
  console.log('Testing embedding model (text-embedding-004)...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: 'Test embedding text' }] }
      })
    });
    
    console.log('Status Code:', res.status);
    const json = await res.json();
    console.log('Response JSON:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error occurred:', err.message);
  }
}

testEmbedding();
