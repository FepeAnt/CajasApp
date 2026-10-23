import Link from 'next/link';
import { notFound } from 'next/navigation';
import { budgetStatus, formatMoney, forecast, insights, settlements, sumByCategory } from '@cajas/core';
import { CategoryBars, Empty, InsightList, PanelHead, Faces, TxList, Avatar } from '@/components/ui';
import { ProjectionChart } from '@/components/charts';
import { Icon } from '@/components/nav';
import { CancelarInvitacion, DetenerRecurrente, QuitarMiembro, RegistrarPago, SalirDeCaja } from '@/components/acciones';
import { Aportar, EditarMeta, EditarPresupuestos, Invitar, MoverPlata, NuevaSubcaja, NuevoMovimiento } from '@/components/dialogs';
import { addDays, nombreMes, ymd } from '@/lib/dates';
import { cajasEscribibles, getCajas, getInvitacionesDeCaja, getMiembros, getPresupuestos, getProfile, getRates, getRecurrentes, getSaldos, getTodosMiembros, getTransacciones, gastosDeCaja } from '@/lib/data';

const TABS = [['movimientos', 'Movimientos'], ['saldos', 'Saldos'], ['plan', 'Plan'], ['miembros', 'Miembros'], ['analisis', 'Análisis']] as const;

export default async function CajaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some(([k]) => k === tabParam) ? (tabParam as string) : 'movimientos';
  const profile = (await getProfile())!;
  const cajas = await getCajas();
  const caja = cajas.find((c) => c.id === id);
  if (!caja) notFound();

  const hoy = new Date();
  const raizId = caja.padre_id ?? id;
  const padre = caja.padre_id ? cajas.find((c) => c.id === caja.padre_id) : undefined;
  const subcajas = cajas.filter((c) => c.padre_id === id);
  const [miembros, todos, rates] = await Promise.all([getMiembros(raizId), getTodosMiembros(), getRates()]);
  const yo = miembros.find((m) => m.user_id === profile.id);
  const esOwner = yo?.rol === 'owner';
  const puedeEscribir = yo?.rol === 'owner' || yo?.rol === 'editor';
  const nombres = Object.fromEntries(miembros.map((m) => [m.user_id, m.profiles?.nombre ?? 'Alguien']));
  const fotos = Object.fromEntries(miembros.map((m) => [m.user_id, m.profiles?.avatar_url ?? null]));
  const personas = miembros.map((m) => ({ id: m.user_id, nombre: nombres[m.user_id] as string, avatar: fotos[m.user_id] }));
  const esGrupo = subcajas.length > 0;
  const total = Number(caja.fondos_total_centavos);
  const fmt = (c: number): string => formatMoney(c, caja.moneda);
  const fondos = Number(caja.fondos_centavos);

  const desde = ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1));
  const txs = await getTransacciones({ cajaId: id, desde: tab === 'movimientos' ? undefined : desde, limit: tab === 'movimientos' ? 300 : 1000 });
  const gastos = gastosDeCaja(txs);
  const escribibles = cajasEscribibles(cajas, todos, profile.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {padre ? <Link href={`/cajas/${padre.id}`} className="text-sm text-muted hover:text-ink">← {padre.nombre}</Link> : <Link href="/cajas" className="text-sm text-muted min-[761px]:hidden">← Cajas</Link>}
          <div className="flex items-center gap-2.5">
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: caja.color }} />
            <h1 className="truncate font-display text-[clamp(26px,4vw,36px)] font-extrabold tracking-tight">{caja.nombre}</h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            <span className="chip"><Icon name={caja.tipo === 'compartida' ? 'users' : 'lock'} size={14} /> {caja.tipo === 'compartida' ? 'Compartida' : 'Privada'}</span>
            <span className="chip">{caja.moneda}</span>
            {padre && <span className="chip">Cajita</span>}
            <Faces people={personas} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {puedeEscribir && <MoverPlata cajas={escribibles} rates={rates} desde={id}>Mover plata</MoverPlata>}
          {puedeEscribir && <NuevoMovimiento cajas={escribibles} meId={profile.id} cajaInicial={id} />}
        </div>
      </div>

      <section className="panel flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{esGrupo ? `Total con ${subcajas.length} ${subcajas.length === 1 ? 'cajita' : 'cajitas'}` : 'Fondos'}</div>
          <div className={`tnum font-display text-[clamp(32px,6vw,48px)] font-extrabold leading-none tracking-tight ${(esGrupo ? total : fondos) < 0 ? 'text-neg' : ''}`}>{fmt(esGrupo ? total : fondos)}</div>
          {esGrupo && <div className="mt-1.5 text-[13px] text-muted">Fondos propios de esta caja: {fmt(fondos)}</div>}
        </div>
        <Progreso caja={caja} esGrupo={esGrupo} total={total} fondos={fondos} fmt={fmt} puedeEscribir={puedeEscribir} meId={profile.id} />
      </section>

      {!padre && (esGrupo || puedeEscribir) && (
        <section className="panel">
          <PanelHead title="Cajitas" right={puedeEscribir ? <NuevaSubcaja padreId={id} padreNombre={caja.nombre} moneda={caja.moneda} /> : undefined} />
          {esGrupo ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {subcajas.map((c) => <TarjetaCajita key={c.id} c={c} puedeEscribir={puedeEscribir} meId={profile.id} />)}
            </div>
          ) : <p className="text-muted">Armá cajitas para separar la plata de esta caja por objetivo. Por ejemplo, en “Casa”: Heladera, Factura de luz.</p>}
        </section>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones de la caja">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/cajas/${id}?tab=${k}`} scroll={false} aria-current={tab === k ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold ${tab === k ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>{l}</Link>
        ))}
      </nav>

      {tab === 'movimientos' && (
        <section className="panel">
          <TxList txs={txs} meId={profile.id} nombres={nombres}
            puedeBorrar={(t) => puedeEscribir && t.tipo !== 'transferencia' && (esOwner || t.creada_por === profile.id)} />
        </section>
      )}

      {tab === 'saldos' && <Saldos cajaId={raizId} fotos={fotos} moneda={caja.moneda} nombres={nombres} meId={profile.id} puedeEscribir={puedeEscribir} compartida={miembros.length > 1} />}

      {tab === 'plan' && <Plan cajaId={id} cajaNombre={caja.nombre} moneda={caja.moneda} gastos={gastos} hoy={hoy} esOwner={esOwner} puedeEscribir={puedeEscribir} />}

      {tab === 'miembros' && <Miembros raizId={raizId} esOwner={esOwner} esCajita={Boolean(padre)} padreNombre={padre?.nombre} cajaNombre={(padre ?? caja).nombre} miembros={miembros} meId={profile.id} nombres={nombres} />}

      {tab === 'analisis' && (
        <div className="grid gap-5 min-[981px]:grid-cols-2">
          <section className="panel">
            <PanelHead title="Proyección del mes" />
            <ProjectionChart expenses={gastos} today={hoy} color={caja.color} />
          </section>
          <section className="panel">
            <PanelHead title={`Gastos de ${nombreMes(hoy.getMonth())}`} />
            <CategoryBars cats={sumByCategory(gastos, ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), ymd(hoy))} moneda={caja.moneda} />
          </section>
          <section className="panel min-[981px]:col-span-2">
            <PanelHead title="Lo que detectó la IA" />
            <InsightList items={insights(gastos, hoy, fmt)} />
          </section>
        </div>
      )}
    </>
  );
}

