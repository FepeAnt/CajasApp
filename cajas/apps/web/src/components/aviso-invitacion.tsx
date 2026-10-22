'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Nueva { id: string; por: string; caja: string }

/**
 * Cartelito suave al abrir la app cuando hay invitaciones nuevas. Se marca como visto en el servidor
 * (así no vuelve a aparecer, ni en este ni en otro dispositivo). Al tocarlo lleva a Invitaciones.
 */
export function AvisoInvitacion({ nuevas }: { nuevas: Nueva[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [cierra, setCierra] = useState(false);
  const [datos, setDatos] = useState<Nueva[]>([]);
  const mostrada = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const n = nuevas.length;

  useEffect(() => {
    if (!n || mostrada.current) return;
    mostrada.current = true;
    setDatos(nuevas);
    setVisible(true);
    void createClient().rpc('marcar_invitaciones_vistas');
    timers.current = [setTimeout(() => setCierra(true), 7000), setTimeout(() => setVisible(false), 7400)];
  }, [n, nuevas]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!visible || !datos.length) return null;
  const primera = datos[0] as Nueva;
  const cant = datos.length;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={() => { setVisible(false); router.push('/invitaciones'); }}
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-2xl transition-all duration-500 ${cierra ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>✉</span>
        <span className="min-w-0">
          <b className="block">{cant === 1 ? 'Tenés una invitación nueva' : `Tenés ${cant} invitaciones nuevas`}</b>
          <span className="block truncate text-[13px] text-muted">{cant === 1 ? `@${primera.por} te invitó a “${primera.caja}”. Tocá para verla.` : 'Tocá para verlas y elegir si aceptás.'}</span>
        </span>
      </button>
    </div>
  );
}
