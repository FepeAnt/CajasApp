import { createBrowserClient } from '@supabase/ssr';

/** Cliente del navegador: usa la sesión de la persona, así que Postgres aplica sus permisos (RLS). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
