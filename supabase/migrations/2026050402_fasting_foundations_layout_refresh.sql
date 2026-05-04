do $$
declare
  v_guide_id uuid;
  v_section_id uuid;
begin
  select g.id
    into v_guide_id
  from public.howto_guides g
  where g.language = 'en'
    and (
      g.slug in ('fasting-foundations', 'fasting-foundations-sawm', 'sawm-foundations')
      or lower(g.title) like 'fasting foundations%'
    )
  order by g.updated_at desc nulls last, g.created_at desc
  limit 1;

  if v_guide_id is null then
    raise notice 'Fasting Foundations guide not found; skipping update.';
    return;
  end if;

  update public.howto_guides
  set intro = 'This guide follows a section-and-step layout covering core Hanafi fasting rulings: intention, fasting window, invalidators, exemptions, Sunnah optional fasts, and days to avoid fasting.',
      notes = array[
        'For personal edge cases and unresolved fasting history, verify with a qualified Hanafi scholar.',
        'Layout uses numbered steps inside each section heading as requested.'
      ]::text[],
      updated_at = now()
  where id = v_guide_id;

  delete from public.howto_step_blocks
  where step_id in (
    select st.id
    from public.howto_steps st
    join public.howto_sections sec on sec.id = st.section_id
    where sec.guide_id = v_guide_id
  );

  delete from public.howto_step_images
  where step_id in (
    select st.id
    from public.howto_steps st
    join public.howto_sections sec on sec.id = st.section_id
    where sec.guide_id = v_guide_id
  );

  delete from public.howto_steps
  where section_id in (
    select sec.id
    from public.howto_sections sec
    where sec.guide_id = v_guide_id
  );

  delete from public.howto_sections
  where guide_id = v_guide_id;

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'Core Requirements', 0)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Make intention (niyyah)',
      'The time of the intention is from Maghrib of the previous night.',
      'Reminder: The intention to fast can be made up to the Islamic midday (al-Dahwa al-Kubra), provided one did nothing that would invalidate the fast from the start of Fajr. If they did, there is no fast.',
      null
    ),
    (
      v_section_id,
      1,
      'Observe fasting window',
      'From true dawn (Fajr) until sunset (Maghrib).',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'What Breaks the Fast and requires Kaffarah and Qada', 1)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Intentional eating or drinking',
      'Deliberate eating or drinking during the fasting hours.',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'Intentional marital relations',
      'Intentional marital relations during the fasting hours.',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'What Breaks the Fast and requires Qadah only', 2)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Eating or drinking',
      'Eating or drinking by accident or forgetting that you are fasting or eating or drinking because one doubted that Fajr entered but Fajr really did enter or that Maghrib entered when it had not entered.',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'Marital relations',
      'If done out of forgetfulness or assuming the hours of fasting had not begun/had not ended.',
      null,
      null
    ),
    (
      v_section_id,
      2,
      'Masturbation',
      'If ejaculation occurs, the fast is invalidated and requires Qada, but not Kaffarah, even if done intentionally.',
      'Warning: This action is a sin, so it must be avoided at all times.',
      null
    ),
    (
      v_section_id,
      3,
      'With the nose',
      E'1. Water used to clean the nose for wudu or ghusl reaches the throat or the brain\n2. Inhaling medicine into the nostrils\n3. Inhaling smoke by one''s doing, on the condition one''s body doesn''t benefit from it',
      null,
      null
    ),
    (
      v_section_id,
      4,
      'Vomit',
      'Deliberately vomiting a mouthful, whether one swallows it or not.',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'What does not invalidate the fast', 3)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Eye drops',
      'It is permissible to use eye drops while fasting, and using eye drops does not break the fast.',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'Injections',
      'In the Hanafi madhab, invalidation requires entry into the digestive tract (jowf) or the head. Entry from elsewhere (including bloodstream injection) does not invalidate the fast.',
      null,
      null
    ),
    (
      v_section_id,
      2,
      'Saliva / phlegm',
      'Swallowing one''s own saliva (while it remains in the mouth), or swallowing one''s own phlegm after clearing the throat, does not invalidate the fast.',
      null,
      null
    ),
    (
      v_section_id,
      3,
      'Vomit',
      'Deliberately vomiting less than a mouthful, regardless if one swallows it or not.',
      null,
      null
    ),
    (
      v_section_id,
      4,
      'Wet dream',
      'This does not break the fast.',
      null,
      null
    ),
    (
      v_section_id,
      5,
      'Miswaak',
      'This does not break the fast.',
      null,
      null
    ),
    (
      v_section_id,
      6,
      'Toothpaste',
      'Brushing the teeth with toothpaste or using mouthwash, on the condition that one does not swallow it.',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'Valid Exemptions', 4)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Illness or harm risk',
      'If fasting causes real harm or blocks recovery, exemption applies with makeup obligations as relevant.',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'Travel hardship',
      'Travelers may use concession and make up missed fasts later so long as the journey began before Fajr time.',
      null,
      null
    ),
    (
      v_section_id,
      2,
      'Menstruation and nifas',
      'A person in hayd or nifas does not fast and later makes up those Ramadan fasts.',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'Regular Sunnah Optional Fasts', 5)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Mondays and Thursdays',
      'Fast Monday and Thursday as a regular Sunnah pattern,',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'White fasts (Ayyam al-Bid: 13th, 14th, 15th)',
      'Fasting the white days each lunar month is a strongly encouraged Sunnah.',
      null,
      null
    ),
    (
      v_section_id,
      2,
      'Fasting six days of Shawwal',
      'Fasting six days in the Islamic month of Shawwal, following Ramadan, is a highly recommended (Sunnah Mustahabbah) practice. It carries immense rewards, equivalent to fasting an entire year.',
      null,
      null
    ),
    (
      v_section_id,
      3,
      'Muharram and Ashura',
      'Muharram fasting is highly virtuous (especially Ashura). Fast 10 Muharram with either 9 or 11 Muharram, not only the 10th.',
      null,
      null
    ),
    (
      v_section_id,
      4,
      'First nine days of Dhul Hijjah',
      'The Prophet (Peace be upon him) used to fast on the first 9 days of Dhul Hijjah and the day of Ashura, and 3 days each month, the first Monday of the month and 2 Thursdays.',
      'Hadith | Abu Dawood',
      null
    ),
    (
      v_section_id,
      5,
      'Day of Arafah (9 Dhul Hijjah, non-Hajj pilgrims)',
      'It expiates the sins of the preceding year and the coming year.',
      'Hadith | Muslim',
      null
    ),
    (
      v_section_id,
      6,
      'Fasting of Dawud (best nafl pattern)',
      'Fast one day, break on the next day, then fast again on the third day, and continue this alternating pattern.',
      null,
      null
    );

  insert into public.howto_sections (guide_id, heading, section_order)
  values (v_guide_id, 'Days to Avoid Fasting', 6)
  returning id into v_section_id;

  insert into public.howto_steps (section_id, step_order, title, detail, note, rich_content_html)
  values
    (
      v_section_id,
      0,
      'Eid days',
      'Fasting is prohibited on Eid al-Fitr and Eid al-Adha.',
      null,
      null
    ),
    (
      v_section_id,
      1,
      'Tashriq days',
      'Fasting is prohibited on 11, 12, and 13 Dhul Hijjah.',
      null,
      null
    ),
    (
      v_section_id,
      2,
      'Single Friday without reason',
      'Avoid singling out Friday alone as a nafl fast unless paired with Thursday or Saturday, or unless it is a regular habit.',
      null,
      null
    );

  raise notice 'Fasting Foundations guide refreshed for guide_id=%', v_guide_id;
end;
$$;