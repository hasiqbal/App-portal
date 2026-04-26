import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lhaqqqatdztuijgdfdcf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w'
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
