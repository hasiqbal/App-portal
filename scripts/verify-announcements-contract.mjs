import { createClient } from '@supabase/supabase-js';

function assertEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const REQUIRED_COLUMNS = [
  'event_date',
  'recurrence_type',
  'recurrence_interval',
  'recurrence_weekday',
  'recurrence_month_day',
  'recurrence_until',
];

const REQUIRED_CONSTRAINTS = [
  'announcements_recurrence_requires_event_date_chk',
  'announcements_recurrence_interval_chk',
  'announcements_recurrence_weekday_chk',
  'announcements_recurrence_month_day_chk',
];

async function main() {
  const url = assertEnv('SUPABASE_URL');
  const key = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  const schema = (process.env.SUPABASE_SCHEMA || 'public').trim();
  const table = (process.env.ANNOUNCEMENTS_TABLE || 'announcements').trim();

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: columns, error: columnsError } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', schema)
    .eq('table_name', table);

  if (columnsError) {
    throw new Error(`Failed to read columns: ${columnsError.message}`);
  }

  const availableColumns = new Set((columns || []).map((row) => row.column_name));
  const missingColumns = REQUIRED_COLUMNS.filter((name) => !availableColumns.has(name));

  const { data: constraints, error: constraintsError } = await supabase
    .from('information_schema.table_constraints')
    .select('constraint_name')
    .eq('table_schema', schema)
    .eq('table_name', table)
    .eq('constraint_type', 'CHECK');

  if (constraintsError) {
    throw new Error(`Failed to read constraints: ${constraintsError.message}`);
  }

  const availableConstraints = new Set((constraints || []).map((row) => row.constraint_name));
  const missingConstraints = REQUIRED_CONSTRAINTS.filter((name) => !availableConstraints.has(name));

  const summary = {
    schema,
    table,
    missingColumns,
    missingConstraints,
    ok: missingColumns.length === 0 && missingConstraints.length === 0,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[verify-announcements-contract] failed:', error);
  process.exitCode = 1;
});
