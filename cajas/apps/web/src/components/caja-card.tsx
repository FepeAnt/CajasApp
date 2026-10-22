import Link from 'next/link';
import { formatMoney } from '@cajas/core';
import type { CajaResumen } from '@/lib/types';
import { Icon } from './nav';
import { Faces } from './ui';

export function CajaCard({ caja, personas }: { caja: CajaResumen; personas: { id: string; nombre: string; avatar?: string | null }[] }) {
  const grupo = caja.subcajas > 0;
  const fondos = Number(grupo ? caja.fondos_total_centavos : caja.fondos_centavos);
  const meta = caja.meta_centavos ? Number(caja.meta_centavos) : 0;
  return (
    <Link href={`/cajas/${caja.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-card">
      <div className="flex h-[46px] items-center justify-between px-3.5 text-[13px] font-semibold text-white" style={{ background: caja.color }}>
        <span className="rounded-full bg-black/20 px-2.5 py-0.5">{caja.tipo === 'compartida' ? 'Compartida' : 'Privada'} · {caja.moneda}</span>
        <Icon name={caja.tipo === 'compartida' ? 'users' : 'lock'} size={18} />
      </div>
      <div className="flex flex-col gap-1.5 p-3.5">
        <h3 className="font-display text-[17px] font-bold">{caja.nombre}</h3>
        <div className={`tnum font-display text-2xl font-bold tracking-tight ${fondos < 0 ? 'text-neg' : ''}`}>{formatMoney(fondos, caja.moneda)}</div>
        <div className="text-[13px] text-muted">{grupo ? `Suma de ${caja.subcajas} ${caja.subcajas === 1 ? 'cajita' : 'cajitas'}${caja.fondos_centavos !== 0 ? ' y fondos propios' : ''}` : meta ? `${Math.min(100, Math.max(0, Math.round((fondos / meta) * 100)))}% de la meta de ${formatMoney(meta, caja.moneda)}` : 'Fondos disponibles'}</div>
        <Faces people={personas} />
      </div>
    </Link>
  );
}
