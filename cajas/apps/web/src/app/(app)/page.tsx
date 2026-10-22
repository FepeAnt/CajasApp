import { budgetAlerts, convert, formatMoney, forecast, insights, sumByCategory } from '@cajas/core';
import { CategoryBars, Empty, InsightList, PanelHead, TxList } from '@/components/ui';
import { MonthBars } from '@/components/charts';
import { CajaCard } from '@/components/caja-card';
import { MoverPlata, NuevaCaja, NuevoMovimiento } from '@/components/dialogs';
import { addDays, nombreDia, nombreMes, ymd } from '@/lib/dates';
import {
  cajasEscribibles, getCajas, getDeudas, getPresupuestos, getProfile, getRates, getTodosMiembros, personasDe, getTransacciones, gastosDeCaja,
  misGastos, nombresDe,
} from '@/lib/data';

export default async function Inicio() {
  const profile = (await getProfile())!;
  const base = profile.moneda_base;
  const hoy = new Date();
  const [cajas, rates, miembros] = await Promise.all([getCajas(), getRates(), getTodosMiembros()]);
  const desde = ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1));
  const [txs, presup, deudas] = await Promise.all([getTransacciones({ desde }), getPresupuestos(), getDeudas(profile.id, cajas, rates, base)]);

  const gastos = misGastos(txs, cajas, profile.id, rates, base);
  const f = forecast(gastos, hoy);
  const total = cajas.reduce((s, c) => s + convert(Number(c.fondos_centavos), c.moneda, base, rates), 0);
  const monedas = [...new Set(cajas.map((c) => c.moneda))];
  const fmtBase = (c: number): string => formatMoney(c, base);

  const alertas = cajas.flatMap((c) => {
    const b = Object.fromEntries(presup.filter((p) => p.caja_id === c.id).map((p) => [p.categoria, Number(p.limite_centavos)]));
    return budgetAlerts(c.nombre, b, gastosDeCaja(txs.filter((t) => t.caja_id === c.id)), hoy, (x) => formatMoney(x, c.moneda));
  });
  const avisos = [...alertas.slice(0, 2), ...insights(gastos, hoy, fmtBase, { debts: deudas })].slice(0, 6);
  const cats = sumByCategory(gastos, ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), ymd(hoy));
  const recientes = txs.slice(0, 10);
  const escribibles = cajasEscribibles(cajas, miembros, profile.id);
  const hora = hoy.getHours();
  const saludo = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-muted">{nombreDia(hoy.getDay())} {hoy.getDate()} de {nombreMes(hoy.getMonth())}</div>
          <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-[1.1] tracking-tight">{saludo}, {profile.nombre}</h1>
        </div>
        <div className="flex max-w-full flex-wrap gap-3">
          <MoverPlata cajas={escribibles} rates={rates}>Mover plata</MoverPlata>
          <NuevaCaja monedaBase={base} />
          <NuevoMovimiento cajas={escribibles} meId={profile.id} />
        </div>
      </div>

      <section className="grid items-end gap-6 overflow-hidden rounded-[20px] bg-ink p-[26px] text-bg min-[761px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="text-sm opacity-70">Fondos en tus cajas{monedas.length > 1 ? ` · en ${base}` : ''}</div>
          <div className="tnum my-1.5 font-display text-[clamp(40px,7vw,68px)] font-extrabold leading-none tracking-tighter">{fmtBase(total)}</div>
          <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-sm">
            <span>Gastaste <b>{fmtBase(f.spent)}</b> este mes</span>
            <span>Proyección <b>{fmtBase(f.projected)}</b></span>
            {deudas.owe > 0 && <span>Debés <b>{fmtBase(deudas.owe)}</b></span>}
            {deudas.owed > 0 && <span>Te deben <b>{fmtBase(deudas.owed)}</b></span>}
          </div>
          {monedas.length > 1 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 text-sm opacity-85">
              {monedas.map((m, i) => (
                <span key={m}>{i > 0 && <span className="mr-2 opacity-40">+</span>}<b>{formatMoney(cajas.filter((c) => c.moneda === m).reduce((s, c) => s + Number(c.fondos_centavos), 0), m)}</b></span>
              ))}
              <span className="opacity-60">convertido con tus cotizaciones</span>
            </div>
          )}
          <p className="mt-2.5 text-[13px] opacity-60">Solo se cuenta tu parte de los gastos compartidos.</p>
        </div>
        <div className="min-w-0"><MonthBars expenses={gastos} today={hoy} /></div>
      </section>

      <div className="grid gap-5 min-[981px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel">
          <PanelHead title="Tus cajas" right={<span className="text-[13px] text-muted">{cajas.filter((c) => !c.padre_id).length} en total</span>} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
            {cajas.filter((c) => !c.padre_id).map((c) => <CajaCard key={c.id} caja={c} personas={personasDe(c, miembros)} />)}
            <NuevaCaja monedaBase={base} className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-semibold text-muted hover:border-muted">+ Nueva caja</NuevaCaja>
          </div>
        </section>
        <section className="panel">
          <PanelHead title="Lo que detectó la IA" right={<span className="chip bg-accent-soft text-accent">Automático</span>} />
          <InsightList items={avisos} />
        </section>
      </div>

      <div className="grid gap-5 min-[981px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel">
          <PanelHead title="Últimos movimientos" />
          {recientes.length ? <TxList txs={recientes} meId={profile.id} nombres={nombresDe(miembros)} mostrarCaja /> : <Empty title="Todavía no hay movimientos">Cargá el primero con “Nuevo movimiento”.</Empty>}
        </section>
        <section className="panel self-start">
          <PanelHead title="En qué gastaste este mes" right={<span className="text-[13px] text-muted">{fmtBase(Object.values(cats).reduce((s, v) => s + v, 0))}</span>} />
          <CategoryBars cats={cats} moneda={base} />
        </section>
      </div>
    </>
  );
}
