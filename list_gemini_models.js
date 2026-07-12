// list_gemini_models.js
const API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  
  console.log('Fetching available models from Google Gemini API...');
  try {
    const res = await fetch(url);
    console.log('Status Code:', res.status);
    const json = await res.json();
    if (json.error) {
      console.error('Error Response:', json.error);
    } else {
      const models = json.models || [];
      console.log(`Found ${models.length} models:`);
      models.forEach(m => {
        if (m.name.includes('embed')) {
          console.log(`- Name: ${m.name}`);
          console.log(`  Supported methods: ${m.supportedGenerationMethods.join(', ')}`);
        }
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

listModels();
