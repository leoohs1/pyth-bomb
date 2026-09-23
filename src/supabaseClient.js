import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

// cada navegador ganha um crachá anônimo, sem cadastro nenhum
export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user

  const { data: created, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return created.user
}