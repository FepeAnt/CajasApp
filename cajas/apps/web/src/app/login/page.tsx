import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';
import { Logo } from '@/components/logo';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center py-8">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <div className="flex items-center gap-2.5 font-display text-[34px] font-extrabold tracking-tighter"><Logo size={44} />Cajas</div>
        <div>
          <h1 className="font-display text-[clamp(30px,6vw,44px)] font-extrabold leading-[1.05] tracking-tight">Cada peso en su caja.</h1>
          <p className="mt-2.5 text-[17px] text-muted">Cajas privadas o compartidas. Lo tuyo lo ves solo vos, y lo compartido lo ve solo quien aceptó tu invitación.</p>
        </div>
        {error === 'link' && <p role="alert" className="err">Ese link ya no sirve o venció. Pedí uno nuevo desde “¿Te olvidaste la contraseña?”. Los links se pueden usar una sola vez y vencen a la hora.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