async function Saldos({ cajaId, fotos, moneda, nombres, meId, puedeEscribir, compartida }: { cajaId: string; fotos: Record<string, string | null>; moneda: import('@cajas/core').Currency; nombres: Record<string, string>; meId: string; puedeEscribir: boolean; compartida: boolean }) {
  if (!compartida) return <section className="panel"><Empty title="Es una caja privada">Los saldos entre personas aparecen cuando invitás a alguien.</Empty></section>;
  const neto = await getSaldos(cajaId);
  const pagos = settlements(neto);
  return (
    <div className="grid gap-5 min-[981px]:grid-cols-2">
      <section className="panel">
        <PanelHead title="Cómo está cada uno" />
        {Object.entries(neto).map(([u, n]) => (
          <div key={u} className="flex items-center gap-3 border-t border-line py-3">
            <Avatar id={u} nombre={nombres[u] ?? 'Alguien'} foto={fotos[u]} />
            <div className="flex-1 font-semibold">{nombres[u] ?? 'Alguien'}{u === meId && ' (vos)'}</div>
            <div className={`tnum font-bold ${n > 50 ? 'text-pos' : n < -50 ? 'text-neg' : 'text-muted'}`}>{Math.abs(n) <= 50 ? 'Al día' : n > 0 ? `Le deben ${formatMoney(n, moneda)}` : `Debe ${formatMoney(-n, moneda)}`}</div>
          </div>
        ))}
      </section>
      <section className="panel">
        <PanelHead title="Para dejar todo en cero" />
        {pagos.length === 0 ? <Empty title="Todo saldado">Nadie le debe nada a nadie.</Empty> : pagos.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 border-t border-line py-3">
            <div className="min-w-0 flex-1"><b>{nombres[p.from] ?? 'Alguien'}</b> le paga <b>{nombres[p.to] ?? 'Alguien'}</b><div className="tnum font-display text-lg font-bold">{formatMoney(p.amount, moneda)}</div></div>
            {puedeEscribir && <RegistrarPago caja={cajaId} de={p.from} a={p.to} monto={p.amount} />}
          </div>
        ))}
      </section>
    </div>
  );
}

