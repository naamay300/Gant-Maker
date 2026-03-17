import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://bqrfjdwniwlwaixpzscw.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_FfpKh47fMBB_6isFfhBKQA_4XPYK2tS';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
