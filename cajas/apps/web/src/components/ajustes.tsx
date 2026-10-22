'use client';

import { useState, type FormEvent } from 'react';
import { CURRENCIES, CURRENCY_CODES, DEFAULT_RATES, type Currency } from '@cajas/core';
import { Field, useRpc } from './client-ui';

export function FormAjustes({ meId, nombre, base, propias }: { meId: string; nombre: string; base: Currency; propias: Record<string, number> }) {
  const { supabase, pending, error, setError } = useRpc();
  const [n, setN] = useState(nombre);
  const [b, setB] = useState<Currency>(base);
  const [tc, setTc] = useState<Record<string, string>>(Object.fromEntries(Object.entries(propias).map(([k, v]) => [k, String(v)])));
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setOk(false);
    const p = await supabase.from('profiles').update({ nombre: n.trim(), moneda_base: b }).eq('id', meId);
    if (p.error) { setError('No se pudo guardar el perfil.'); setBusy(false); return; }
    for (const code of CURRENCY_CODES.filter((c) => c !== 'USD')) {
      const raw = (tc[code] ?? '').replace(',', '.').trim();
      const val = Number(raw);
      if (raw === '') await supabase.from('tipos_cambio_usuario').delete().eq('user_id', meId).eq('moneda', code);
      else if (Number.isFinite(val) && val > 0) await supabase.from('tipos_cambio_usuario').upsert({ user_id: meId, moneda: code, por_usd: val }, { onConflict: 'user_id,moneda' });
      else { setError(`La cotización de ${code} no es válida.`); setBusy(false); return; }
    }
    setBusy(false); setOk(true);
    window.location.reload();
  }

  return (
    <form onSubmit={guardar} className="panel flex max-w-xl flex-col gap-5">
      <Field label="Tu nombre" htmlFor="aj-n"><input id="aj-n" className="input" value={n} onChange={(e) => setN(e.target.value)} maxLength={60} required /></Field>
      <Field label="Moneda principal" htmlFor="aj-b" hint="En esta moneda se muestra el total de todas tus cajas.">
        <select id="aj-b" className="input" value={b} onChange={(e) => setB(e.target.value as Currency)}>
          {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].name}</option>)}
        </select>
      </Field>
      <div>
        <div className="mb-1 font-semibold">Tus cotizaciones</div>
        <p className="mb-3 text-[13px] text-muted">Unidades de cada moneda por 1 US$. Se usan solo para convertir entre cajas de distinta moneda. Dejá vacío para usar la de referencia.</p>
        <div className="grid gap-3 min-[561px]:grid-cols-2">
          {CURRENCY_CODES.filter((c) => c !== 'USD').map((c) => (
            <Field key={c} label={`${c} por US$`} htmlFor={`tc-${c}`}>
              <input id={`tc-${c}`} className="input tnum" inputMode="decimal" placeholder={String(DEFAULT_RATES[c])} value={tc[c] ?? ''} onChange={(e) => setTc({ ...tc, [c]: e.target.value })} />
            </Field>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="err">{error}</p>}
      {ok && <p className="text-pos">Guardado.</p>}
      <button className="btn btn-primary self-start" disabled={busy || pending}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>
  );
}
