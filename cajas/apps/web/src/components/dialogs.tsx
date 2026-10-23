'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  CATEGORIES, classify, convert, CURRENCIES, CURRENCY_CODES, type Category, type Currency, equalSplit, formatMoney, isCurrency,
  learnableTokens, parseMoney, type Rates, validateSplit,
} from '@cajas/core';
import { Dialog, Field, Segmented, useRpc } from './client-ui';
import { Avatar } from './ui';
import { USERNAME_RE, limpiarUsername } from '@/lib/avatar';

const COLORS = ['#2A43E6', '#0E8F6B', '#C2410C', '#B4237B', '#7C3AED', '#0F766E', '#B45309', '#475569'];
const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* lo que la persona corrigió antes, guardado en este dispositivo */
const LEARN_KEY = 'cajas.categorias.aprendidas';
function readLearned(): Record<string, Category> {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY) ?? '{}') as Record<string, Category>; } catch { return {}; }
}
function saveLearned(desc: string, cat: Category) {
  try {
    const l = readLearned();
    learnableTokens(desc).forEach((w) => { l[w] = cat; });
    localStorage.setItem(LEARN_KEY, JSON.stringify(l));
  } catch { /* sin almacenamiento: no se aprende, y no pasa nada */ }
}

/* ───────────── nueva caja ───────────── */
export function NuevaCaja({ monedaBase, className = 'btn', children }: { monedaBase: Currency; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children ?? 'Nueva caja'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nueva caja"><NuevaCajaForm monedaBase={monedaBase} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function NuevaCajaForm({ monedaBase, onDone }: { monedaBase: Currency; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Currency>(monedaBase);
  const [color, setColor] = useState(COLORS[0] as string);
  const [meta, setMeta] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Ponele un nombre a la caja.');
    const m = parseMoney(meta);
    if (meta.trim() && !m) return setError('La meta tiene que ser un monto mayor a cero.');
    const r = await call('crear_caja', { p_nombre: nombre, p_color: color, p_moneda: moneda, p_meta: m || null });
    if (r.ok) { onDone(); if (typeof r.data === 'string') router.push(`/cajas/${r.data}`); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Nombre" htmlFor="c-nombre"><input id="c-nombre" className="input" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Vacaciones, Gatos, Auto" maxLength={60} /></Field>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px] flex-1">
          <Field label="Moneda" htmlFor="c-moneda">
            <select id="c-moneda" className="input" value={moneda} onChange={(e) => { if (isCurrency(e.target.value)) setMoneda(e.target.value); }}>
              {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].name}</option>)}
            </select>
          </Field>
        </div>
        <div className="min-w-[160px] flex-1">
          <Field label="Meta de ahorro (opcional)" htmlFor="c-meta"><input id="c-meta" className="input" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="500.000" /></Field>
        </div>
      </div>
      <Field label="Color" hint="La moneda no se puede cambiar después. Empieza privada y se vuelve compartida cuando alguien acepta tu invitación.">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
              className={`h-[30px] w-[30px] rounded-[9px] ${color === c ? 'outline outline-2 outline-offset-2 outline-ink' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </Field>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Crear caja</button></div>
    </form>
  );
}

/* ───────────── movimiento ───────────── */
export interface CajaEscribible { id: string; nombre: string; moneda: Currency; miembros: { id: string; nombre: string }[] }

export function NuevoMovimiento({ cajas, meId, cajaInicial, className = 'btn btn-primary', children }: { cajas: CajaEscribible[]; meId: string; cajaInicial?: string; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (cajas.length === 0) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children ?? 'Nuevo movimiento'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nuevo movimiento"><MovimientoForm cajas={cajas} meId={meId} cajaInicial={cajaInicial} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function MovimientoForm({ cajas, meId, cajaInicial, onDone }: { cajas: CajaEscribible[]; meId: string; cajaInicial?: string; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const [cajaId, setCajaId] = useState(cajas.find((c) => c.id === cajaInicial)?.id ?? (cajas[0] as CajaEscribible).id);
  const caja = cajas.find((c) => c.id === cajaId) as CajaEscribible;
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [monto, setMonto] = useState('');
  const [desc, setDesc] = useState('');
  const [fecha, setFecha] = useState(today());
  const [pagador, setPagador] = useState(meId);
  const [categoria, setCategoria] = useState<Category>('Otros');
  const [conf, setConf] = useState(0);
  const [tocada, setTocada] = useState(false);
  const [modo, setModo] = useState<'igual' | 'custom'>('igual');
  const [part, setPart] = useState<Record<string, boolean>>(() => Object.fromEntries(caja.miembros.map((m) => [m.id, true])));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [repite, setRepite] = useState(false);
  const seq = useRef(0);

  function cambiarCaja(id: string) {
    const c = cajas.find((x) => x.id === id) as CajaEscribible;
    setCajaId(id);
    setPagador(c.miembros.some((m) => m.id === meId) ? meId : (c.miembros[0] as { id: string }).id);
    setPart(Object.fromEntries(c.miembros.map((m) => [m.id, true])));
    setCustom({});
  }

  function cambiarDescripcion(v: string) {
    setDesc(v);
    if (!tocada) {
      const c = classify(v, readLearned());
      setCategoria(c.category);
      setConf(c.confidence);
    }
  }

  /** Si las reglas dudan, se le pregunta al modelo de lenguaje (ruta del servidor). */
  async function refinar() {
    if (tocada || tipo !== 'gasto' || desc.trim().length < 3 || conf >= 0.7) return;
    const n = ++seq.current;
    try {
      const res = await fetch('/api/ia/categorizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descripcion: desc }) });
      if (!res.ok) return;
      const j = (await res.json()) as { categoria?: Category; confianza?: number };
      if (n === seq.current && j.categoria && (j.confianza ?? 0) > conf) { setCategoria(j.categoria); setConf(j.confianza ?? 0); }
    } catch { /* sin IA se queda la sugerencia de las reglas */ }
  }

  const amt = parseMoney(monto);
  const ids = caja.miembros.filter((m) => part[m.id]).map((m) => m.id);
  const compartida = caja.miembros.length > 1;
  const reparto: Record<string, number> = (() => {
    if (!compartida) return { [pagador]: amt };
    if (modo === 'igual') return amt > 0 && ids.length ? equalSplit(amt, ids) : {};
    return Object.fromEntries(ids.map((i) => [i, parseMoney(custom[i] ?? '')]));
  })();
  const asignado = Object.values(reparto).reduce((s, v) => s + v, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!amt) return setError('Ingresá un monto mayor a cero.');
    if (!desc.trim()) return setError('Escribí una descripción.');
    if (tipo === 'gasto') {
      const msg = validateSplit(amt, reparto);
      if (msg) return setError(msg);
    }
    const r = await call('registrar_movimiento', {
      p_caja: cajaId, p_tipo: tipo, p_monto: amt, p_descripcion: desc, p_categoria: tipo === 'gasto' ? categoria : null,
      p_confianza: tipo === 'gasto' ? (tocada ? 1 : Number(conf.toFixed(2))) : null, p_fecha: fecha, p_pagada_por: pagador,
      p_divisiones: tipo === 'gasto' ? Object.fromEntries(Object.entries(reparto).filter(([, v]) => v > 0)) : {}, p_repite: repite,
    });
    if (r.ok) {
      if (tocada && tipo === 'gasto' && categoria !== classify(desc).category) saveLearned(desc, categoria);
      onDone();
    }
  }

  const simbolo = CURRENCIES[caja.moneda].symbol;
  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-3.5"><Segmented value={tipo} onChange={setTipo} options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]} /></div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[150px] flex-1">
          <Field label="Caja" htmlFor="m-caja">
            <select id="m-caja" className="input" value={cajaId} onChange={(e) => cambiarCaja(e.target.value)}>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </Field>
        </div>
        <div className="min-w-[150px] flex-1"><Field label="Fecha" htmlFor="m-fecha"><input id="m-fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field></div>
      </div>
      <Field label={`Monto (${simbolo})`} htmlFor="m-monto"><input id="m-monto" className="input" inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="12.500" autoComplete="off" /></Field>
      <Field label="Descripción" htmlFor="m-desc">
        <input id="m-desc" className="input" value={desc} onChange={(e) => cambiarDescripcion(e.target.value)} onBlur={refinar} maxLength={120} placeholder={tipo === 'gasto' ? 'Ej: Coto, nafta, Netflix' : 'Ej: Sueldo, aporte'} autoComplete="off" />
        {tipo === 'gasto' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="chip bg-accent-soft text-accent">{desc ? (tocada ? 'Elegida por vos' : `IA · ${Math.round(conf * 100)}% seguro`) : 'La IA elige la categoría'}</span>
            <select aria-label="Categoría" className="input !w-auto min-w-[150px] flex-1" value={categoria} onChange={(e) => { setCategoria(e.target.value as Category); setTocada(true); }}>
              {CATEGORIES.filter((c) => c !== 'Ingresos').map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
      </Field>
      <Field label={tipo === 'gasto' ? 'Pagó' : 'Lo puso'} htmlFor="m-pago">
        <select id="m-pago" className="input" value={pagador} onChange={(e) => setPagador(e.target.value)}>
          {caja.miembros.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.id === meId ? ' (vos)' : ''}</option>)}
        </select>
      </Field>
      {tipo === 'gasto' && compartida && (
        <Field label="Dividir entre">
          <div className="mb-2"><Segmented value={modo} onChange={setModo} options={[{ value: 'igual', label: 'Partes iguales' }, { value: 'custom', label: 'Montos a mano' }]} /></div>
          {caja.miembros.map((m) => (
            <div key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-2.5 py-1.5">
              <input type="checkbox" id={`p-${m.id}`} checked={!!part[m.id]} onChange={(e) => setPart({ ...part, [m.id]: e.target.checked })} aria-label={`Incluir a ${m.nombre}`} />
              <label htmlFor={`p-${m.id}`} className="truncate">{m.nombre}{m.id === meId ? ' (vos)' : ''}</label>
              {modo === 'custom'
                ? <input className="input" inputMode="decimal" disabled={!part[m.id]} value={custom[m.id] ?? ''} onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })} placeholder="0" aria-label={`Monto de ${m.nombre}`} />
                : <b className="tnum text-right">{part[m.id] ? formatMoney(reparto[m.id] ?? 0, caja.moneda) : '—'}</b>}
            </div>
          ))}
          {modo === 'custom' && amt > 0 && (
            <p className={`mt-1 text-[13px] ${asignado === amt ? 'text-muted' : 'text-neg'}`}>
              {asignado === amt ? 'Los montos suman el total.' : asignado < amt ? `Falta asignar ${formatMoney(amt - asignado, caja.moneda)}.` : `Te pasaste por ${formatMoney(asignado - amt, caja.moneda)}.`}
            </p>
          )}
        </Field>
      )}
      <label className="mb-3 flex items-center gap-2"><input type="checkbox" checked={repite} onChange={(e) => setRepite(e.target.checked)} /> Repetir todos los meses</label>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Guardar</button></div>
    </form>
  );
}

/* ───────────── mover plata ───────────── */
export interface CajaMovible { id: string; nombre: string; moneda: Currency; fondos: number }

export function MoverPlata({ cajas, rates, desde, className = 'btn', children }: { cajas: CajaMovible[]; rates: Rates; desde?: string; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (cajas.length < 2) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children ?? 'Mover plata'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mover plata entre cajas"><MoverForm cajas={cajas} rates={rates} desde={desde} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function MoverForm({ cajas, rates, desde, onDone }: { cajas: CajaMovible[]; rates: Rates; desde?: string; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const [from, setFrom] = useState(cajas.find((c) => c.id === desde)?.id ?? (cajas[0] as CajaMovible).id);
  const [to, setTo] = useState((cajas.find((c) => c.id !== from) as CajaMovible).id);
  const [sale, setSale] = useState('');
  const [llega, setLlega] = useState('');
  const [tocado, setTocado] = useState(false);
  const f = cajas.find((c) => c.id === from) as CajaMovible;
  const t = cajas.find((c) => c.id === to) as CajaMovible;
  const distinta = f.moneda !== t.moneda;
  const cs = parseMoney(sale);

  useEffect(() => {
    if (distinta && !tocado) setLlega(cs ? (convert(cs, f.moneda, t.moneda, rates) / 100).toFixed(2).replace('.', ',') : '');
  }, [cs, distinta, tocado, f.moneda, t.moneda, rates]);

  const ct = distinta ? parseMoney(llega) : cs;
  const nf = (x: number): string => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
  let hint = 'Las dos cajas usan la misma moneda.';
  if (distinta) {
    hint = cs && ct
      ? (cs >= ct ? `Cotización de esta operación: 1 ${t.moneda} = ${nf(cs / ct)} ${f.moneda}` : `Cotización de esta operación: 1 ${f.moneda} = ${nf(ct / cs)} ${t.moneda}`)
      : `Cotización sugerida: 1 ${t.moneda} = ${nf(convert(100, t.moneda, f.moneda, rates) / 100)} ${f.moneda}. Podés cambiar el monto que llega.`;
  }

  function cambiar(kind: 'from' | 'to', id: string) {
    const nf2 = kind === 'from' ? id : from;
    let nt = kind === 'to' ? id : to;
    if (nt === nf2) nt = (cajas.find((c) => c.id !== nf2) as CajaMovible).id;
    setFrom(nf2); setTo(nt); setTocado(false); setLlega('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cs || !ct) return setError('Ingresá el monto que sale y el que llega.');
    const r = await call('traspasar', { p_desde: from, p_hacia: to, p_sale: cs, p_llega: ct });
    if (r.ok) onDone();
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px] flex-1"><Field label="Desde" htmlFor="v-from"><select id="v-from" className="input" value={from} onChange={(e) => cambiar('from', e.target.value)}>{cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</select></Field></div>
        <div className="min-w-[160px] flex-1"><Field label="Hacia" htmlFor="v-to"><select id="v-to" className="input" value={to} onChange={(e) => cambiar('to', e.target.value)}>{cajas.filter((c) => c.id !== from).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</select></Field></div>
      </div>
      <p className="-mt-1.5 mb-3.5 text-[13px] text-muted">Disponible en {f.nombre}: {formatMoney(f.fondos, f.moneda)}</p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px] flex-1"><Field label={`Sale (${CURRENCIES[f.moneda].symbol})`} htmlFor="v-sale"><input id="v-sale" className="input" inputMode="decimal" autoFocus value={sale} onChange={(e) => setSale(e.target.value)} autoComplete="off" /></Field></div>
        {distinta && <div className="min-w-[160px] flex-1"><Field label={`Llega (${CURRENCIES[t.moneda].symbol})`} htmlFor="v-llega"><input id="v-llega" className="input" inputMode="decimal" value={llega} onChange={(e) => { setLlega(e.target.value); setTocado(true); }} autoComplete="off" /></Field></div>}
      </div>
      <p className="mb-2 text-[13px] text-muted">{hint}</p>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Mover</button></div>
    </form>
  );
}

/* ───────────── invitar ───────────── */
export function Invitar({ cajaId, cajaNombre, className = 'btn btn-sm btn-primary' }: { cajaId: string; cajaNombre: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>Invitar</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Invitar a “${cajaNombre}”`}><InvitarForm cajaId={cajaId} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

