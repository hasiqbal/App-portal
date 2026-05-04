import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
}

const supabase = createClient(
  'https://lhaqqqatdztuijgdfdcf.supabase.co',
  SERVICE_KEY
);

const { data, error } = await supabase.from('announcements').select('*').limit(1);
if (error) {
  console.error('Error:', error.message);
} else if (data?.length > 0) {
  const cols = Object.keys(data[0]);
  console.log('=== Columns in live announcements table ===');
  cols.forEach(c => console.log(' -', c));
  console.log('\nrecurrence_type present?', cols.includes('recurrence_type'));
  console.log('recurrence_weekday present?', cols.includes('recurrence_weekday'));
  console.log('event_date present?', cols.includes('event_date'));
  console.log('recurrence_until present?', cols.includes('recurrence_until'));
} else {
  console.log('No rows found in announcements');
}
