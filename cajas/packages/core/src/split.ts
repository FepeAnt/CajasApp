/** División de gastos y cálculo de saldos. Todo en centavos enteros: nunca se pierde un centavo. */

export type Split = Record<string, number>;

/** Reparte en partes iguales; el resto de centavos va a las primeras personas, de a uno. */
export function equalSplit(total: number, userIds: string[]): Split {
  if (!Number.isInteger(total) || total <= 0) throw new Error('El monto tiene que ser un entero positivo');
  if (userIds.length === 0) throw new Error('Elegí al menos una persona');
  const base = Math.floor(total / userIds.length);
  let rest = total - base * userIds.length;
  const out: Split = {};
  for (const id of userIds) {
    out[id] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return out;
}

export function splitTotal(split: Split): number {
  return Object.values(split).reduce((s, v) => s + v, 0);
}

/** null si está bien; si no, el motivo en castellano. */
export function validateSplit(total: number, split: Split): string | null {
  const ids = Object.keys(split).filter((k) => (split[k] ?? 0) > 0);
  if (ids.length === 0) return 'Elegí al menos una persona.';
  const sum = splitTotal(Object.fromEntries(ids.map((k) => [k, split[k] as number])));
  if (sum !== total) return sum < total ? 'Falta asignar parte del monto.' : 'Los montos se pasan del total.';
  return null;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

/**
 * A partir del saldo neto de cada persona (positivo: le deben; negativo: debe) devuelve
 * pocas transferencias que dejan todo en cero. Ignora diferencias menores a `tolerance` centavos.
 */
export function settlements(net: Record<string, number>, tolerance = 50): Settlement[] {
  const creditors: [string, number][] = [];
  const debtors: [string, number][] = [];
  for (const [id, v] of Object.entries(net)) {
    if (v > tolerance) creditors.push([id, v]);
    else if (v < -tolerance) debtors.push([id, -v]);
  }
  creditors.sort((a, b) => b[1] - a[1]);
  debtors.sort((a, b) => b[1] - a[1]);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i] as [string, number];
    const c = creditors[j] as [string, number];
    const x = Math.min(d[1], c[1]);
    out.push({ from: d[0], to: c[0], amount: x });
    d[1] -= x;
    c[1] -= x;
    if (d[1] <= tolerance) i++;
    if (c[1] <= tolerance) j++;
  }
  return out;
}
