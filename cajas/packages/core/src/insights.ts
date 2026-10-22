import { FIXED_CATEGORIES } from './categorize';
import { type Expense, forecast, monthKey, monthName, sumByCategory } from './forecast';

export type InsightKind = 'info' | 'warn' | 'bad' | 'good';
export interface Insight {
  kind: InsightKind;
  icon: 'trend' | 'up' | 'alert' | 'repeat' | 'save' | 'debt';
  title: string;
  text: string;
}

/** Cómo se muestra un monto en centavos (ya en la moneda correcta). */
export type MoneyFmt = (cents: number) => string;

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 0;
};

export interface BudgetStatus {
  category: string;
  limit: number;
  spent: number;
  /** Gasto del mes al ritmo actual. */
  projected: number;
}

export function budgetStatus(budgets: Record<string, number>, expenses: Expense[], today: Date): BudgetStatus[] {
  const cm = monthKey(today.getFullYear(), today.getMonth());
  const day = Math.max(today.getDate(), 1);
  const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const spent: Record<string, number> = {};
  for (const e of expenses) if (e.date.startsWith(cm)) spent[e.category] = (spent[e.category] ?? 0) + e.value;
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const s = spent[category] ?? 0;
      return { category, limit, spent: s, projected: Math.round((s / day) * dim) };
    });
}

export function budgetAlerts(boxName: string, budgets: Record<string, number>, expenses: Expense[], today: Date, fmt: MoneyFmt): Insight[] {
  const out: Insight[] = [];
  for (const b of budgetStatus(budgets, expenses, today)) {
    if (b.spent > b.limit) {
      out.push({ kind: 'bad', icon: 'alert', title: `Te pasaste del presupuesto de ${b.category}`, text: `Gastaste ${fmt(b.spent)} de ${fmt(b.limit)} en “${boxName}”.` });
    } else if (b.projected > b.limit * 1.05 && b.spent > b.limit * 0.5) {
      out.push({ kind: 'warn', icon: 'trend', title: `${b.category} va a pasarse del presupuesto`, text: `Al ritmo actual llegarías a ${fmt(b.projected)} y el límite es ${fmt(b.limit)} en “${boxName}”.` });
    }
  }
  return out;
}

export interface InsightOptions {
  /** Lo que la persona debe y lo que le deben en cajas compartidas (ya convertido). */
  debts?: { owe: number; owed: number };
}

/** Avisos y consejos a partir de los gastos. No inventa nada: cada aviso sale de un cálculo sobre los datos. */
export function insights(expenses: Expense[], today: Date, fmt: MoneyFmt, opts: InsightOptions = {}): Insight[] {
  const out: Insight[] = [];
  const f = forecast(expenses, today);
  const y = today.getFullYear();
  const m = today.getMonth();

  if (f.prevMonthTotal > 0 && f.spent > 0) {
    const diff = (f.projected - f.prevMonthTotal) / f.prevMonthTotal;
    const pct = Math.round(Math.abs(diff) * 100);
    const cmp = pct < 4 ? 'Casi igual que' : diff > 0 ? `Un ${pct}% más que en` : `Un ${pct}% menos que en`;
    const fixed = f.pendingFixed > 0 ? ` Incluye ${fmt(f.pendingFixed)} de gastos fijos que todavía no se cargaron.` : '';
    out.push({
      kind: diff > 0.1 ? 'warn' : diff < -0.1 ? 'good' : 'info',
      icon: 'trend',
      title: `Cerrarías el mes en ${fmt(f.projected)}`,
      text: `${cmp} ${f.prevMonthName} (${fmt(f.prevMonthTotal)}).${fixed}`,
    });
  }

  // Categorías que suben frente al mismo tramo del mes anterior
  const cur = sumByCategory(expenses, ymd(new Date(y, m, 1)), ymd(today));
  const prev = sumByCategory(expenses, ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m - 1, today.getDate())));
  const jump = Object.keys(cur)
    .filter((c) => !FIXED_CATEGORIES.has(c) && c !== 'Ingresos')
    .map((c) => ({ c, a: cur[c] ?? 0, b: prev[c] ?? 0 }))
    .filter((x) => x.b > 0 && x.a > x.b * 1.25 && x.a - x.b > 2_000_000)
    .sort((p, q) => q.a - q.b - (p.a - p.b))[0];
  if (jump) {
    out.push({ kind: 'warn', icon: 'up', title: `${jump.c} viene más alto de lo normal`, text: `Llevás ${fmt(jump.a)} este mes contra ${fmt(jump.b)} en el mismo tramo de ${f.prevMonthName}.` });
  }

  // Gasto inusual en los últimos 14 días
  const since = ymd(new Date(y, m, today.getDate() - 90));
  const recent = ymd(new Date(y, m, today.getDate() - 14));
  const hist = new Map<string, number[]>();
  for (const e of expenses) {
    if (e.date >= since && !FIXED_CATEGORIES.has(e.category)) hist.set(e.category, [...(hist.get(e.category) ?? []), e.value]);
  }
  for (const e of expenses) {
    if (e.date < recent || FIXED_CATEGORIES.has(e.category)) continue;
    const h = hist.get(e.category) ?? [];
    const med = median(h);
    if (h.length >= 4 && e.value > 2.5 * med && e.value > 5_000_000) {
      out.push({ kind: 'bad', icon: 'alert', title: `Gasto inusual: ${e.description}`, text: `${fmt(e.value)} es ${(e.value / med).toFixed(1)} veces lo habitual en ${e.category}. Si fue a propósito, no hay nada que hacer.` });
      break;
    }
  }

  // Suscripciones
  const subsNow = expenses.filter((e) => e.category === 'Suscripciones' && e.date.startsWith(monthKey(y, m)));
  const subsPrev = expenses.filter((e) => e.category === 'Suscripciones' && e.date.startsWith(monthKey(y, m - 1)));
  const subs = subsNow.length >= subsPrev.length ? subsNow : subsPrev;
  if (subs.length >= 2) {
    const names = [...new Set(subs.map((e) => e.description))];
    const total = subs.reduce((s, e) => s + e.value, 0);
    out.push({ kind: 'info', icon: 'repeat', title: `${names.length} suscripciones suman ${fmt(total)} por mes`, text: `${names.join(', ')}. Anual son ${fmt(total * 12)}. Cancelar una que no usás es el ahorro más fácil.` });
  }

  // Comida afuera sobre el total del mes anterior
  const prevAll = expenses.filter((e) => e.date.startsWith(monthKey(y, m - 1)));
  const total = prevAll.reduce((s, e) => s + e.value, 0);
  const eat = prevAll.filter((e) => e.category === 'Comida afuera').reduce((s, e) => s + e.value, 0);
  if (total > 0 && eat / total > 0.12) {
    out.push({ kind: 'good', icon: 'save', title: `Comida afuera fue el ${Math.round((eat / total) * 100)}% de tu gasto en ${monthName(m - 1)}`, text: `Bajarla un 30% libera ${fmt(eat * 0.3)} por mes, ${fmt(eat * 0.3 * 12)} al año.` });
  }

  if (opts.debts) {
    if (opts.debts.owe > 0) out.push({ kind: 'bad', icon: 'debt', title: `Debés ${fmt(opts.debts.owe)} en cajas compartidas`, text: 'Registrá el pago desde la caja para dejar los saldos en cero.' });
    if (opts.debts.owed > 0) out.push({ kind: 'good', icon: 'debt', title: `Te deben ${fmt(opts.debts.owed)} en cajas compartidas`, text: 'Podés recordarlo cuando cierres el mes.' });
  }
  return out;
}
