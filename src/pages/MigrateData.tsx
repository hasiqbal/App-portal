import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { FunctionsHttpError } from '@supabase/supabase-js';

export default function MigrateData() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string>('');

  const runMigration = async () => {
    setStatus('running');
    setResult('Running migration — this may take 30–60 seconds...');
    try {
      const { data, error } = await supabase.functions.invoke('migrate-data', { body: {} });
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = await error.context?.text() ?? msg; } catch { /* ignore */ }
        }
        setStatus('error');
        setResult(`Error: ${msg}`);
        return;
      }
      setStatus('done');
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setStatus('error');
      setResult(`Unexpected error: ${String(e)}`);
    }
  };

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-green-800">Data Migration</h1>
      <p className="text-gray-600 text-sm">
        This will copy all adhkar, prayer_times, sunnah_reminders, and announcements
        from the external backend into this project's backend.
      </p>
      <Button
        onClick={runMigration}
        disabled={status === 'running'}
        className="bg-green-700 hover:bg-green-800 text-white"
      >
        {status === 'running' ? 'Migrating…' : 'Run Migration'}
      </Button>
      {result && (
        <pre className={`text-sm p-4 rounded-lg whitespace-pre-wrap font-mono ${
          status === 'error' ? 'bg-red-50 text-red-800' :
          status === 'done' ? 'bg-green-50 text-green-800' :
          'bg-gray-50 text-gray-700'
        }`}>
          {result}
        </pre>
      )}
    </div>
  );
}
