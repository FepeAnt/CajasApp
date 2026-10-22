import { type Expense, forecast, monthKey, monthName, shortMoney } from '@cajas/core';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Gasto de los últimos 4 meses; el actual va proyectado (borde punteado). */
export function MonthBars({ expenses, today }: { expenses: Expense[]; today: Date }) {
  const W = 420, H = 170, B = 26, T = 22, bw = 54;
  const f = forecast(expenses, today);
  const months = [3, 2, 1, 0].map((back) => {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const k = monthKey(d.getFullYear(), d.getMonth());
    return { label: monthName(d.getMonth()).slice(0, 3), value: expenses.filter((e) => e.date.startsWith(k)).reduce((s, e) => s + e.value, 0), current: back === 0 };
  });
  const maxV = Math.max(...months.map((m) => (m.current ? f.projected : m.value)), 1);
  const gap = (W - bw * 4) / 5;
  const y = (v: number): number => T + (1 - v / maxV) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Gasto por mes, el último proyectado">
      {months.map((m, i) => {
        const x = gap + i * (bw + gap);
        const top = y(m.value);
        const proj = y(f.projected);
        return (
          <g key={m.label + i}>
            <rect x={x} y={top} width={bw} height={Math.max(H - B - top, 0)} rx={6} fill="currentColor" opacity={m.current ? 0.95 : 0.35} />
            {m.current && <rect x={x} y={proj} width={bw} height={Math.max(top - proj, 0)} rx={6} fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="4 4" opacity={0.7} />}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.7}>{m.label}</text>
            <text x={x + bw / 2} y={(m.current ? proj : top) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="currentColor">{shortMoney(m.current ? f.projected : m.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Gasto acumulado del mes, el del mes anterior (gris) y la proyección (punteada). */
export function ProjectionChart({ expenses, today, color }: { expenses: Expense[]; today: Date; color: string }) {
  const f = forecast(expenses, today);
  const W = 600, H = 210, L = 44, R = 14, T = 14, B = 26;
  const cm = monthKey(today.getFullYear(), today.getMonth());
  const pm = monthKey(today.getFullYear(), today.getMonth() - 1);
  const cum = (key: string, days: number): number[] => {
    const out: number[] = [];
    let s = 0;
    for (let d = 1; d <= days; d++) {
      s += expenses.filter((e) => e.date === `${key}-${pad(d)}`).reduce((a, e) => a + e.value, 0);
      out.push(s);
    }
    return out;
  };
  const cur = cum(cm, f.day);
  const prev = cum(pm, Math.min(new Date(today.getFullYear(), today.getMonth(), 0).getDate(), f.daysInMonth));
  const max = Math.max(f.projected, prev[prev.length - 1] ?? 0, 1) * 1.1;
  const x = (d: number): number => L + ((d - 1) / Math.max(f.daysInMonth - 1, 1)) * (W - L - R);
  const y = (v: number): number => T + (1 - v / max) * (H - T - B);
  const path = (a: number[]): string => a.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = cur[cur.length - 1] ?? 0;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Gasto acumulado del mes y proyección">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max * i) / 4;
          return (<g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{shortMoney(v)}</text></g>);
        })}
        {[1, 8, 15, 22, f.daysInMonth].map((d) => (<text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{d}</text>))}
        <path d={path(prev)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 4" opacity={0.7} />
        <path d={`${path(cur)} L${x(f.day)} ${y(0)} L${x(1)} ${y(0)} Z`} fill={color} opacity={0.14} />
        <path d={path(cur)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        <path d={`M${x(f.day)} ${y(last)} L${x(f.daysInMonth)} ${y(f.projected)}`} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="6 5" />
        <circle cx={x(f.day)} cy={y(last)} r={4.5} fill={color} />
        <circle cx={x(f.daysInMonth)} cy={y(f.projected)} r={4.5} fill="var(--surface)" stroke={color} strokeWidth={2.5} />
        <text x={x(f.daysInMonth)} y={y(f.projected) - 10} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--ink)">{shortMoney(f.projected)}</text>
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-4 text-[13px] text-muted"><span>Línea llena: gastado hasta hoy</span><span>Punteada: proyección</span><span>Gris: {f.prevMonthName}</span></div>
    </div>
  );
}
