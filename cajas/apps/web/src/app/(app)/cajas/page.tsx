import type { Metadata } from 'next';
import { CajaCard } from '@/components/caja-card';
import { NuevaCaja } from '@/components/dialogs';
import { getCajas, getProfile, getTodosMiembros, personasDe } from '@/lib/data';

export const metadata: Metadata = { title: 'Tus cajas' };

export default async function Cajas() {
  const [profile, cajas, miembros] = await Promise.all([getProfile(), getCajas(), getTodosMiembros()]);
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold tracking-tight">Tus cajas</h1>
        <NuevaCaja monedaBase={profile!.moneda_base} className="btn btn-primary">Nueva caja</NuevaCaja>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {cajas.filter((c) => !c.padre_id).map((c) => <CajaCard key={c.id} caja={c} personas={personasDe(c, miembros)} />)}
      </div>
    </>
  );
}
