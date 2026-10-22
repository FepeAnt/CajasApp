import { describe, expect, it } from 'vitest';
import {
  budgetAlerts, classify, convert, DEFAULT_RATES, equalSplit, forecast, formatMoney, insights, parseMoney,
  settlements, shortMoney, splitTotal, validateSplit, type Expense,
} from '../src';

const nbsp = ' ';

describe('dinero', () => {
  it('formatea según la moneda', () => {
    expect(formatMoney(1250000, 'ARS')).toBe(`$${nbsp}12.500`);
    expect(formatMoney(123456, 'USD')).toBe(`US$${nbsp}1.234,56`);
    expect(formatMoney(25000, 'USD')).toBe(`US$${nbsp}250`);
    expect(formatMoney(-12050, 'EUR')).toBe(`-€${nbsp}120,50`);
    expect(formatMoney(0, 'ARS')).toBe(`$${nbsp}0`);
    expect(formatMoney(-10, 'ARS')).toBe(`$${nbsp}0`); // no muestra "-$ 0"
  });
  it('abrevia montos para gráficos', () => {
    expect(shortMoney(130_000_000)).toBe('1,3 M');
    expect(shortMoney(4_500_000)).toBe('45 k');
    expect(shortMoney(85_000)).toBe('850');
  });
  it('entiende cómo se escribe un monto en Argentina', () => {
    expect(parseMoney('12.500')).toBe(1_250_000);
    expect(parseMoney('12500,50')).toBe(1_250_050);
    expect(parseMoney('1.234,56')).toBe(123_456);
    expect(parseMoney('12500.5')).toBe(1_250_050);
    expect(parseMoney('$ 40')).toBe(4_000);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('abc')).toBe(0);
    expect(parseMoney('-5')).toBe(0);
  });
  it('convierte entre monedas con cotizaciones por US$', () => {
    expect(convert(10_000, 'USD', 'ARS', DEFAULT_RATES)).toBe(14_500_000);
    expect(convert(14_500_000, 'ARS', 'USD', DEFAULT_RATES)).toBe(10_000);
    expect(convert(500, 'ARS', 'ARS', DEFAULT_RATES)).toBe(500);
    expect(convert(9_200, 'EUR', 'USD', DEFAULT_RATES)).toBe(10_000);
    expect(() => convert(1, 'USD', 'ARS', { ...DEFAULT_RATES, ARS: 0 })).toThrow();
  });
});

