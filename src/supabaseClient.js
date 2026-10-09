import { createClient } from '@supabase/supabase-js'
import { perTab } from './storageMode'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// (?tab=1 no endereço = modo de teste: cada aba guarda o próprio login, ver storageMode.js)
export const supabase = createClient(url, key, perTab ? { auth: { storage: window.sessionStorage } } : undefined)

// cada navegador ganha um crachá anônimo, sem cadastro nenhum
export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user

  const { data: created, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return created.user
}