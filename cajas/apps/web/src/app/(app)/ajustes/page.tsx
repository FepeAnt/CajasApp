import type { Metadata } from 'next';
import { AvatarUploader } from '@/components/avatar-uploader';
import { UsernameForm } from '@/components/username-form';
import { FormAjustes } from '@/components/ajustes';
import { CerrarSesion } from '@/components/acciones';
import { getProfile, getSupabase } from '@/lib/data';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function Ajustes() {
  const profile = (await getProfile())!;
  const supabase = await getSupabase();
  const { data } = await supabase.from('tipos_cambio_usuario').select('moneda,por_usd');
  const propias = Object.fromEntries(((data ?? []) as { moneda: string; por_usd: number }[]).map((r) => [r.moneda, Number(r.por_usd)]));
  return (
    <>
      <div>
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold tracking-tight">Ajustes</h1>
        <p className="text-muted">{profile.email}</p>
      </div>
      <section className="panel flex max-w-xl flex-col gap-5">
        <h2 className="font-display text-lg font-bold">Tu perfil</h2>
        <AvatarUploader meId={profile.id} nombre={profile.nombre} actual={profile.avatar_url} />
        <UsernameForm actual={profile.username} />
      </section>
      <FormAjustes meId={profile.id} nombre={profile.nombre} base={profile.moneda_base} propias={propias} />
      <div><CerrarSesion /></div>
    </>
  );
}
