import 'server-only';
import { cache } from 'react';
import { convert, DEFAULT_RATES, type Currency, type Expense, isCurrency, type Rates, settlements } from '@cajas/core';
import { createClient } from './supabase/server';
import type { CajaResumen, Invitacion, Miembro, Presupuesto, Profile, Recurrente, Tx } from './types';

export const getSupabase = cache(async () => createClient());

export const getUser = cache(async () => {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data } = await supabase.from('profiles').select('id,nombre,email,moneda_base,username,avatar_url').eq('id', user.id).single();
  return (data as Profile | null) ?? null;
});

/** Cotizaciones por US$: las de referencia, pisadas por las propias de la persona. */
export const getRates = cache(async (): Promise<Rates> => {
  const supabase = await getSupabase();
  const [ref, own] = await Promise.all([
    supabase.from('tipos_cambio').select('moneda,por_usd'),
    supabase.from('tipos_cambio_usuario').select('moneda,por_usd'),
  ]);
  const rates: Rates = { ...DEFAULT_RATES };
  for (const r of [...((ref.data ?? []) as { moneda: string; por_usd: number }[]), ...((own.data ?? []) as { moneda: string; por_usd: number }[])]) {
    if (isCurrency(r.moneda)) rates[r.moneda] = Number(r.por_usd);
  }
  return rates;
});

export const getCajas = cache(async (): Promise<CajaResumen[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase.from('cajas_resumen').select('*').eq('archivada', false).order('created_at');
  return (data ?? []) as CajaResumen[];
});

export const getInvitaciones = cache(async (): Promise<Invitacion[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc('mis_invitaciones');
  return (data ?? []) as Invitacion[];
});

export async function getMiembros(cajaId: string): Promise<Miembro[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('caja_miembros')
    .select('user_id,rol,profiles(nombre,email,username,avatar_url)')
    .eq('caja_id', cajaId)
    .eq('estado', 'activo')
    .order('created_at');
  return (data ?? []) as unknown as Miembro[];
}

const TX_SELECT = '*,divisiones(user_id,monto_centavos),cajas(nombre,moneda,color)';

export async function getTransacciones(opts: { cajaId?: string; desde?: string; limit?: number } = {}): Promise<Tx[]> {
  const supabase = await getSupabase();
  let q = supabase.from('transacciones').select(TX_SELECT).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (opts.cajaId) q = q.eq('caja_id', opts.cajaId);
  if (opts.desde) q = q.gte('fecha', opts.desde);
  const { data } = await q.limit(opts.limit ?? 1000);
  return (data ?? []) as unknown as Tx[];
}

export async function getPresupuestos(cajaId?: string): Promise<Presupuesto[]> {
  const supabase = await getSupabase();
  let q = supabase.from('presupuestos').select('caja_id,categoria,limite_centavos');
  if (cajaId) q = q.eq('caja_id', cajaId);
  const { data } = await q;
  return (data ?? []) as Presupuesto[];
}

export async function getRecurrentes(cajaId: string): Promise<Recurrente[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('recurrentes')
    .select('id,caja_id,creada_por,tipo,monto_centavos,descripcion,categoria,dia,activo')
    .eq('caja_id', cajaId)
    .eq('activo', true)
    .order('dia');
  return (data ?? []) as Recurrente[];
}

/** Neto de cada miembro de una caja (positivo: le deben). */
export async function getSaldos(cajaId: string): Promise<Record<string, number>> {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc('saldos_caja', { p_caja: cajaId });
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { user_id: string; neto_centavos: number }[]) out[r.user_id] = Number(r.neto_centavos);
  return out;
}

/** Cuánto debe y cuánto le deben a la persona, sumando sus cajas compartidas en su moneda principal. */
export async function getDeudas(userId: string, cajas: CajaResumen[], rates: Rates, base: Currency) {
  const compartidas = cajas.filter((c) => c.miembros > 1);
  const netos = await Promise.all(compartidas.map((c) => getSaldos(c.id)));
  let owe = 0;
  let owed = 0;
  compartidas.forEach((c, i) => {
    const n = netos[i]?.[userId] ?? 0;
    if (n < -50) owe += convert(-n, c.moneda, base, rates);
    else if (n > 50) owed += convert(n, c.moneda, base, rates);
  });
  return { owe, owed };
}

