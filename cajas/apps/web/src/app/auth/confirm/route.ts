import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TIPOS: EmailOtpType[] = ['recovery', 'signup', 'email', 'invite', 'magiclink', 'email_change'];

/**
 * Destino de los links de los mails con token_hash. A diferencia del flujo con "code", no depende de que el
 * link se abra en el mismo navegador donde se pidió (por ejemplo, desde la app de mail del celular).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  const destino = next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : '/';
  if (hash && type && TIPOS.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: hash });
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
