/** URL pública de una foto de perfil guardada en Supabase Storage (bucket "avatars"). */
export function avatarSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/avatars/${path}` : null;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function limpiarUsername(s: string): string {
  return s.trim().replace(/^@/, '').toLowerCase();
}
