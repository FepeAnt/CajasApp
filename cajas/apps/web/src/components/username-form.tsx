'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { USERNAME_RE, limpiarUsername } from '@/lib/avatar';
import { Field, useRpc } from './client-ui';

/** Elegir o cambiar el nombre de usuario, con chequeo de disponibilidad mientras se escribe. */
export function UsernameForm({ actual, onboarding, onDone, inicial }: { actual: string | null; onboarding?: boolean; onDone?: () => void; inicial?: string }) {
  const { call, pending, error, setError, supabase } = useRpc();
  const [u, setU] = useState(actual ?? inicial ?? '');
  const [estado, setEstado] = useState<'' | 'ok' | 'usado' | 'invalido' | 'igual' | 'error'>('');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setGuardado(false);
    const n = limpiarUsername(u);
    if (!n) return setEstado('');
    if (n === actual) return setEstado('igual');
    if (!USERNAME_RE.test(n)) return setEstado('invalido');
    let vigente = true;
    const t = setTimeout(async () => {
      const { data, error: err } = await supabase.rpc('username_disponible', { p_u: n });
      if (!vigente) return;
      if (err) setEstado('error');
      else setEstado(data === true ? 'ok' : 'usado');
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [u, actual, supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!USERNAME_RE.test(limpiarUsername(u))) return setError('Usá de 3 a 20 letras minúsculas, números o guion bajo (_).');
    const r = await call('definir_username', { p_u: u });
    if (!r.ok) return;
    if (onboarding) onDone?.(); else setGuardado(true);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1">
      <Field label="Nombre de usuario" htmlFor="u-user" hint="Único en toda la app. Los demás lo usan para invitarte a sus cajas.">
        <div className="flex items-center gap-2">
          <span className="text-muted" aria-hidden>@</span>
          <input id="u-user" className="input" autoFocus={onboarding} autoCapitalize="none" autoComplete="username" spellCheck={false} maxLength={21} value={u} onChange={(e) => setU(e.target.value)} placeholder="sofi_ahorra" />
        </div>
        {estado === 'ok' && <p className="mt-1 text-[13px] text-pos">@{limpiarUsername(u)} está disponible.</p>}
        {estado === 'usado' && <p className="mt-1 text-[13px] text-neg">Ese nombre ya está en uso.</p>}
        {estado === 'error' && <p className="mt-1 text-[13px] text-muted">No pudimos comprobar si está libre; se verifica al guardar.</p>}
        {estado === 'invalido' && <p className="mt-1 text-[13px] text-neg">Usá de 3 a 20 letras minúsculas, números o _.</p>}
      </Field>
      {error && <p role="alert" className="err">{error}</p>}
      {guardado && <p className="text-pos">Guardado.</p>}
      <button className="btn btn-primary self-start" disabled={pending || estado === 'usado' || estado === 'invalido' || estado === 'igual' || !u.trim()}>{onboarding ? 'Continuar' : 'Guardar nombre de usuario'}</button>
    </form>
  );
}
