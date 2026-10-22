import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Destino de los links de los mails (confirmar cuenta, recuperar contraseña). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  // Solo rutas internas: evita redirecciones a otros sitios.
  const destino = next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : '/';
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
