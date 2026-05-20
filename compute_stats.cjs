const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'supabase.ts'), 'utf8');
const urlMatch = content.match(/const LEGACY_EXTERNAL_SUPABASE_URL = '(.*?)'/);
const keyMatch = content.match(/const LEGACY_EXTERNAL_SUPABASE_ANON_KEY = '(.*?)'/);

if (!urlMatch || !keyMatch) {
  console.error('Could not find constants in src/lib/supabase.ts');
  process.exit(1);
}

const URL = urlMatch[1];
const KEY = keyMatch[1];

async function run() {
  const response = await fetch(`${URL}/rest/v1/device_tokens?select=*`, {
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`
    }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch: ' + response.statusText);
  }
  const data = await response.json();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysAgoStart = new Date(todayStart);
  threeDaysAgoStart.setDate(todayStart.getDate() - 2);

  const counts = {
    today: { ios: 0, android: 0 },
    last_3_days: { ios: 0, android: 0 }
  };

  data.forEach(row => {
    const regDate = new Date(row.registered_at);
    const platform = row.platform;

    if (regDate >= todayStart) {
      if (counts.today[platform] !== undefined) counts.today[platform]++;
    }
    if (regDate >= threeDaysAgoStart) {
      if (counts.last_3_days[platform] !== undefined) counts.last_3_days[platform]++;
    }
  });

  console.log(JSON.stringify(counts, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
