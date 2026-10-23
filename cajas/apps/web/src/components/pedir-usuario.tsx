'use client';

import { useState } from 'react';
import { Dialog } from './client-ui';
import { UsernameForm } from './username-form';

/** Recuadro obligatorio para cuentas sin nombre de usuario: se muestra sobre la app y desaparece al guardarlo. */
export function PedirUsuario({ nombre, deseado }: { nombre: string; deseado?: string }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <Dialog open={abierto} onClose={() => undefined} cerrable={false} compacto title="Elegí tu nombre de usuario">
      <p className="-mt-2 mb-4 text-[14px] text-muted">Hola, {nombre}. {deseado ? `Elegiste @${deseado} al registrarte, pero no pudimos asignártelo (puede que otra persona lo haya tomado justo antes). Confirmalo o elegí otro. ` : ''}Es único y es lo que ven los demás para invitarte a sus cajas.</p>
      <UsernameForm actual={null} inicial={deseado} onboarding onDone={() => { setAbierto(false); window.location.reload(); }} />
    </Dialog>
  );
}
