'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Avatar } from './ui';

const LADO = 256;

/** Recorta al centro y achica a 256×256 JPEG: la foto original nunca sale del dispositivo. */
async function achicar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const lado = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = LADO; canvas.height = LADO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  bmp.close();
  return await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('blob'))), 'image/jpeg', 0.85));
}

export function AvatarUploader({ meId, nombre, actual }: { meId: string; nombre: string; actual: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function subir(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) return setError('Elegí un archivo de imagen (JPG, PNG o WebP).');
    if (file.size > 15 * 1024 * 1024) return setError('La imagen es demasiado pesada. Elegí otra de menos de 15 MB.');
    setBusy(true);
    try {
      const blob = await achicar(file);
      const supabase = createClient();
      const path = `${meId}/avatar-${Date.now()}.jpg`;
      const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (up.error) throw up.error;
      const upd = await supabase.from('profiles').update({ avatar_url: path }).eq('id', meId);
      if (upd.error) throw upd.error;
      if (actual) await supabase.storage.from('avatars').remove([actual]);
      router.refresh();
    } catch {
      setError('No pudimos guardar la foto. Probá con otra imagen.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function quitar() {
    if (!actual) return;
    setBusy(true); setError('');
    const supabase = createClient();
    const upd = await supabase.from('profiles').update({ avatar_url: null }).eq('id', meId);
    if (upd.error) setError('No pudimos quitar la foto.');
    else { await supabase.storage.from('avatars').remove([actual]); router.refresh(); }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar id={meId} nombre={nombre} size={72} foto={actual} />
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Subiendo…' : actual ? 'Cambiar foto' : 'Subir foto'}</button>
          {actual && <button type="button" className="btn btn-sm" disabled={busy} onClick={quitar}>Quitar</button>}
        </div>
        <p className="text-[13px] text-muted">Opcional. La ven quienes te busquen para invitarte y los miembros de tus cajas.</p>
        {error && <p role="alert" className="err">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Elegir foto de perfil" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
    </div>
  );
}
