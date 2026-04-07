import { createClient } from '@supabase/supabase-js';

// ── OnSpace Cloud backend (adhkar_groups, push_notifications, device_tokens)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── External Supabase database (new project)
const EXT_SUPABASE_URL = import.meta.env.VITE_EXT_SUPABASE_URL
  ?? 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const EXT_SUPABASE_ANON_KEY = import.meta.env.VITE_EXT_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';

export const supabaseExt = createClient(EXT_SUPABASE_URL, EXT_SUPABASE_ANON_KEY);
