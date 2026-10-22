import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { UsernameForm } from '@/components/username-form';
import { getProfile } from '@/lib/data';

export const metadata: Metadata = { title: 'Elegí tu usuario' };

/** Pantalla obligatoria para cuentas que todavía no tienen nombre de usuario. */
export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.username) redirect('/');
  return (
    <main className="grid min-h-screen place-items-center py-8">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <div className="flex items-center gap-2.5 font-display text-[34px] font-extrabold tracking-tighter"><Logo size={44} />Cajas</div>
        <div>
          <h1 className="font-display text-[clamp(28px,5vw,38px)] font-extrabold leading-[1.05] tracking-tight">Elegí tu nombre de usuario, {profile.nombre}</h1>
          <p className="mt-2.5 text-muted">Es único y es lo que ven los demás cuando quieren invitarte a una caja. Después podés sumar una foto desde Ajustes.</p>
        </div>
        <UsernameForm actual={null} onboarding />
      </div>
    </main>
  );
}
