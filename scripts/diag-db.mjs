const SUPA_URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';
const h = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
const get = async (p) => (await fetch(`${SUPA_URL}/rest/v1/${p}`, { headers: h })).json();

// 1. Verify what date is 12 Rabi al-Awwal in 2026
console.log('\n=== hijri_calendar: Aug 2026 (find Rabi al-Awwal 1 and 12) ===');
const aug = await get('hijri_calendar?gregorian_date=gte.2026-08-01&gregorian_date=lte.2026-09-15&select=gregorian_date,hijri_date&order=gregorian_date.asc');
const rabiStart = aug.find(r => r.hijri_date.match(/^1\s+Rabi al-Awwal/i));
const rabiDay12 = aug.find(r => r.hijri_date.match(/^12\s+Rabi al-Awwal/i));
console.log('1 Rabi al-Awwal:', rabiStart?.gregorian_date, '|', rabiStart?.hijri_date);
console.log('12 Rabi al-Awwal:', rabiDay12?.gregorian_date, '|', rabiDay12?.hijri_date);

// 2. Check existing Rabi al-Awwal (month 3) events
console.log('\n=== islamic_calendar_events: month 3 (Rabi al-Awwal) ===');
const rabiEvents = await get('islamic_calendar_events?linked_hijri_month=eq.3&select=title,linked_hijri_day,linked_hijri_label,linked_gregorian_date&order=linked_hijri_day.asc');
rabiEvents.forEach(r => console.log(`  day ${r.linked_hijri_day} | ${r.title} | greg: ${r.linked_gregorian_date}`));
if (rabiEvents.length === 0) console.log('  (none)');

// 3. Sample auto_delete values
const sample = await get('islamic_calendar_events?select=auto_delete_grace_days&limit=3');
console.log('\nauto_delete_grace_days sample:', sample.map(r => r.auto_delete_grace_days));

console.log('\n=== ANON KEY: islamic_calendar_events ===');
const anonEvents = await q('islamic_calendar_events?select=title,linked_hijri_day,linked_hijri_month,linked_hijri_label,linked_gregorian_date&limit=5', ANON_KEY);
if (Array.isArray(anonEvents)) {
  console.log('Anon can read islamic_calendar_events: YES, rows:', anonEvents.length);
} else {
  console.log('Anon BLOCKED or error:', JSON.stringify(anonEvents));
}

console.log('\n=== ANON KEY: hijri_calendar April 2026 ===');
const anonHijri = await q('hijri_calendar?gregorian_date=gte.2026-04-01&gregorian_date=lte.2026-04-30&select=gregorian_date,hijri_date&limit=3&order=gregorian_date.asc', ANON_KEY);
if (Array.isArray(anonHijri)) {
  console.log('Anon can read hijri_calendar: YES, sample:', JSON.stringify(anonHijri.slice(0,2)));
} else {
  console.log('Anon BLOCKED or error:', JSON.stringify(anonHijri));
}

// --- Full year Hijri map simulation ---
console.log('\n=== Full-year Hijri map for 2026 (simulating new mobile fetch) ===');
const hijriYear = await q('hijri_calendar?gregorian_year=eq.2026&select=gregorian_date,hijri_date&order=gregorian_date.asc&limit=400');
const hijriMap = new Map();
if (Array.isArray(hijriYear)) {
  console.log('hijri_calendar 2026 rows:', hijriYear.length);
  for (const row of hijriYear) {
    // parse "12 Rabi al-Awwal 1447 AH" -> month/day
    const m = row.hijri_date.match(/^(\d+)\s+(.+?)\s+\d+\s+AH/);
    if (!m) continue;
    const day = parseInt(m[1]);
    const monthNames = { 'muharram':1,'safar':2,'rabi':3,'rabi al-awwal':3,'rabi al-awwal':3,'rabi al-thani':4,'jumada al-awwal':5,'jumada al-thani':6,'rajab':7,"sha'ban":8,'ramadan':9,'shawwal':10,"dhu al-qi'dah":11,'dhu al-hijjah':12 };
    const rawMonth = m[2].toLowerCase().trim();
    // simple lookup
    const monthNum = rawMonth.startsWith('rabi al-a') ? 3 : rawMonth.startsWith('rabi al-t') ? 4 :
      rawMonth.startsWith('jumada al-a') ? 5 : rawMonth.startsWith('jumada al-t') ? 6 :
      rawMonth === 'rajab' ? 7 : rawMonth === "sha'ban" ? 8 : rawMonth === 'ramadan' ? 9 :
      rawMonth === 'shawwal' ? 10 : rawMonth.startsWith("dhu al-qi") ? 11 : rawMonth.startsWith('dhu al-h') ? 12 :
      rawMonth === 'safar' ? 2 : rawMonth === 'muharram' ? 1 : null;
    if (!monthNum) continue;
    const key = `${monthNum}:${day}`;
    if (!hijriMap.has(key)) hijriMap.set(key, row.gregorian_date);
  }

  // Check for 12 Rabi al-Awwal (month 3, day 12)
  const mawlid = hijriMap.get('3:12');
  console.log('12 Rabi al-Awwal 1447/8 → Gregorian:', mawlid ?? 'NOT FOUND IN MAP');

  // Show all events that would be mapped to April 2026
  console.log('\n=== Service key: ALL islamic_calendar_events (full) ===');
  const allEvents = await q('islamic_calendar_events?select=title,linked_hijri_day,linked_hijri_month,linked_hijri_label,linked_gregorian_date&order=linked_hijri_month.asc,linked_hijri_day.asc');
  if (Array.isArray(allEvents)) {
    console.log('Total important_date rows:', allEvents.length);
    let foundInApril = 0;
    for (const ev of allEvents) {
      const hDay = ev.linked_hijri_day;
      const hMonth = ev.linked_hijri_month;
      if (!hDay || !hMonth) continue;
      const mapped = hijriMap.get(`${hMonth}:${hDay}`);
      if (mapped && mapped >= '2026-04-01' && mapped <= '2026-04-30') {
        console.log('  → April 2026:', mapped, '|', ev.title);
        foundInApril++;
      }
    }
    if (foundInApril === 0) console.log('  (no events map to April 2026)');
  }
}
