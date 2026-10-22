import { FIXED_CATEGORIES, normalize, tokens } from './categorize';

/** Un gasto ya convertido a la moneda en la que se quiere analizar. */
export interface Expense {
  /** YYYY-MM-DD */
  date: string;
  category: string;
  description: string;
  /** centavos */
  value: number;
}

export interface Forecast {
  spent: number;
  projected: number;
  prevMonthTotal: number;
  /** Lo que se gastó el mes anterior hasta el mismo día. */
  prevMonthSameDay: number;
  daysInMonth: number;
  day: number;
  dailyVariable: number;
  /** Gastos fijos del mes pasado que todavía no aparecen en este. */
  pendingFixed: number;
  prevMonthName: string;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (m0: number): string => MONTHS[((m0 % 12) + 12) % 12] as string;

const pad = (n: number): string => String(n).padStart(2, '0');
export const monthKey = (y: number, m0: number): string => {
  const d = new Date(y, m0, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const daysIn = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();

const keyOf = (e: Expense): string => tokens(e.description)[0] ?? normalize(e.description);
const sum = (a: Expense[]): number => a.reduce((s, x) => s + x.value, 0);

/**
 * Proyección de cierre de mes: lo gastado + gastos fijos que faltan + ritmo diario de los gastos variables.
 * Al principio del mes el ritmo se mezcla con el del mes anterior para no proyectar con 2 o 3 días de datos.
 */
export function forecast(expenses: Expense[], today: Date): Forecast {
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = today.getDate();
  const dim = daysIn(y, m);
  const cm = monthKey(y, m);
  const pm = monthKey(y, m - 1);
  const dimPrev = daysIn(y, m - 1);
  const cur = expenses.filter((e) => e.date.startsWith(cm));
  const prev = expenses.filter((e) => e.date.startsWith(pm));
  const fixed = (e: Expense): boolean => FIXED_CATEGORIES.has(e.category);

  const spent = sum(cur);
  const varCur = sum(cur.filter((e) => !fixed(e)));
  const seen = new Set(cur.filter(fixed).map(keyOf));
  const pendingFixed = sum(prev.filter((e) => fixed(e) && !seen.has(keyOf(e))));
  const prevVarDaily = sum(prev.filter((e) => !fixed(e))) / dimPrev;
  const curVarDaily = varCur / Math.max(day, 1);
  const dailyVariable = day >= 10 ? curVarDaily : (curVarDaily * day + prevVarDaily * (10 - day)) / 10;

  return {
    spent,
    projected: Math.round(spent + pendingFixed + dailyVariable * (dim - day)),
    prevMonthTotal: sum(prev),
    prevMonthSameDay: sum(prev.filter((e) => Number(e.date.slice(8, 10)) <= day)),
    daysInMonth: dim,
    day,
    dailyVariable,
    pendingFixed,
    prevMonthName: monthName(m - 1),
  };
}

export function sumByCategory(expenses: Expense[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    if (e.date >= from && e.date <= to) out[e.category] = (out[e.category] ?? 0) + e.value;
  }
  return out;
}
