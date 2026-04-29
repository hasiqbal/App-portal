-- Defensive month parser for Hijri labels that include transliteration diacritics.
-- Uses broad pattern matching so fail-closed checks can pass with real-world labels.

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language plpgsql
immutable
as $$
declare
  k text := lower(coalesce(month_label, ''));
begin
  -- Remove spaces, punctuation, and separators but keep letters (including unicode letters).
  k := regexp_replace(k, '[^[:alpha:]]', '', 'g');

  -- Muharram
  if k like '%muharram%' or k like '%mu%arram%' then
    return 1;
  end if;

  -- Safar
  if k like '%safar%' or k like '%afar%' then
    return 2;
  end if;

  -- Rabi al-Awwal
  if k like '%rab%awwal%' or k like '%rab%awal%' then
    return 3;
  end if;

  -- Rabi al-Thani / al-Akhir
  if k like '%rab%thani%' or k like '%rab%akhir%' then
    return 4;
  end if;

  -- Jumada al-Ula / al-Awwal
  if k like '%jum%ula%' or k like '%jum%awwal%' or k like '%jum%awal%' then
    return 5;
  end if;

  -- Jumada al-Akhirah / al-Thaniyah
  if k like '%jum%akhir%' or k like '%jum%thani%' then
    return 6;
  end if;

  -- Rajab
  if k like '%rajab%' then
    return 7;
  end if;

  -- Sha'ban
  if k like '%sha%ban%' or k like '%shaban%' then
    return 8;
  end if;

  -- Ramadan
  if k like '%ramadan%' or k like '%rama%an%' then
    return 9;
  end if;

  -- Shawwal
  if k like '%shawwal%' then
    return 10;
  end if;

  -- Dhu al-Qi'dah
  if k like '%dhu%qad%' or k like '%dhu%qid%' then
    return 11;
  end if;

  -- Dhu al-Hijjah
  if k like '%dhu%hijj%' then
    return 12;
  end if;

  return null;
end;
$$;