async function Plan({ cajaId, cajaNombre, moneda, gastos, hoy, esOwner, puedeEscribir }: { cajaId: string; cajaNombre: string; moneda: import('@cajas/core').Currency; gastos: import('@cajas/core').Expense[]; hoy: Date; esOwner: boolean; puedeEscribir: boolean }) {
  const [presup, recs] = await Promise.all([getPresupuestos(cajaId), getRecurrentes(cajaId)]);
  const limites = Object.fromEntries(presup.map((p) => [p.categoria, Number(p.limite_centavos)]));
  const estados = budgetStatus(limites, gastos, hoy);
  return (
    <div className="grid gap-5 min-[981px]:grid-cols-2">
      <section className="panel">
        <PanelHead title="Presupuesto del mes" right={puedeEscribir ? <EditarPresupuestos cajaId={cajaId} cajaNombre={cajaNombre} moneda={moneda} actuales={limites} hayAlguno={presup.length > 0} /> : undefined} />
        {estados.length === 0 ? <Empty title="Sin presupuestos">Poné un límite por categoría y te avisamos antes de pasarte.</Empty> : estados.map((b) => {
          const pct = b.limit ? (b.spent / b.limit) * 100 : 0;
          const color = pct >= 100 ? 'var(--neg)' : b.projected > b.limit ? 'var(--warn)' : 'var(--pos)';
          return (
            <div key={b.category} className="border-t border-line py-3">
              <div className="mb-1 flex justify-between"><b>{b.category}</b><span className="tnum text-[13px] text-muted">{formatMoney(b.spent, moneda)} / {formatMoney(b.limit, moneda)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
              {b.projected > b.limit && pct < 100 && <div className="mt-1 text-[13px] text-warn">Al ritmo actual llegarías a {formatMoney(b.projected, moneda)}.</div>}
            </div>
          );
        })}
      </section>
      <section className="panel">
        <PanelHead title="Movimientos mensuales" />
        {recs.length === 0 ? <Empty title="Nada recurrente">Al cargar un movimiento podés marcarlo como “se repite cada mes”.</Empty> : recs.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-t border-line py-3">
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.descripcion}</div><div className="text-[13px] text-muted">Día {r.dia} · {r.categoria}</div></div>
            <div className="tnum font-bold">{formatMoney(Number(r.monto_centavos), moneda)}</div>
            {puedeEscribir && <DetenerRecurrente id={r.id} />}
          </div>
        ))}
      </section>
    </div>
  );
}

