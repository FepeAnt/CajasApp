'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton, useRpc } from './client-ui';

function Error({ text }: { text: string }) {
  return text ? <p role="alert" className="err">{text}</p> : null;
}

export function RespuestaInvitacion({ id }: { id: string }) {
  const { call, pending, error } = useRpc();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          className="btn btn-primary" disabled={pending}
          onClick={async () => {
            const r = await call('responder_invitacion', { p_id: id, p_aceptar: true });
            if (r.ok && typeof r.data === 'string') router.push(`/cajas/${r.data}`);
          }}
        >
          Aceptar
        </button>
        <button className="btn" disabled={pending} onClick={() => call('responder_invitacion', { p_id: id, p_aceptar: false })}>Rechazar</button>
      </div>
      <Error text={error} />
    </div>
  );
}

export function CancelarInvitacion({ id }: { id: string }) {
  const { call, pending, error } = useRpc();
  return (<><button className="btn btn-sm" disabled={pending} onClick={() => call('cancelar_invitacion', { p_id: id })}>Cancelar</button><Error text={error} /></>);
}

export function EliminarMovimiento({ id }: { id: string }) {
  const { call, pending, error } = useRpc();
  return (<><ConfirmButton label="Eliminar" disabled={pending} onConfirm={() => call('eliminar_movimiento', { p_id: id })} /><Error text={error} /></>);
}

export function RegistrarPago({ caja, de, a, monto }: { caja: string; de: string; a: string; monto: number }) {
  const { call, pending, error } = useRpc();
  return (
    <div>
      <button className="btn btn-sm" disabled={pending} onClick={() => call('registrar_pago', { p_caja: caja, p_de: de, p_a: a, p_monto: monto })}>Registrar pago</button>
      <Error text={error} />
    </div>
  );
}

export function QuitarMiembro({ caja, user }: { caja: string; user: string }) {
  const { call, pending, error } = useRpc();
  return (<><ConfirmButton label="Quitar" disabled={pending} onConfirm={() => call('quitar_miembro', { p_caja: caja, p_user: user })} /><Error text={error} /></>);
}

export function SalirDeCaja({ caja }: { caja: string }) {
  const { call, pending, error } = useRpc();
  const router = useRouter();
  return (
    <>
      <ConfirmButton label="Salir de la caja" disabled={pending} onConfirm={async () => { const r = await call('salir_de_caja', { p_caja: caja }); if (r.ok) router.push('/'); }} />
      <Error text={error} />
    </>
  );
}

export function DetenerRecurrente({ id }: { id: string }) {
  const { call, pending, error } = useRpc();
  return (<><ConfirmButton label="Dejar de repetir" confirmLabel="¿Dejar de repetir?" disabled={pending} onConfirm={() => call('detener_recurrente', { p_id: id })} /><Error text={error} /></>);
}

export function CerrarSesion() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn btn-sm w-full">Cerrar sesión</button>
    </form>
  );
}
