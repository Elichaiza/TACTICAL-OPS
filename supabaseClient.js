import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsprljtugoocnidstdan.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EECeErgq8b5E2RxR8-RcLg_YBNB_dap';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
