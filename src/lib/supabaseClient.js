import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// Only the public "anon" key is used here. Never put the service role key in frontend code.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null
