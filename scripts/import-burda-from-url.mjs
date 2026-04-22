import { createClient } from '@supabase/supabase-js';

const SOURCE_URL = 'https://salawat.com/qasida-burda/';
const SUPABASE_URL = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';

const chapterNames = [
  'Chapter One',
  'Chapter Two',
  'Chapter Three',
  'Chapter Four',
  'Chapter Five',
  'Chapter Six',
  'Chapter Seven',
  'Chapter Eight',
  'Chapter Nine',
  'Chapter Ten',
];

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlToLines(html) {
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, '\n')
      .replace(/\r/g, '')
  );

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

function findHeadingIndex(lines, heading, from = 0) {
  const rx = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  for (let i = from; i < lines.length; i += 1) {
    if (rx.test(lines[i])) return i;
  }
  return -1;
}

function isArabic(line) {
  return /[\u0600-\u06FF]/.test(line);
}

function isNoise(line) {
  return /^(video|about imam|references|comments|leave a reply|social|quick links)$/i.test(line);
}

function isLikelyHeading(line) {
  return /^(on\s+|a\s+caution\s+about|praise\s+of|the\s+burda$)/i.test(line);
}

function parseVerseEnglishChunk(line) {
  const match = line.match(/^(.*?)(\d{1,3})\.\s+(.+)$/);
  if (!match) return null;

  const transliteration = match[1].trim();
  const verseNumber = Number(match[2]);
  const translation = match[3].trim();

  return {
    verseNumber,
    transliteration: transliteration || '',
    translation,
  };
}

function parseChapterVerses(chapterLabel, chapterLines) {
  const verses = [];
  let verseArabicBuffer = [];
  let pendingVerse = null;

  for (const line of chapterLines) {
    if (isArabic(line)) {
      verseArabicBuffer.push(line);
      continue;
    }

    if (isLikelyHeading(line)) {
      continue;
    }

    const parsed = parseVerseEnglishChunk(line);
    if (parsed) {
      if (pendingVerse) {
        verses.push(pendingVerse);
      }

      pendingVerse = {
        chapter: chapterLabel,
        heading: `${chapterLabel} · Verse ${parsed.verseNumber}`,
        arabic: verseArabicBuffer.join(' ').trim(),
        transliteration: parsed.transliteration || null,
        translation: parsed.translation,
        urdu_translation: null,
      };

      verseArabicBuffer = [];
      continue;
    }

    if (pendingVerse && !isNoise(line) && !/^Qasida Burda$/i.test(line)) {
      pendingVerse.translation = `${pendingVerse.translation} ${line}`.trim();
    }
  }

  if (pendingVerse) {
    verses.push(pendingVerse);
  }

  return verses.filter((v) => v.arabic || v.translation || v.transliteration);
}

function extractSections(lines) {
  const sections = [];
  let searchFrom = 0;

  for (let c = 0; c < chapterNames.length; c += 1) {
    const heading = chapterNames[c];
    const start = findHeadingIndex(lines, heading, searchFrom);
    if (start === -1) continue;

    let end = lines.length;
    for (let j = c + 1; j < chapterNames.length; j += 1) {
      const next = findHeadingIndex(lines, chapterNames[j], start + 1);
      if (next !== -1) {
        end = next;
        break;
      }
    }

    const rawLines = lines.slice(start + 1, end);
    const cleaned = [];
    for (const line of rawLines) {
      if (isNoise(line)) break;
      if (/^Qasida Burda$/i.test(line)) continue;
      if (/^Type and hit Enter to search$/i.test(line)) continue;
      cleaned.push(line);
    }

    const chapterVerses = parseChapterVerses(heading, cleaned);
    sections.push(...chapterVerses);

    searchFrom = end;
  }

  return sections;
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch source page: ${res.status}`);
  }

  const html = await res.text();
  const lines = htmlToLines(html);
  const sections = extractSections(lines);

  if (sections.length < 150) {
    throw new Error(`Expected verse-level sections, got ${sections.length}. Aborting import.`);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: groupRows, error: groupErr } = await supabase
    .from('qaseedah_naat_groups')
    .select('id,name')
    .eq('content_type', 'qaseedah')
    .ilike('name', '%burda%')
    .order('display_order', { ascending: true })
    .limit(1);

  if (groupErr) throw groupErr;

  let groupId = groupRows?.[0]?.id;
  if (!groupId) {
    const { data: createdGroup, error: createGroupErr } = await supabase
      .from('qaseedah_naat_groups')
      .insert({
        name: 'Qaseedah Burda',
        content_type: 'qaseedah',
        description: 'Qaseedah Burda imported from authorized source.',
        icon: '📖',
        is_active: true,
        display_order: 1,
      })
      .select('id')
      .single();

    if (createGroupErr) throw createGroupErr;
    groupId = createdGroup.id;
  }

  const joinedArabic = sections.map((s) => s.arabic).filter(Boolean).join('\n\n');
  const joinedEnglish = sections.map((s) => s.translation).filter(Boolean).join('\n\n');
  const joinedTranslit = sections.map((s) => s.transliteration).filter(Boolean).join('\n\n');

  const payload = {
    group_id: groupId,
    content_type: 'qaseedah',
    title: 'Qaseedah Burda (Full)',
    arabic_title: 'قصيدة البردة',
    arabic: joinedArabic,
    transliteration: joinedTranslit || null,
    translation: joinedEnglish,
    urdu_translation: null,
    reference: SOURCE_URL,
    count: '1',
    prayer_time: 'general',
    display_order: 1,
    is_active: true,
    sections,
    file_url: SOURCE_URL,
    description: 'Full Qaseedah Burda chapterized import (10 chapters).',
  };

  const { data: existingRows, error: existingErr } = await supabase
    .from('qaseedah_naat_entries')
    .select('id,title')
    .eq('group_id', groupId)
    .eq('content_type', 'qaseedah')
    .ilike('title', 'Qaseedah Burda%')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;

  if (existingRows && existingRows.length > 0) {
    const id = existingRows[0].id;
    const { data: updated, error: updateErr } = await supabase
      .from('qaseedah_naat_entries')
      .update(payload)
      .eq('id', id)
      .select('id,title')
      .single();

    if (updateErr) throw updateErr;
    console.log(JSON.stringify({ action: 'updated', entry: updated, groupId, verses: sections.length }, null, 2));
  } else {
    const { data: created, error: createErr } = await supabase
      .from('qaseedah_naat_entries')
      .insert(payload)
      .select('id,title')
      .single();

    if (createErr) throw createErr;
    console.log(JSON.stringify({ action: 'created', entry: created, groupId, verses: sections.length }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
