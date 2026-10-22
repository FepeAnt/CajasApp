'use client';

import { useState } from 'react';
import { Dialog } from './client-ui';
import { UsernameForm } from './username-form';

/** Recuadro obligatorio para cuentas sin nombre de usuario: se muestra sobre la app y desaparece al guardarlo. */
export function PedirUsuario({ nombre }: { nombre: string }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <Dialog open={abierto} onClose={() => undefined} cerrable={false} compacto title="Elegí tu nombre de usuario">
      <p className="-mt-2 mb-4 text-[14px] text-muted">Hola, {nombre}. Es único y es lo que ven los demás para invitarte a sus cajas. Después podés sumar una foto desde Ajustes.</p>
      <UsernameForm actual={null} onboarding onDone={() => setAbierto(false)} />
    </Dialog>
  );
}