async function Miembros({ raizId, esOwner, esCajita, padreNombre, cajaNombre, miembros, meId, nombres }: {
  raizId: string; esOwner: boolean; esCajita: boolean; padreNombre?: string; cajaNombre: string;
  miembros: Awaited<ReturnType<typeof getMiembros>>; meId: string; nombres: Record<string, string>;
}) {
  const pendientes = esOwner && !esCajita ? await getInvitacionesDeCaja(raizId) : [];
  return (
    <div className="grid gap-5">
      <section className="panel">
        <PanelHead title="Quiénes participan" right={esOwner && !esCajita ? <Invitar cajaId={raizId} cajaNombre={cajaNombre} /> : undefined} />
        {esCajita && <p className="mb-2 text-[13px] text-muted">Una cajita la ven las mismas personas que su caja principal, “{padreNombre}”. Las invitaciones se manejan desde ahí.</p>}
        {miembros.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 border-t border-line py-3">
            <Avatar id={m.user_id} nombre={nombres[m.user_id] as string} foto={m.profiles?.avatar_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{nombres[m.user_id]}{m.user_id === meId && ' (vos)'}</div>
              <div className="truncate text-[13px] text-muted">{m.profiles?.username ? `@${m.profiles.username}` : ''}</div>
            </div>
            <span className="chip">{m.rol === 'owner' ? 'Dueño/a' : m.rol === 'editor' ? 'Puede cargar' : 'Solo ve'}</span>
            {esOwner && !esCajita && m.user_id !== meId && <QuitarMiembro caja={raizId} user={m.user_id} />}
          </div>
        ))}
        {!esOwner && !esCajita && <div className="border-t border-line pt-3"><SalirDeCaja caja={raizId} /></div>}
        <p className="mt-3 text-[13px] text-muted">Una persona invitada no ve nada de la caja hasta que acepta.</p>
      </section>
      {pendientes.length > 0 && (
        <section className="panel">
          <PanelHead title="Invitaciones pendientes" />
          {pendientes.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-t border-line py-3">
              <Avatar id={i.user_id} nombre={i.nombre} foto={i.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.nombre}</div>
                <div className="truncate text-[13px] text-muted">{i.username ? `@${i.username} · ` : ''}esperando respuesta · {i.rol === 'editor' ? 'puede cargar' : 'solo ve'}</div>
              </div>
              <CancelarInvitacion id={i.id} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function barra(f: number, meta: number): number {
  return Math.min(100, Math.max(0, (f / meta) * 100));
}

/** Avance hacia la meta, con lo que falta y un botón para definirla o cambiarla. */
function Progreso({ caja, esGrupo, total, fondos, fmt, puedeEscribir, meId }: {
  caja: import('@/lib/types').CajaResumen; esGrupo: boolean; total: number; fondos: number; fmt: (c: number) => string; puedeEscribir: boolean; meId: string;
}) {
  const meta = caja.meta_centavos ? Number(caja.meta_centavos) : 0;
  const metasHijas = Number(caja.subcajas_meta_centavos);
  const ahorrado = esGrupo ? total : fondos;
  if (!meta && !(esGrupo && metasHijas > 0)) {
    return puedeEscribir ? (
      <div className="flex gap-2">
        {caja.padre_id && <Aportar cajaId={caja.id} nombre={caja.nombre} moneda={caja.moneda} meId={meId} />}
        <EditarMeta cajaId={caja.id} nombre={caja.nombre} moneda={caja.moneda} actual={null} />
      </div>
    ) : null;
  }
  const objetivo = meta || metasHijas;
  const faltan = Math.max(0, objetivo - ahorrado);
  return (
    <div className="min-w-[220px] max-w-sm flex-1">
      <div className="mb-1 flex justify-between text-[13px] text-muted"><span>{meta ? 'Meta' : 'Suma de las metas de las cajitas'}</span><span>{fmt(objetivo)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full" style={{ width: `${barra(ahorrado, objetivo)}%`, background: caja.color }} /></div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className={faltan === 0 ? 'font-semibold text-pos' : 'text-muted'}>{faltan === 0 ? '¡Meta lograda!' : `${Math.round(barra(ahorrado, objetivo))}% · faltan ${fmt(faltan)}`}</span>
        {puedeEscribir && (
          <span className="flex gap-2">
            {caja.padre_id && <Aportar cajaId={caja.id} nombre={caja.nombre} moneda={caja.moneda} meId={meId} faltante={faltan} />}
            {meta ? <EditarMeta cajaId={caja.id} nombre={caja.nombre} moneda={caja.moneda} actual={meta} /> : null}
          </span>
        )}
      </div>
    </div>
  );
}

function TarjetaCajita({ c, puedeEscribir, meId }: { c: import('@/lib/types').CajaResumen; puedeEscribir: boolean; meId: string }) {
  const f = Number(c.fondos_centavos);
  const meta = c.meta_centavos ? Number(c.meta_centavos) : 0;
  const faltan = Math.max(0, meta - f);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <Link href={`/cajas/${c.id}`} className="flex flex-col gap-1 hover:opacity-80">
        <span className="flex items-center gap-2 font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.nombre}</span>
        <span className={`tnum font-display text-xl font-bold ${f < 0 ? 'text-neg' : ''}`}>{formatMoney(f, c.moneda)}</span>
        {meta ? (
          <span className="mt-1 block">
            <span className="block h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full" style={{ width: `${barra(f, meta)}%`, background: c.color }} /></span>
            <span className={`text-xs ${faltan === 0 ? 'font-semibold text-pos' : 'text-muted'}`}>{faltan === 0 ? `¡Meta lograda! (${formatMoney(meta, c.moneda)})` : `${Math.round(barra(f, meta))}% de ${formatMoney(meta, c.moneda)} · faltan ${formatMoney(faltan, c.moneda)}`}</span>
          </span>
        ) : <span className="text-xs text-muted">Sin meta</span>}
      </Link>
      {puedeEscribir && (
        <div className="mt-auto flex flex-wrap gap-2">
          <Aportar cajaId={c.id} nombre={c.nombre} moneda={c.moneda} meId={meId} faltante={meta ? faltan : undefined} />
          <EditarMeta cajaId={c.id} nombre={c.nombre} moneda={c.moneda} actual={meta || null} />
        </div>
      )}
    </div>
  );
}
