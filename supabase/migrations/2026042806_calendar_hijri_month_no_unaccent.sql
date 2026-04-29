-- Avoid unaccent-dependent behavior by normalizing known Hijri transliteration
-- characters explicitly, then matching ASCII-only keys.

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language plpgsql
immutable
as $$
declare
  normalized text := lower(coalesce(month_label, ''));
  key text;
begin
  -- Normalize common transliteration marks using explicit Unicode code points.
  normalized := replace(normalized, U&'\0101', 'a'); -- ā
  normalized := replace(normalized, U&'\00E1', 'a'); -- á
  normalized := replace(normalized, U&'\012B', 'i'); -- ī
  normalized := replace(normalized, U&'\016B', 'u'); -- ū
  normalized := replace(normalized, U&'\1E25', 'h'); -- ḥ
  normalized := replace(normalized, U&'\1E63', 's'); -- ṣ
  normalized := replace(normalized, U&'\1E0D', 'd'); -- ḍ
  normalized := replace(normalized, U&'\1E6D', 't'); -- ṭ
  normalized := replace(normalized, U&'\1E93', 'z'); -- ẓ
  normalized := replace(normalized, U&'\02BF', '');  -- ʿ

  -- Normalize apostrophe/quote variants.
  normalized := replace(normalized, '''', '');
  normalized := replace(normalized, U&'\2019', ''); -- ’
  normalized := replace(normalized, U&'\02BB', ''); -- ʻ
  normalized := replace(normalized, U&'\02BC', ''); -- ʼ

  -- Keep letters only for stable key matching.
  key := regexp_replace(normalized, '[^a-z]', '', 'g');

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
