-- Fix Hijri month parsing for diacritic/apostrophe variants used in hijri_calendar.
-- Keeps fail-closed behavior in get_calendar_events_for_month while broadening
-- month label normalization support.

create or replace function public.hijri_month_name_to_number(month_label text)
returns integer
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(
      lower(
        unaccent(
          translate(
            coalesce(month_label, ''),
            'āīūáḥṣḍṭẓʿ’ʻʼ',
            'aiuahsdtz'
          )
        )
      ),
      '[^a-z]',
      '',
      'g'
    ) as key
  )
  select case key
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
  end
  from normalized;
$$;
