/** Categorización automática por palabras clave, con aprendizaje de las correcciones de la persona. */

export const CATEGORIES = [
  'Supermercado', 'Comida afuera', 'Transporte', 'Combustible', 'Servicios', 'Alquiler', 'Suscripciones',
  'Salud', 'Ocio', 'Compras', 'Mantenimiento', 'Viajes', 'Ingresos', 'Otros',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Gastos que se repiten todos los meses (la proyección los trata aparte). */
export const FIXED_CATEGORIES: ReadonlySet<string> = new Set(['Alquiler', 'Servicios', 'Suscripciones']);

const KEYWORDS: Record<Exclude<Category, 'Otros'>, string> = {
  Supermercado: 'coto carrefour jumbo disco super supermercado verduleria carniceria almacen mercado changomas',
  'Comida afuera': 'rappi pedidosya resto restaurante cafe cafeteria burger mcdonalds pizza sushi delivery bar helado cena almuerzo empanadas starbucks',
  Transporte: 'sube colectivo subte uber cabify taxi tren peaje estacionamiento cochera',
  Combustible: 'ypf shell axion nafta combustible gnc',
  Servicios: 'luz edenor edesur gas metrogas agua aysa internet fibertel telecentro movistar expensas celular abl',
  Alquiler: 'alquiler renta',
  Suscripciones: 'netflix spotify disney hbo youtube icloud suscripcion prime chatgpt',
  Salud: 'farmacia farmacity medico dentista osde swiss prepaga psicologo analisis',
  Ocio: 'cine teatro recital entrada boliche steam playstation gimnasio gym',
  Compras: 'ropa zapatillas mercadolibre amazon shopping regalo zara',
  Mantenimiento: 'mecanico taller aceite cubiertas neumaticos service lavadero seguro patente vtv repuesto plomero electricista arreglo',
  Viajes: 'hotel cabana hospedaje pasaje vuelo aerolinea booking airbnb excursion ski',
  Ingresos: 'sueldo salario aporte cobro honorarios',
};

const KEYWORD_MAP: Map<string, Category> = new Map();
for (const [cat, words] of Object.entries(KEYWORDS)) {
  for (const w of words.split(' ')) KEYWORD_MAP.set(w, cat as Category);
}
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'por', 'para', 'con', 'en', 'un', 'una', 'y', 'a', 'mi', 'pago', 'compra']);

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export interface Classification {
  category: Category;
  /** 0..1. Debajo de 0.7 conviene consultar a un modelo de lenguaje o pedirle a la persona. */
  confidence: number;
  source: 'learned' | 'keyword' | 'prefix' | 'none';
}

/** `learned`: palabra → categoría que la persona eligió antes. */
export function classify(description: string, learned: Record<string, Category> = {}): Classification {
  const tk = tokens(description);
  for (const w of tk) {
    const c = learned[w];
    if (c) return { category: c, confidence: 0.97, source: 'learned' };
  }
  for (const w of tk) {
    const c = KEYWORD_MAP.get(w);
    if (c) return { category: c, confidence: 0.93, source: 'keyword' };
  }
  for (const w of tk) {
    if (w.length < 4) continue;
    for (const [k, c] of KEYWORD_MAP) {
      if (k.length >= 4 && (k.startsWith(w) || w.startsWith(k))) return { category: c, confidence: 0.7, source: 'prefix' };
    }
  }
  return { category: 'Otros', confidence: tk.length ? 0.3 : 0, source: 'none' };
}

/** Palabras de una descripción que conviene recordar cuando la persona corrige la categoría. */
export function learnableTokens(description: string): string[] {
  return tokens(description).filter((w) => w.length >= 3).slice(0, 2);
}