describe('división y saldos', () => {
  it('reparte en partes iguales sin perder centavos', () => {
    const s = equalSplit(10_001, ['a', 'b', 'c']);
    expect(splitTotal(s)).toBe(10_001);
    expect(s).toEqual({ a: 3334, b: 3334, c: 3333 });
    expect(equalSplit(100, ['a'])).toEqual({ a: 100 });
  });
  it('rechaza entradas inválidas', () => {
    expect(() => equalSplit(0, ['a'])).toThrow();
    expect(() => equalSplit(100, [])).toThrow();
    expect(() => equalSplit(10.5, ['a'])).toThrow();
  });
  it('valida que la división sume el total', () => {
    expect(validateSplit(100, { a: 60, b: 40 })).toBeNull();
    expect(validateSplit(100, { a: 60, b: 30 })).toMatch(/Falta/);
    expect(validateSplit(100, { a: 60, b: 50 })).toMatch(/pasan/);
    expect(validateSplit(100, {})).toMatch(/al menos/);
  });
  it('arma pocas transferencias y deja todo en cero', () => {
    const net = { ana: 2000, beto: 1000, carla: -3000 };
    const s = settlements(net);
    expect(s).toEqual([{ from: 'carla', to: 'ana', amount: 2000 }, { from: 'carla', to: 'beto', amount: 1000 }]);
    const after: Record<string, number> = { ...net };
    for (const t of s) { after[t.from] = (after[t.from] ?? 0) + t.amount; after[t.to] = (after[t.to] ?? 0) - t.amount; }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
  it('ignora diferencias mínimas y no falla sin deudas', () => {
    expect(settlements({ a: 10, b: -10 })).toEqual([]);
    expect(settlements({})).toEqual([]);
  });
  it('minimiza el número de pagos en un caso de cuatro personas', () => {
    const s = settlements({ a: 5000, b: -2000, c: -2000, d: -1000 });
    expect(s.length).toBe(3);
    expect(s.reduce((x, t) => x + t.amount, 0)).toBe(5000);
  });
});

describe('categorización', () => {
  it('reconoce comercios y palabras clave', () => {
    expect(classify('Coto').category).toBe('Supermercado');
    expect(classify('Pedidos Ya cena').category).toBe('Comida afuera');
    expect(classify('YPF nafta').category).toBe('Combustible');
    expect(classify('Cuota Netflix').category).toBe('Suscripciones');
    expect(classify('Café Martínez').category).toBe('Comida afuera');
    expect(classify('Farmacité').category).toBe('Otros');
  });
  it('usa coincidencias parciales con menos confianza', () => {
    const c = classify('supermercados chinos');
    expect(c.category).toBe('Supermercado');
    expect(c.confidence).toBeLessThan(0.9);
  });
  it('prioriza lo que la persona corrigió', () => {
    const c = classify('Coto', { coto: 'Ocio' });
    expect(c).toMatchObject({ category: 'Ocio', source: 'learned' });
  });
  it('no inventa: lo desconocido queda en Otros con baja confianza', () => {
    expect(classify('xyzzy')).toMatchObject({ category: 'Otros', confidence: 0.3 });
    expect(classify('')).toMatchObject({ category: 'Otros', confidence: 0 });
  });
});

const e = (date: string, category: string, value: number, description = category): Expense => ({ date, category, value, description });

describe('proyección', () => {
  it('proyecta con el ritmo diario y suma fijos pendientes', () => {
    const today = new Date(2026, 9, 20); // 20 de octubre
    const list = [
      e('2026-09-05', 'Alquiler', 500_000, 'Alquiler'),
      e('2026-09-10', 'Supermercado', 300_000),
      e('2026-10-02', 'Supermercado', 200_000),
      e('2026-10-12', 'Ocio', 200_000),
    ];
    const f = forecast(list, today);
    expect(f.spent).toBe(400_000);
    expect(f.pendingFixed).toBe(500_000);            // el alquiler de septiembre aún no está en octubre
    expect(f.dailyVariable).toBeCloseTo(20_000, 5);  // 400.000 / 20 días
    expect(f.projected).toBe(400_000 + 500_000 + 20_000 * 11);
    expect(f.prevMonthTotal).toBe(800_000);
  });
  it('no cuenta el fijo como pendiente si ya se pagó este mes', () => {
    const f = forecast([e('2026-09-05', 'Alquiler', 500_000, 'Alquiler'), e('2026-10-05', 'Alquiler', 500_000, 'Alquiler')], new Date(2026, 9, 20));
    expect(f.pendingFixed).toBe(0);
  });
  it('al principio del mes mezcla con el ritmo del mes anterior', () => {
    const f = forecast([e('2026-09-10', 'Ocio', 3_000_000), e('2026-10-01', 'Ocio', 1_000_000)], new Date(2026, 9, 2));
    expect(f.projected).toBeLessThan(1_000_000 / 2 * 31);   // sin mezcla daría 15,5 M
  });
  it('funciona sin datos', () => {
    expect(forecast([], new Date(2026, 9, 20))).toMatchObject({ spent: 0, projected: 0, prevMonthTotal: 0 });
  });
});

describe('avisos', () => {
  const fmt = (c: number): string => `$${Math.round(c / 100)}`;
  const today = new Date(2026, 9, 20);
  it('avisa si te pasaste de un presupuesto o vas a pasarte', () => {
    const list = [e('2026-10-03', 'Compras', 15_000_000), e('2026-10-10', 'Comida afuera', 9_000_000)];
    const a = budgetAlerts('Personal', { Compras: 12_000_000, 'Comida afuera': 12_000_000, Ocio: 1_000_000 }, list, today, fmt);
    expect(a.map((x) => x.title)).toEqual(['Te pasaste del presupuesto de Compras', 'Comida afuera va a pasarse del presupuesto']);
    expect(a[0]?.kind).toBe('bad');
  });
  it('detecta un gasto inusual y suscripciones', () => {
    const list = [
      ...['2026-08-05', '2026-08-20', '2026-09-03', '2026-09-18', '2026-10-01'].map((d) => e(d, 'Supermercado', 4_000_000, 'Coto')),
      e('2026-10-18', 'Supermercado', 25_000_000, 'Coto'),
      e('2026-09-08', 'Suscripciones', 990_000, 'Netflix'), e('2026-09-15', 'Suscripciones', 650_000, 'Spotify'),
    ];
    const out = insights(list, today, fmt);
    expect(out.some((i) => i.title.startsWith('Gasto inusual'))).toBe(true);
    expect(out.some((i) => i.title.includes('2 suscripciones'))).toBe(true);
  });
  it('incluye deudas y no rompe con listas vacías', () => {
    expect(insights([], today, fmt)).toEqual([]);
    const out = insights([], today, fmt, { debts: { owe: 5000, owed: 2000 } });
    expect(out.map((i) => i.kind)).toEqual(['bad', 'good']);
  });
});