interface Resultado { id: string; username: string; nombre: string; avatar_url: string | null }

function InvitarForm({ cajaId, onDone }: { cajaId: string; onDone: () => void }) {
  const { call, pending, error, setError, supabase } = useRpc();
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState<Resultado | null>(null);
  const [res, setRes] = useState<Resultado[]>([]);
  const [rol, setRol] = useState<'editor' | 'viewer'>('editor');

  useEffect(() => {
    const n = limpiarUsername(q);
    if (elegido || n.length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_usuarios', { p_q: n });
      setRes((data ?? []) as Resultado[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q, elegido, supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const usuario = elegido?.username ?? limpiarUsername(q);
    if (!USERNAME_RE.test(usuario)) return setError('Escribí el nombre de usuario de la persona (3 a 20 letras, números o _).');
    const r = await call('invitar_a_caja', { p_caja: cajaId, p_usuario: usuario, p_rol: rol });
    if (r.ok) onDone();
  }
  return (
    <form onSubmit={submit} noValidate>
      <Field label="Nombre de usuario" htmlFor="i-user" hint="Buscala por su @usuario. Recibe la invitación en la app y decide si acepta. Hasta entonces no ve nada de la caja.">
        {elegido ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 p-2.5">
            <Avatar id={elegido.id} nombre={elegido.nombre} size={36} foto={elegido.avatar_url} />
            <div className="min-w-0 flex-1"><b className="block truncate">{elegido.nombre}</b><span className="text-[13px] text-muted">@{elegido.username}</span></div>
            <button type="button" className="btn btn-sm" onClick={() => { setElegido(null); setQ(''); }}>Cambiar</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-muted" aria-hidden>@</span>
              <input id="i-user" className="input" autoFocus autoCapitalize="none" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="usuario" maxLength={21} />
            </div>
            {res.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-xl border border-line" role="listbox" aria-label="Personas encontradas">
                {res.map((r) => (
                  <li key={r.id} role="option" aria-selected={false}>
                    <button type="button" className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface2" onClick={() => setElegido(r)}>
                      <Avatar id={r.id} nombre={r.nombre} size={32} foto={r.avatar_url} />
                      <span className="min-w-0"><b className="block truncate">{r.nombre}</b><span className="text-[13px] text-muted">@{r.username}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {limpiarUsername(q).length >= 3 && res.length === 0 && <p className="mt-1 text-[13px] text-muted">Si no aparece, revisá cómo se escribe su usuario.</p>}
          </>
        )}
      </Field>
      <Field label="Permiso" htmlFor="i-rol">
        <select id="i-rol" className="input" value={rol} onChange={(e) => setRol(e.target.value as 'editor' | 'viewer')}>
          <option value="editor">Puede ver y cargar movimientos</option>
          <option value="viewer">Solo puede ver</option>
        </select>
      </Field>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Enviar invitación</button></div>
    </form>
  );
}

/* ───────────── cajita dentro de una caja ───────────── */
export function NuevaSubcaja({ padreId, padreNombre, moneda, className = 'btn btn-sm' }: { padreId: string; padreNombre: string; moneda: Currency; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>+ Nueva cajita</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Nueva cajita en “${padreNombre}”`}><SubcajaForm padreId={padreId} moneda={moneda} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function SubcajaForm({ padreId, moneda, onDone }: { padreId: string; moneda: Currency; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const [nombre, setNombre] = useState('');
  const [meta, setMeta] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Ponele un nombre a la cajita.');
    const m = parseMoney(meta);
    if (meta.trim() && !m) return setError('La meta tiene que ser un monto mayor a cero.');
    const r = await call('crear_subcaja', { p_padre: padreId, p_nombre: nombre, p_meta: m || null });
    if (r.ok) onDone();
  }
  return (
    <form onSubmit={submit} noValidate>
      <Field label="Nombre" htmlFor="sc-nombre" hint={`Va en ${moneda} y la ven las mismas personas que la caja principal.`}>
        <input id="sc-nombre" className="input" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Heladera, Factura de luz" maxLength={60} />
      </Field>
      <Field label="Meta de ahorro (opcional)" htmlFor="sc-meta"><input id="sc-meta" className="input" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="500.000" /></Field>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Crear cajita</button></div>
    </form>
  );
}

/* ───────────── meta de una caja o cajita ───────────── */
const aTexto = (c: number): string => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace('.', ','));

export function EditarMeta({ cajaId, nombre, moneda, actual, className = 'btn btn-sm' }: { cajaId: string; nombre: string; moneda: Currency; actual: number | null; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{actual ? 'Editar meta' : 'Definir meta'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} compacto title={`Meta de “${nombre}”`}><MetaForm cajaId={cajaId} moneda={moneda} actual={actual} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function MetaForm({ cajaId, moneda, actual, onDone }: { cajaId: string; moneda: Currency; actual: number | null; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const [v, setV] = useState(actual ? aTexto(actual) : '');
  async function guardar(e: FormEvent) {
    e.preventDefault();
    const m = parseMoney(v);
    if (!m) return setError('Escribí cuánta plata querés juntar (un monto mayor a cero).');
    const r = await call('definir_meta', { p_caja: cajaId, p_meta: m });
    if (r.ok) onDone();
  }
  async function quitar() {
    const r = await call('definir_meta', { p_caja: cajaId, p_meta: null });
    if (r.ok) onDone();
  }
  return (
    <form onSubmit={guardar} noValidate>
      <Field label={`Cuánta plata querés juntar (${moneda})`} htmlFor="m-meta" hint="Podés cambiarla o sacarla cuando quieras. Lo que ya juntaste no se toca.">
        <input id="m-meta" className="input" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="500.000" />
      </Field>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex flex-wrap justify-between gap-2.5">
        {actual ? <button type="button" className="btn btn-danger" disabled={pending} onClick={quitar}>Quitar meta</button> : <span />}
        <span className="flex gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Guardar</button></span>
      </div>
    </form>
  );
}

/* ───────────── aportar a una cajita ───────────── */
export function Aportar({ cajaId, nombre, moneda, meId, faltante, className = 'btn btn-sm btn-primary' }: { cajaId: string; nombre: string; moneda: Currency; meId: string; faltante?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>Aportar</button>
      <Dialog open={open} onClose={() => setOpen(false)} compacto title={`Aportar a “${nombre}”`}><AporteForm cajaId={cajaId} moneda={moneda} meId={meId} faltante={faltante} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function AporteForm({ cajaId, moneda, meId, faltante, onDone }: { cajaId: string; moneda: Currency; meId: string; faltante?: number; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const [v, setV] = useState('');
  const [nota, setNota] = useState('');
  async function guardar(e: FormEvent) {
    e.preventDefault();
    const m = parseMoney(v);
    if (!m) return setError('Escribí cuánta plata sumás (un monto mayor a cero).');
    const r = await call('registrar_movimiento', {
      p_caja: cajaId, p_tipo: 'ingreso', p_monto: m, p_descripcion: nota.trim() || 'Aporte', p_categoria: null,
      p_confianza: null, p_fecha: today(), p_pagada_por: meId, p_divisiones: {}, p_repite: false,
    });
    if (r.ok) onDone();
  }
  return (
    <form onSubmit={guardar} noValidate>
      <Field label={`Monto (${moneda})`} htmlFor="a-monto" hint={faltante && faltante > 0 ? `Para llegar a la meta faltan ${formatMoney(faltante, moneda)}.` : undefined}>
        <input id="a-monto" className="input" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="20.000" />
      </Field>
      <Field label="Nota (opcional)" htmlFor="a-nota"><input id="a-nota" className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Aporte" maxLength={120} /></Field>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-2 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Sumar a la cajita</button></div>
    </form>
  );
}

/* ───────────── presupuestos ───────────── */
export function EditarPresupuestos({ cajaId, cajaNombre, moneda, actuales, hayAlguno }: { cajaId: string; cajaNombre: string; moneda: Currency; actuales: Record<string, number>; hayAlguno: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>{hayAlguno ? 'Editar' : 'Definir'}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Presupuestos de “${cajaNombre}”`}><PresupuestosForm cajaId={cajaId} moneda={moneda} actuales={actuales} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

function PresupuestosForm({ cajaId, moneda, actuales, onDone }: { cajaId: string; moneda: Currency; actuales: Record<string, number>; onDone: () => void }) {
  const { call, pending, error, setError } = useRpc();
  const cats = CATEGORIES.filter((c) => c !== 'Ingresos');
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c, actuales[c] ? String(actuales[c] / 100) : ''])));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const out: Record<string, number> = {};
    for (const c of cats) {
      const v = vals[c] ?? '';
      if (!v.trim()) continue;
      const m = parseMoney(v);
      if (!m) return setError(`El límite de ${c} tiene que ser mayor a cero.`);
      out[c] = m;
    }
    const r = await call('definir_presupuestos', { p_caja: cajaId, p_presupuestos: out });
    if (r.ok) onDone();
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="mb-3 text-[13px] text-muted">Límite mensual por categoría, en {moneda}. Dejá vacío para no poner límite.</p>
      {cats.map((c, i) => (
        <div key={c} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2.5 py-1">
          <label htmlFor={`b${i}`}>{c}</label>
          <input id={`b${i}`} className="input" inputMode="decimal" placeholder="Sin límite" value={vals[c] ?? ''} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />
        </div>
      ))}
      {error && <p role="alert" className="err">{error}</p>}
      <div className="mt-3 flex justify-end gap-2.5"><button type="button" className="btn" onClick={onDone}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Guardar</button></div>
    </form>
  );
}
