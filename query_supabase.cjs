const URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';

async function run() {
  const headers = {
    'apikey': KEY,
    'Authorization': 'Bearer ' + KEY
  };

  try {
    // 1) Query device_tokens
    const tokensRes = await fetch(URL + '/rest/v1/device_tokens?select=platform,is_active,registered_at,last_active', { headers });
    const tokens = await tokensRes.json();

    const activeCounts = tokens.reduce((acc, t) => {
      if (t.is_active) {
        acc[t.platform] = (acc[t.platform] || 0) + 1;
      }
      return acc;
    }, {});

    // 2) Query push_notifications
    const pushRes = await fetch(URL + '/rest/v1/push_notifications?select=created_at,status,audience,recipient_count,error_message,payload_json&order=created_at.desc&limit=40', { headers });
    const notifications = await pushRes.json();

    const errorKeywords = ['FCM server key', 'DeviceNotRegistered', 'APNs', 'credentials'];
    const errorCounts = {};
    errorKeywords.forEach(k => errorCounts[k] = 0);

    notifications.forEach(n => {
      if (n.error_message) {
        errorKeywords.forEach(k => {
          if (n.error_message.includes(k)) {
            errorCounts[k]++;
          }
        });
      }
    });

    const breakdownSummaries = [];
    notifications.forEach(n => {
      if (n.payload_json && n.payload_json.delivery_breakdown) {
        if (breakdownSummaries.length < 5) {
          breakdownSummaries.push({
            created_at: n.created_at,
            breakdown: n.payload_json.delivery_breakdown
          });
        }
      }
    });

    console.log('Metrics:');
    console.log('--- Active Token Counts by Platform ---');
    console.log(JSON.stringify(activeCounts, null, 2));
    console.log('\n--- Error Counts in Last 40 Notifications ---');
    console.log(JSON.stringify(errorCounts, null, 2));
    console.log('\n--- Delivery Breakdown found ---');
    console.log(breakdownSummaries.length > 0 ? 'Yes' : 'No');
    if (breakdownSummaries.length > 0) {
      console.log('\n--- Latest 5 Delivery Breakdowns ---');
      console.log(JSON.stringify(breakdownSummaries, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
