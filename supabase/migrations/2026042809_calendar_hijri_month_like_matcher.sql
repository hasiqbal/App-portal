-- Replace month parser with regex-free LIKE matching to avoid unicode regex edge cases.

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language plpgsql
immutable
as $$
declare
  t text := lower(coalesce(month_label, ''));
begin
  if t = '' then
    return null;
  end if;

  -- 1 Muharram
  if t like '%muharram%' or t like '%muḥarram%' then
    return 1;
  end if;

  -- 2 Safar
  if t like '%safar%' or t like '%ṣafar%' then
    return 2;
  end if;

  -- 3 Rabi al-Awwal
  if t like '%rabi%awwal%' or t like '%rabī%awwal%' or t like '%rabi%awal%' then
    return 3;
  end if;

  -- 4 Rabi al-Thani / al-Akhir
  if t like '%rabi%thani%' or t like '%rabī%thānī%' or t like '%rabi%akhir%' then
    return 4;
  end if;

  -- 5 Jumada al-Ula / al-Awwal
  if t like '%jumad%ūlá%' or t like '%jumad%ula%' or t like '%jumad%awwal%' or t like '%jumada%al-ula%' then
    return 5;
  end if;

  -- 6 Jumada al-Akhirah / al-Thaniyah
  if t like '%jumad%ākhirah%' or t like '%jumad%akhir%' or t like '%jumad%thani%' then
    return 6;
  end if;

  -- 7 Rajab
  if t like '%rajab%' then
    return 7;
  end if;

  -- 8 Sha'ban
  if t like '%sha%ban%' or t like '%shaʿbān%' then
    return 8;
  end if;

  -- 9 Ramadan
  if t like '%ramadan%' or t like '%ramaḍān%' then
    return 9;
  end if;

  -- 10 Shawwal
  if t like '%shawwal%' or t like '%shawwāl%' then
    return 10;
  end if;

  -- 11 Dhu al-Qi'dah
  if t like '%qadah%' or t like '%qi%ah%' or t like '%qi''dah%' or t like '%qi’dah%' then
    return 11;
  end if;

  -- 12 Dhu al-Hijjah
  if t like '%hijjah%' or t like '%ḥijjah%' then
    return 12;
  end if;

  return null;
end;
$$;