/** Gastos de la persona (su parte de cada uno) convertidos a su moneda principal. */
export function misGastos(txs: Tx[], cajas: CajaResumen[], userId: string, rates: Rates, base: Currency): Expense[] {
  const monedas = new Map(cajas.map((c) => [c.id, c.moneda]));
  const out: Expense[] = [];
  for (const t of txs) {
    if (t.tipo !== 'gasto') continue;
    const mine = t.divisiones.find((d) => d.user_id === userId)?.monto_centavos;
    const moneda = monedas.get(t.caja_id);
    if (!mine || !moneda) continue;
    out.push({ date: t.fecha, category: t.categoria, description: t.descripcion, value: convert(Number(mine), moneda, base, rates) });
  }
  return out;
}

/** Gastos completos de una caja, en su moneda. */
export function gastosDeCaja(txs: Tx[]): Expense[] {
  return txs.filter((t) => t.tipo === 'gasto').map((t) => ({ date: t.fecha, category: t.categoria, description: t.descripcion, value: Number(t.monto_centavos) }));
}

export { settlements };

export interface MiembroFila { caja_id: string; user_id: string; rol: 'owner' | 'editor' | 'viewer'; profiles: { nombre: string; username: string | null; avatar_url: string | null } | null }

/** Miembros activos de todas las cajas a las que la persona tiene acceso. */
export async function getTodosMiembros(): Promise<MiembroFila[]> {
  const supabase = await getSupabase();
  const { data } = await supabase.from('caja_miembros').select('caja_id,user_id,rol,profiles(nombre,username,avatar_url)').eq('estado', 'activo');
  return (data ?? []) as unknown as MiembroFila[];
}

export interface Sentada { id: string; nombre: string; moneda: Currency; miembros: { id: string; nombre: string }[]; fondos: number }

/** Cajas donde la persona puede cargar movimientos, con sus miembros (para los formularios). */
export function cajasEscribibles(cajas: CajaResumen[], miembros: MiembroFila[], meId: string): Sentada[] {
  return cajas
    .filter((c) => miembros.some((m) => m.caja_id === (c.padre_id ?? c.id) && m.user_id === meId && (m.rol === 'owner' || m.rol === 'editor')))
    .map((c) => ({
      id: c.id, nombre: c.padre_id ? `${cajas.find((x) => x.id === c.padre_id)?.nombre ?? ''} › ${c.nombre}` : c.nombre, moneda: c.moneda, fondos: Number(c.fondos_centavos),
      miembros: miembros.filter((m) => m.caja_id === (c.padre_id ?? c.id)).map((m) => ({ id: m.user_id, nombre: m.profiles?.nombre ?? 'Alguien' })),
    }));
}

export function nombresDe(miembros: MiembroFila[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of miembros) out[m.user_id] = m.profiles?.nombre ?? 'Alguien';
  return out;
}

export interface Persona { id: string; nombre: string; avatar: string | null }

/** Personas de una caja (las de su caja principal si es una cajita), con foto. */
export function personasDe(caja: CajaResumen, miembros: MiembroFila[]): Persona[] {
  return miembros.filter((m) => m.caja_id === (caja.padre_id ?? caja.id)).map((m) => ({ id: m.user_id, nombre: m.profiles?.nombre ?? 'Alguien', avatar: m.profiles?.avatar_url ?? null }));
}

export interface InvitacionEnviada { id: string; user_id: string; username: string | null; nombre: string; avatar_url: string | null; rol: 'editor' | 'viewer'; creada: string }

/** Invitaciones pendientes de una caja (solo las ve su dueño). */
export async function getInvitacionesDeCaja(cajaId: string): Promise<InvitacionEnviada[]> {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc('invitaciones_de_caja', { p_caja: cajaId });
  return (data ?? []) as InvitacionEnviada[];
}
