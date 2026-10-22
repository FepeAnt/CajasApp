import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CerrarSesion } from '@/components/acciones';
import { Logo } from '@/components/logo';
import { CajaLink, RailLink, TabLink } from '@/components/nav';
import { Avatar } from '@/components/ui';
import { NuevaCaja } from '@/components/dialogs';
import { PedirUsuario } from '@/components/pedir-usuario';
import { AvisoInvitacion } from '@/components/aviso-invitacion';
import { getCajas, getInvitaciones, getProfile } from '@/lib/data';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  const [cajas, invitaciones] = await Promise.all([getCajas(), getInvitaciones()]);
  const pendientes = invitaciones.length;

  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 pb-24 pt-4 min-[861px]:grid-cols-[240px_minmax(0,1fr)] min-[861px]:gap-8 min-[861px]:pb-10 min-[861px]:pt-5">
      <aside className="sticky top-5 hidden h-[calc(100vh-40px)] min-h-[520px] flex-col gap-[22px] self-start min-[861px]:flex">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[22px] font-extrabold tracking-tighter"><Logo />Cajas</Link>
        <nav className="flex flex-col gap-1" aria-label="Principal">
          <RailLink href="/" icon="home">Inicio</RailLink>
          <RailLink href="/invitaciones" icon="inbox" badge={pendientes}>Invitaciones</RailLink>
          <RailLink href="/asistente" icon="spark">Asistente IA</RailLink>
          <RailLink href="/ajustes" icon="cog">Ajustes</RailLink>
        </nav>
        <div className="flex min-h-0 flex-col gap-0.5 overflow-auto">
          <h3 className="px-3 pb-1.5 text-[13px] font-semibold text-muted">Tus cajas</h3>
          {cajas.filter((c) => !c.padre_id).map((c) => (
            <div key={c.id}>
              <CajaLink href={`/cajas/${c.id}`} color={c.color} shared={c.tipo === 'compartida'}>{c.nombre}</CajaLink>
              {cajas.filter((h) => h.padre_id === c.id).map((h) => (
                <div key={h.id} className="ml-4 border-l border-line pl-1"><CajaLink href={`/cajas/${h.id}`} color={h.color} shared={false}>{h.nombre}</CajaLink></div>
              ))}
            </div>
          ))}
          <NuevaCaja monedaBase={profile.moneda_base} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-muted hover:bg-surface">+ Nueva caja</NuevaCaja>
        </div>
        <div className="mt-auto flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5">
          <div className="flex items-center gap-2.5"><Avatar id={profile.id} nombre={profile.nombre} foto={profile.avatar_url} /><div className="min-w-0"><b className="block truncate leading-tight">{profile.nombre}</b><span className="block truncate text-xs text-muted">@{profile.username}</span></div></div>
          <CerrarSesion />
        </div>
      </aside>

      <div className="flex items-center justify-between gap-2.5 pt-1 min-[861px]:hidden">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[22px] font-extrabold tracking-tighter"><Logo />Cajas</Link>
        <div className="flex items-center gap-2"><Avatar id={profile.id} nombre={profile.nombre} size={30} foto={profile.avatar_url} /><div className="w-28"><CerrarSesion /></div></div>
      </div>

      {!profile.username
        ? <PedirUsuario nombre={profile.nombre} />
        : <AvisoInvitacion nuevas={invitaciones.filter((i) => i.nueva).map((i) => ({ id: i.id, caja: i.caja_nombre, por: i.por_nombre, porUsuario: i.por_username, foto: i.por_avatar, rol: i.rol }))} />}
      <main className="flex min-w-0 flex-col gap-6">{children}</main>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface px-2 pb-[calc(6px+env(safe-area-inset-bottom,0px))] pt-1.5 min-[861px]:hidden">
        <TabLink href="/" icon="home">Inicio</TabLink>
        <TabLink href="/cajas" icon="box">Cajas</TabLink>
        <TabLink href="/invitaciones" icon="inbox" badge={pendientes}>Invitaciones</TabLink>
        <TabLink href="/asistente" icon="spark">IA</TabLink>
        <TabLink href="/ajustes" icon="cog">Ajustes</TabLink>
      </nav>
    </div>
  );
}
