-- Harden Hijri month normalization for Unicode/diacritic labels found in hijri_calendar.
-- Examples observed: "Ṣafar", "Ramaḍān", "Dhū al-Ḥijjah", "Jumādá al-ūlá".

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language plpgsql
immutable
as $$
declare
  normalized text := lower(coalesce(month_label, ''));
  key text;
begin
  -- Normalize common Arabic transliteration diacritics to ASCII before filtering.
  normalized := replace(normalized, 'ā', 'a');
  normalized := replace(normalized, 'á', 'a');
  normalized := replace(normalized, 'ạ', 'a');
  normalized := replace(normalized, 'ả', 'a');
  normalized := replace(normalized, 'ă', 'a');
  normalized := replace(normalized, 'ī', 'i');
  normalized := replace(normalized, 'ū', 'u');
  normalized := replace(normalized, 'ḥ', 'h');
  normalized := replace(normalized, 'ḫ', 'h');
  normalized := replace(normalized, 'ṣ', 's');
  normalized := replace(normalized, 'ṡ', 's');
  normalized := replace(normalized, 'ḍ', 'd');
  normalized := replace(normalized, 'ṭ', 't');
  normalized := replace(normalized, 'ṯ', 't');
  normalized := replace(normalized, 'ẓ', 'z');
  normalized := replace(normalized, 'ḳ', 'k');
  normalized := replace(normalized, 'ḵ', 'k');
  normalized := replace(normalized, 'ḷ', 'l');
  normalized := replace(normalized, 'ḹ', 'l');
  normalized := replace(normalized, 'ḻ', 'l');
  normalized := replace(normalized, 'ṃ', 'm');
  normalized := replace(normalized, 'ṅ', 'n');
  normalized := replace(normalized, 'ṉ', 'n');
  normalized := replace(normalized, 'ṟ', 'r');
  normalized := replace(normalized, 'ṛ', 'r');
  normalized := replace(normalized, 'ẖ', 'h');
  normalized := replace(normalized, 'ẗ', 't');
  normalized := replace(normalized, 'ṳ', 'u');

  -- Remove transliteration apostrophes/ayn variants.
  normalized := replace(normalized, '''', '');
  normalized := replace(normalized, '’', '');
  normalized := replace(normalized, 'ʻ', '');
  normalized := replace(normalized, 'ʼ', '');
  normalized := replace(normalized, 'ʿ', '');

  -- Keep letters only for canonical key matching.
  key := regexp_replace(lower(unaccent(normalized)), '[^a-z]', '', 'g');

  return case key
    when 'muharram' then 1
    when 'safar' then 2
    when 'rabialawwal' then 3
    when 'rabialawal' then 3
    when 'rabiulawwal' then 3
    when 'rabiulawal' then 3
    when 'rabialthani' then 4
    when 'rabialakhir' then 4
    when 'rabiuthani' then 4
    when 'rabiulakhir' then 4
    when 'jumadaalula' then 5
    when 'jumadaula' then 5
    when 'jumadaalawwal' then 5
    when 'jumadaalakhirah' then 6
    when 'jumadaalthaniah' then 6
    when 'rajab' then 7
    when 'shaban' then 8
    when 'shaaban' then 8
    when 'ramadan' then 9
    when 'shawwal' then 10
    when 'dhulqadah' then 11
    when 'dhualqadah' then 11
    when 'dhulqidah' then 11
    when 'dhualqidah' then 11
    when 'dhulhijjah' then 12
    when 'dhualhijjah' then 12
    else null
  end;
end;
$$;
