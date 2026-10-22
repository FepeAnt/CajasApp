'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './ui';
import { Dialog, useRpc } from './client-ui';

export interface InvitacionNueva { id: string; caja: string; por: string; porUsuario: string | null; foto: string | null; rol: 'editor' | 'viewer' }

/**
 * Recuadro al abrir la app cuando hay invitaciones nuevas: se acepta o rechaza ahí mismo, de a una,
 * y desaparece al terminar. "Ver más tarde" la deja en la sección Invitaciones. Se marca como vista en
 * el servidor, así no vuelve a aparecer (ni en otro dispositivo).
 */
export function AvisoInvitacion({ nuevas }: { nuevas: InvitacionNueva[] }) {
  const { call, pending, error, supabase } = useRpc();
  const [cola, setCola] = useState<InvitacionNueva[]>([]);
  const iniciada = useRef(false);

  useEffect(() => {
    if (!nuevas.length || iniciada.current) return;
    iniciada.current = true;
    setCola(nuevas);
    void supabase.rpc('marcar_invitaciones_vistas');
  }, [nuevas, supabase]);

  const actual = cola[0];
  const siguiente = () => setCola((c) => c.slice(1));

  async function responder(aceptar: boolean) {
    if (!actual) return;
    const r = await call('responder_invitacion', { p_id: actual.id, p_aceptar: aceptar });
    if (r.ok) siguiente();
  }

  return (
    <Dialog open={Boolean(actual)} onClose={() => setCola([])} compacto title="Invitación nueva">
      {actual && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar id={actual.id} nombre={actual.por} size={64} foto={actual.foto} />
          <p>
            <b>{actual.por}</b>{actual.porUsuario ? <span className="text-muted"> @{actual.porUsuario}</span> : null}<br />
            te invitó a la caja <b>“{actual.caja}”</b>
          </p>
          <p className="text-[13px] text-muted">{actual.rol === 'editor' ? 'Podrías ver y cargar movimientos.' : 'Solo podrías ver.'} No ves nada de la caja hasta que aceptes.</p>
          {cola.length > 1 && <p className="text-[13px] text-muted">Tenés {cola.length - 1} {cola.length - 1 === 1 ? 'invitación más' : 'invitaciones más'}.</p>}
          {error && <p role="alert" className="err">{error}</p>}
          <div className="mt-1 flex w-full flex-wrap justify-center gap-2.5">
            <button className="btn btn-primary" disabled={pending} onClick={() => responder(true)}>Aceptar</button>
            <button className="btn" disabled={pending} onClick={() => responder(false)}>Rechazar</button>
          </div>
          <button type="button" className="text-[14px] font-semibold text-muted hover:underline" onClick={() => setCola([])}>Ver más tarde</button>
        </div>
      )}
    </Dialog>
  );
}
