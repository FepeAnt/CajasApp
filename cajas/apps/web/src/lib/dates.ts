const pad = (n: number): string => String(n).padStart(2, '0');
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Hoy", "Ayer" o "Martes 14 de octubre". `fecha` es YYYY-MM-DD. */
export function etiquetaDia(fecha: string, hoy = new Date()): string {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const f = new Date(y, m - 1, d);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const n = Math.round((h.getTime() - f.getTime()) / 864e5);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  const dia = DIAS[f.getDay()] as string;
  return `${dia[0]?.toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1]}`;
}
export const nombreMes = (m0: number): string => MESES[((m0 % 12) + 12) % 12] as string;
export const nombreDia = (d: number): string => DIAS[d] as string;
