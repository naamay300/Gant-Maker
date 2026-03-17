import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://bqrfjdwniwlwaixpzscw.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcmZqZHduaXdsd2FpeHB6c2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODQyNTgsImV4cCI6MjA4OTI2MDI1OH0.qPlcWHWipHkXIGR3P_f4uh5BrtPik9F94hoVLCAi5GI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
