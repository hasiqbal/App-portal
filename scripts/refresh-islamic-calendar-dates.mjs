/**
 * Refresh all islamic_calendar_events with correct 2026 Gregorian dates.
 * Uses the hijri_calendar table as the authoritative source for day/month → gregorian_date.
 *
 * Run: node scripts/refresh-islamic-calendar-dates.mjs
 */

const SUPA_URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';
const h = (extra = {}) => ({
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
  ...extra,
});

const get = async (path) => {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: h() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
};

const patch = async (path, body) => {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: h(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
};

// ── Step 1: Build full-year 2026 Hijri map from hijri_calendar ───────────────

console.log('Fetching 2026 hijri_calendar rows...');
const hijriRows = await get('hijri_calendar?gregorian_year=eq.2026&select=gregorian_date,hijri_date&order=gregorian_date.asc&limit=400');
console.log(`  Got ${hijriRows.length} rows`);

// Normalize a Hijri month name by decomposing Unicode diacritics and stripping non-ASCII.
// e.g. "Rab\u012b\u02bf al-awwal" \u2192 "rabialawwal", "Ra\u1e0d\u0101n" \u2192 "ramadan"
function normalizeMonthName(raw) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritics (\u0101\u2192a, \u012b\u2192i, \u1e0d\u2192d \u2026)
    .replace(/[\u02b0-\u02ff]/g, '')   // strip modifier letters (\u02bf ayin, etc.)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// Parse "12 Rab\u012b\u02bf al-awwal 1448 AH" \u2192 { day:12, month:3, year:1448, label:"..." }
function parseHijriLabel(hijriDate) {
  const m = hijriDate?.match(/^(\d+)\s+(.+?)\s+(\d{4})\s+AH/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const rawMonth = normalizeMonthName(m[2]);
  const year = parseInt(m[3]);
  const ALIASES = {
    muharram: 1, safar: 2,
    rabialawwal: 3, rabialawal: 3, rabiulawwal: 3, rabiulawal: 3, rbialawwal: 3,
    rabialthani: 4, rabialakhir: 4, rabiuthani: 4, rabiulakhir: 4, rabilthani: 4, rbialthani: 4,
    jumadaalula: 5, jumadaula: 5, jumadaalawwal: 5, jumadaawwal: 5,
    jumadaalakhirah: 6, jumadaalthani: 6, jumadaalthaniah: 6, jumadauthani: 6, jumadaalkhirah: 6,
    rajab: 7,
    shaban: 8, shaaban: 8,
    ramadan: 9,
    shawwal: 10,
    dhulqadah: 11, dhualqadah: 11, dhuqadah: 11, dhulqidah: 11, dhualqidah: 11,
    dhulhijjah: 12, dhualhijjah: 12, dhulhijja: 12,
  };
  const month = ALIASES[rawMonth];
  if (!month) return null;
  return { day, month, year, label: `${m[1]} ${m[2]} ${m[3]} AH` };
}

// Map: "month:day" → { gregorian_date, hijri_year, hijri_label }
const hijriToGregorian = new Map();
const hijriToYear = new Map();
const hijriToLabel = new Map();

for (const row of hijriRows) {
  const p = parseHijriLabel(row.hijri_date);
  if (!p) { console.log('  ⚠ Could not parse:', row.hijri_date); continue; }
  const key = `${p.month}:${p.day}`;
  if (!hijriToGregorian.has(key)) {  // first occurrence wins (earliest in year)
    hijriToGregorian.set(key, row.gregorian_date);
    hijriToYear.set(key, p.year);
    hijriToLabel.set(key, p.label);
  }
}

console.log(`  Built Hijri map with ${hijriToGregorian.size} unique day/month keys`);

// Spot-check key dates
const check = (m, d, label) => {
  const k = `${m}:${d}`;
  console.log(`  ${label}: key ${k} → ${hijriToGregorian.get(k) ?? 'NOT FOUND'} (${hijriToLabel.get(k) ?? '-'})`);
};
check(3, 12, '12 Rabi al-Awwal (Mawlid)');
check(9, 27, '27 Ramadan (Laylat al-Qadr)');
check(10, 1, '1 Shawwal (Eid al-Fitr)');
check(12, 10, '10 Dhu al-Hijjah (Eid al-Adha)');

// ── Step 2: Fetch all islamic_calendar_events ─────────────────────────────────

console.log('\nFetching all islamic_calendar_events...');
const events = await get('islamic_calendar_events?select=id,title,linked_hijri_day,linked_hijri_month,linked_hijri_year,linked_hijri_label,linked_gregorian_date&order=linked_hijri_month.asc,linked_hijri_day.asc');
console.log(`  Got ${events.length} rows`);

// ── Step 3: Update stale / wrong dates ───────────────────────────────────────

let updated = 0, skipped = 0, notMapped = 0;

for (const ev of events) {
  const key = `${ev.linked_hijri_month}:${ev.linked_hijri_day}`;
  const correctGreg = hijriToGregorian.get(key);
  const correctYear = hijriToYear.get(key);
  const correctLabel = hijriToLabel.get(key);

  if (!correctGreg || !correctYear || !correctLabel) {
    console.log(`  ⚠ No 2026 mapping for ${ev.title} (${key})`);
    notMapped++;
    continue;
  }

  // Skip if all three fields already match the correct 2026 value
  if (
    ev.linked_gregorian_date === correctGreg &&
    ev.linked_hijri_year === correctYear &&
    ev.linked_hijri_label === correctLabel
  ) {
    skipped++;
    continue;
  }

  console.log(`  Updating "${ev.title}" (${key}): ${ev.linked_gregorian_date} → ${correctGreg} [${correctLabel}]`);
  await patch(`islamic_calendar_events?id=eq.${ev.id}`, {
    linked_gregorian_date: correctGreg,
    linked_hijri_year: correctYear,
    linked_hijri_label: correctLabel,
  });
  updated++;
}

console.log(`\n✅ Done: ${updated} updated, ${skipped} already correct, ${notMapped} unmapped`);
