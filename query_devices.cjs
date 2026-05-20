const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://erwtsmhykudttxbeerwt.backend.onspace.ai';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJlcnd0c21oeWt1ZHR0eGJlZXJ3dCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc1MzkxMzA2LCJleHAiOjIwOTA3NTEzMDYsImlzcyI6Im9uc3BhY2UifQ.Hf7P7Ng8X86cAAQKtKr3EM4ovn2R4bCT61RYrb__rKg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const threeDaysAgoStart = new Date(todayStart);
  threeDaysAgoStart.setUTCDate(todayStart.getUTCDate() - 2); // Today (1) + Yesterday (2) + Day Before (3) ? 
  // "Last 3 days" usually means 3 * 24h or Current UTC Date - 2 to include today.
  // Let's use 3 days ago from now for a 72h window or from start of day. 
  // "installed_last_3_days": let's say registered_at >= today - 2 days (i.e. if today is 23rd, includes 21, 22, 23).
  // Or simply registered_at >= 3 days ago.
  
  const date3Days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const dateToday = todayStart.toISOString();

  const { data, error } = await supabase
    .from('device_tokens')
    .select('platform, registered_at');

  if (error) {
    console.error(error);
    return;
  }

  const result = {
    installed_today: { ios: 0, android: 0, total: 0 },
    installed_last_3_days: { ios: 0, android: 0, total: 0 }
  };

  data.forEach(d => {
    const regDate = new Date(d.registered_at);
    const platform = (d.platform || '').toLowerCase();
    
    if (regDate >= todayStart) {
      result.installed_today.total++;
      if (platform === 'ios') result.installed_today.ios++;
      else if (platform === 'android') result.installed_today.android++;
    }
    
    if (regDate >= new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) {
      result.installed_last_3_days.total++;
      if (platform === 'ios') result.installed_last_3_days.ios++;
      else if (platform === 'android') result.installed_last_3_days.android++;
    }
  });

  console.log(JSON.stringify(result, null, 2));
}

run();
