import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { RestablecerForm } from '@/components/restablecer-form';
import { getUser } from '@/lib/data';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default async function Page() {
  // Solo se llega con el link del mail (que abre una sesión temporal).
  if (!(await getUser())) redirect('/login?error=link');
  return (
    <main className="grid min-h-screen place-items-center py-8">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <div className="flex items-center gap-2.5 font-display text-[34px] font-extrabold tracking-tighter"><Logo size={44} />Cajas</div>
        <div>
          <h1 className="font-display text-[clamp(28px,5vw,38px)] font-extrabold leading-[1.05] tracking-tight">Elegí tu contraseña nueva</h1>
          <p className="mt-2.5 text-muted">Después de guardarla ya entrás a tu cuenta.</p>
        </div>
        <RestablecerForm />
      </div>
    </main>
  );
}
