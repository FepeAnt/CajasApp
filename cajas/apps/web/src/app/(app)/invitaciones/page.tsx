import type { Metadata } from 'next';
import { RespuestaInvitacion } from '@/components/acciones';
import { Avatar, Empty } from '@/components/ui';
import { getInvitaciones } from '@/lib/data';

export const metadata: Metadata = { title: 'Invitaciones' };

export default async function Invitaciones() {
  const inv = await getInvitaciones();
  return (
    <>
      <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold tracking-tight">Invitaciones</h1>
      <section className="panel">
        {inv.length === 0 ? <Empty title="No tenés invitaciones pendientes">Cuando alguien te invite a una caja, la vas a ver acá.</Empty> : inv.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-4 border-t border-line py-4 first:border-t-0">
            <Avatar id={i.id} nombre={i.por_nombre} size={44} foto={i.por_avatar} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-bold">{i.caja_nombre}</div>
              <div className="text-[13px] text-muted">{i.por_nombre}{i.por_username ? ` (@${i.por_username})` : ''} te invitó como {i.rol === 'editor' ? 'persona que puede cargar movimientos' : 'persona que solo ve'}. No vas a ver nada de la caja hasta aceptar.</div>
            </div>
            <RespuestaInvitacion id={i.id} />
          </div>
        ))}
      </section>
    </>
  );
}
