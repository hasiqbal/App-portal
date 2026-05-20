
const fs = require("fs");

async function main() {
  const content = fs.readFileSync("src/lib/supabase.ts", "utf8");
  const urlMatch = content.match(/const LEGACY_EXTERNAL_SUPABASE_URL = \x27(.*?)\x27/);
  const keyMatch = content.match(/const LEGACY_EXTERNAL_SUPABASE_ANON_KEY = \x27(.*?)\x27/);

  if (!urlMatch || !keyMatch) {
    console.error("Failed to extract credentials");
    process.exit(1);
  }

  const url = urlMatch[1];
  const anonKey = keyMatch[1];
  console.log(`URL: ${url}`);
  
  const endpoints = [
    {
      name: "Push Notifications (Recent 15)",
      path: "/rest/v1/push_notifications?select=id,status,audience,recipient_count,error_message,sent_at,created_at&order=created_at.desc&limit=15"
    },
    {
      name: "Device Tokens (Recent 20)",
      path: "/rest/v1/device_tokens?select=id,token,platform,is_active,registered_at,last_active&order=last_active.desc&limit=20"
    },
    {
      name: "Active Device Tokens Count (Check)",
      path: "/rest/v1/device_tokens?select=id&is_active=eq.true"
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`\n--- Checking: ${endpoint.name} ---`);
    try {
      const response = await fetch(`${url}${endpoint.path}`, {
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`
        }
      });
      console.log(`Status: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!response.ok) { console.log("Error:", data); continue; }
      if (Array.isArray(data)) {
        console.log(`Rows returned: ${data.length}`);
        if (data.length === 0) {
          console.log("Result: Access blocked by RLS (empty).");
        } else {
          console.log("Result: Access NOT blocked by RLS.");
          const processed = data.map(item => {
            const newItem = { ...item };
            if (newItem.token) newItem.token = newItem.token.substring(0, 8) + "...";
            return newItem;
          });
          console.log(JSON.stringify(processed.slice(0, 2), null, 2));
          if (endpoint.name.includes("Push Notifications")) {
            const errors = [...new Set(data.filter(n => n.error_message).map(n => n.error_message))];
            if (errors.length > 0) console.log("Error Patterns: " + errors.join("; "));
          }
        }
      }
    } catch (err) { console.error(`Error: ${err.message}`); }
  }
}
main();

