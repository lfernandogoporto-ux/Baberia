import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

export const publicUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from('shop').getPublicUrl(path).data.publicUrl : null

/** Convierte el error de Supabase en un texto legible */
export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Ocurrió un error'
