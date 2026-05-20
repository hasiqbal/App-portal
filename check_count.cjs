const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://erwtsmhykudttxbeerwt.backend.onspace.ai';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJlcnd0c21oeWt1ZHR0eGJlZXJ3dCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc1MzkxMzA2LCJleHAiOjIwOTA3NTEzMDYsImlzcyI6Im9uc3BhY2UifQ.Hf7P7Ng8X86cAAQKtKr3EM4ovn2R4bCT61RYrb__rKg';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { count, error } = await supabase
    .from('device_tokens')
    .select('*', { count: 'exact', head: true });
  if (error) console.error(error);
  else console.log('Total devices:', count);
}
run();
