/** Dinero siempre en centavos enteros, en la moneda de la caja. */

export type Currency = 'ARS' | 'USD' | 'EUR' | 'BRL' | 'UYU' | 'CLP';

export interface CurrencyInfo {
  code: Currency;
  name: string;
  symbol: string;
  /** Decimales que se muestran cuando el monto no es entero. */
  decimals: 0 | 2;
}

export const CURRENCIES: Record<Currency, CurrencyInfo> = {
  ARS: { code: 'ARS', name: 'Peso argentino', symbol: '$', decimals: 0 },
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  BRL: { code: 'BRL', name: 'Real brasileño', symbol: 'R$', decimals: 2 },
  UYU: { code: 'UYU', name: 'Peso uruguayo', symbol: '$U', decimals: 0 },
  CLP: { code: 'CLP', name: 'Peso chileno', symbol: 'CLP$', decimals: 0 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function isCurrency(x: string): x is Currency {
  return x in CURRENCIES;
}

/** Cotizaciones: unidades de cada moneda por 1 US$. */
export type Rates = Record<Currency, number>;

export const DEFAULT_RATES: Rates = { USD: 1, ARS: 1450, EUR: 0.92, BRL: 5.4, UYU: 40, CLP: 950 };

/** Convierte centavos de una moneda a otra usando cotizaciones por US$. */
export function convert(cents: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return cents;
  const rf = rates[from];
  const rt = rates[to];
  if (!(rf > 0) || !(rt > 0)) throw new Error(`Cotización inválida para ${from}/${to}`);
  return Math.round((cents / rf) * rt);
}

/** "$ 12.500", "US$ 1.234,56", "-€ 120,50". Los montos enteros no llevan decimales. */
export function formatMoney(cents: number, currency: Currency): string {
  const info = CURRENCIES[currency];
  const value = Math.abs(cents) / 100;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  const digits = info.decimals === 0 || whole ? 0 : 2;
  const text = new Intl.NumberFormat('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  // el signo solo aparece si lo que se muestra no es cero
  const shown = digits === 0 ? Math.round(value) : Math.round(value * 100);
  const negative = cents < 0 && shown > 0;
  return `${negative ? '-' : ''}${info.symbol} ${text}`;
}

/** Abreviado para ejes de gráficos: 1,3 M · 45 k · 850. */
export function shortMoney(cents: number): string {
  const p = Math.abs(cents) / 100;
  if (p >= 1e6) return `${(p / 1e6).toFixed(p >= 1e7 ? 0 : 1).replace('.', ',')} M`;
  if (p >= 1e4) return `${Math.round(p / 1e3)} k`;
  if (p >= 1e3) return `${(p / 1e3).toFixed(1).replace('.', ',')} k`;
  return String(Math.round(p));
}

/**
 * Lee lo que escribe una persona en Argentina: "12.500" (miles), "12500,50" (decimal con coma),
 * "1.234,56", "12500.50". Devuelve centavos, o 0 si no se entiende.
 */
export function parseMoney(input: string): number {
  let s = input.replace(/[\s$€]|US|R\$|CLP/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
}
