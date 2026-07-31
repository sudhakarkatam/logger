try {
  require('react-native-url-polyfill/auto');
} catch (_) {
  // Global URL is already natively supported in modern React Native / Hermes
}
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://szfjzwltuhbpobkjpobj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Zmp6d2x0dWhicG9ia2pwb2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjMwOTYsImV4cCI6MjA5OTIzOTA5Nn0.qcMhipSeeCryChFDp904tpZLjpmyjkqHqg3TGa0hEMw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
