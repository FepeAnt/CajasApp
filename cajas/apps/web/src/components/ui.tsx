import type { ReactNode } from 'react';
import { type Currency, formatMoney, type Insight } from '@cajas/core';
import { etiquetaDia } from '@/lib/dates';
import { avatarSrc } from '@/lib/avatar';
import type { Tx } from '@/lib/types';
import { CATEGORY_COLORS } from '@/lib/colors';
import { EliminarMovimiento } from './acciones';

const AVATAR_COLORS = ['#2A43E6', '#C2410C', '#0E8F6B', '#B4237B', '#7C3AED', '#0F766E', '#B45309', '#475569'];
export function Avatar({ id, nombre, size = 32, foto }: { id: string; nombre: string; size?: number; foto?: string | null }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const src = avatarSrc(foto);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={nombre} title={nombre} width={size} height={size} loading="lazy" className="inline-block flex-none rounded-full bg-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span title={nombre} className="inline-grid flex-none place-items-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}>
      {(nombre[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Faces({ people }: { people: { id: string; nombre: string; avatar?: string | null }[] }) {
  return (
    <div className="flex">
      {people.slice(0, 5).map((p, i) => (
        <span key={p.id} className={i ? '-ml-1.5' : ''}><span className="inline-block rounded-full border-2 border-surface"><Avatar id={p.id} nombre={p.nombre} size={24} foto={p.avatar} /></span></span>
      ))}
    </div>
  );
}

export function PanelHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      {right}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-3 py-7 text-center text-muted">
      <b className="mb-1 block text-base text-ink">{title}</b>
      {children}
    </div>
  );
}

const KIND_STYLE: Record<Insight['kind'], string> = {
  info: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-neg-soft text-neg',
  good: 'bg-pos-soft text-pos',
};
const ICON_PATH: Record<Insight['icon'], string> = {
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  up: 'M12 19V5M5 12l7-7 7 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  save: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  debt: 'M7 7h13l-3-3M17 17H4l3 3',
};

export function InsightList({ items }: { items: Insight[] }) {
  if (!items.length) return <Empty title="Sin novedades">Cuando haya más movimientos vas a ver proyecciones y consejos acá.</Empty>;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i, n) => (
        <div key={n} className="flex items-start gap-3 rounded-xl bg-surface2 p-3">
          <span className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] ${KIND_STYLE[i.kind]}`}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON_PATH[i.icon]} /></svg>
          </span>
          <div className="min-w-0"><b className="block font-bold">{i.title}</b><p className="text-sm text-muted">{i.text}</p></div>
        </div>
      ))}
    </div>
  );
}

export function CategoryBars({ cats, moneda }: { cats: Record<string, number>; moneda: Currency }) {
  const rows = Object.keys(cats).sort((a, b) => (cats[b] ?? 0) - (cats[a] ?? 0));
  const total = rows.reduce((s, k) => s + (cats[k] ?? 0), 0) || 1;
  if (!rows.length) return <Empty title="Sin gastos este mes" />;
  return (
    <div>
      {rows.map((k) => (
        <div key={k} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)_92px] items-center gap-3 py-1.5">
          <span>{k}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface2"><i className="block h-full" style={{ width: `${Math.max(3, ((cats[k] ?? 0) / total) * 100)}%`, background: CATEGORY_COLORS[k] ?? '#888' }} /></span>
          <b className="tnum text-right">{formatMoney(cats[k] ?? 0, moneda)}</b>
        </div>
      ))}
    </div>
  );
}

export function TxList({ txs, meId, nombres, mostrarCaja, puedeBorrar }: {
  txs: Tx[]; meId: string; nombres: Record<string, string>; mostrarCaja?: boolean; puedeBorrar?: (t: Tx) => boolean;
}) {
  if (!txs.length) return <Empty title="Todavía no hay movimientos">Cargá el primero con “Nuevo movimiento”.</Empty>;
  let last = '';
  return (
    <div>
      {txs.map((t) => {
        const moneda = (t.cajas?.moneda ?? 'ARS') as Currency;
        const header = t.fecha !== last ? <div className="pb-1.5 pt-3.5 text-[13px] font-semibold text-muted">{etiquetaDia(t.fecha)}</div> : null;
        last = t.fecha;
        const esTraspaso = t.tipo === 'traspaso_sal' || t.tipo === 'traspaso_ent';
        const pos = t.tipo === 'ingreso' || t.tipo === 'traspaso_ent';
        const signo = pos ? '+' : t.tipo === 'gasto' || t.tipo === 'traspaso_sal' ? '-' : '';
        const mine = t.divisiones.find((d) => d.user_id === meId)?.monto_centavos;
        const compartido = t.divisiones.length > 1;
        const quien = nombres[t.pagada_por] ?? 'alguien';
        let sub = t.categoria;
        if (t.tipo === 'ingreso') sub = `Ingresó ${t.pagada_por === meId ? 'vos' : quien}`;
        else if (t.tipo === 'transferencia') sub = 'Pago entre miembros';
        else if (esTraspaso) sub = t.tipo === 'traspaso_sal' ? 'Traspaso a otra caja' : 'Traspaso desde otra caja';
        else if (compartido) sub = `${t.categoria} · Pagó ${t.pagada_por === meId ? 'vos' : quien} · entre ${t.divisiones.length}`;
        if (mostrarCaja && t.cajas) sub = `${t.cajas.nombre} · ${sub}`;
        const color = esTraspaso ? '#7A8599' : (CATEGORY_COLORS[t.categoria] ?? '#888');
        return (
          <div key={t.id}>
            {header}
            <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}><i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /></div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{t.descripcion}</div>
                <div className="truncate text-[13px] text-muted">
                  {t.recurrente_id && <span className="chip mr-1.5">↻ mensual</span>}
                  {t.tipo === 'gasto' && t.categoria_confianza !== null && Number(t.categoria_confianza) < 1 && <span className="chip mr-1.5 bg-accent-soft text-accent" title="Categoría sugerida por la IA">IA</span>}
                  {sub}
                </div>
              </div>
              <div className={`tnum text-right font-bold ${pos ? 'text-pos' : ''}`}>
                {signo}{formatMoney(Number(t.monto_centavos), moneda)}
                {t.tipo === 'gasto' && compartido && mine && Number(mine) !== Number(t.monto_centavos) && <small className="block text-xs font-medium text-muted">tu parte {formatMoney(Number(mine), moneda)}</small>}
                {puedeBorrar?.(t) && <small className="mt-1 block"><EliminarMovimiento id={t.id} /></small>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
