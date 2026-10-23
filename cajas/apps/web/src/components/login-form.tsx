'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { USERNAME_RE, limpiarUsername } from '@/lib/avatar';
import { mensajeError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import { Field, Segmented } from './client-ui';

export function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [modo, setModo] = useState<'entrar' | 'crear' | 'olvide'>('entrar');
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [libre, setLibre] = useState<'' | 'ok' | 'usado' | 'invalido' | 'error'>('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pending, setPending] = useState(false);

  // Disponibilidad del nombre de usuario mientras se escribe.
  useEffect(() => {
    if (modo !== 'crear') return;
    const u = limpiarUsername(usuario);
    if (!u) return setLibre('');
    if (!USERNAME_RE.test(u)) return setLibre('invalido');
    let vigente = true;   // ignora respuestas de nombres que ya se borraron
    const t = setTimeout(async () => {
      const { data, error: err } = await supabase.rpc('username_disponible', { p_u: u });
      if (!vigente) return;
      if (err) setLibre('error');   // no se pudo consultar: no se afirma que esté ocupado
      else setLibre(data === true ? 'ok' : 'usado');
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [usuario, modo, supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    const mail = email.trim().toLowerCase();
    if (modo === 'crear' && !nombre.trim()) return setError('Escribí tu nombre.');
    if (modo === 'crear' && !USERNAME_RE.test(limpiarUsername(usuario))) return setError('Elegí un nombre de usuario de 3 a 20 letras minúsculas, números o guion bajo (_).');
    if (modo === 'crear' && libre === 'usado') return setError('Ese nombre de usuario ya lo tiene otra persona. Probá con otro.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setError('Escribí un email válido, por ejemplo nombre@mail.com.');
    if (modo === 'olvide') {
      setPending(true);
      const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${location.origin}/auth/callback?next=/restablecer` });
      setPending(false);
      if (err && /rate limit|too many|fetch|network/i.test(err.message)) return setError(mensajeError(err));
      // Misma respuesta exista o no la cuenta: no se revela quién está registrado.
      setAviso('Si ese email tiene una cuenta, te mandamos un link para elegir una contraseña nueva. Revisá también el spam.');
      return;
    }
    if (clave.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.');
    setPending(true);
    if (modo === 'entrar') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password: clave });
      setPending(false);
      if (err) return setError(mensajeError(err));
      router.replace('/');
      router.refresh();
      return;
    }
    const { data, error: err } = await supabase.auth.signUp({
      email: mail, password: clave,
      options: { data: { nombre: nombre.trim(), username: limpiarUsername(usuario) }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setPending(false);
    if (err) return setError(mensajeError(err));
    if (data.session) { router.replace('/'); router.refresh(); return; }
    setAviso('Te mandamos un mail para confirmar tu cuenta. Abrí el link y volvé a ingresar.');
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1">
      {modo === 'olvide' ? (
        <div className="mb-4">
          <h2 className="font-display text-xl font-bold">Recuperar tu contraseña</h2>
          <p className="mt-1 text-[14px] text-muted">Escribí el email de tu cuenta y te mandamos un link para elegir una contraseña nueva.</p>
        </div>
      ) : <div className="mb-4"><Segmented value={modo} onChange={(m) => { setModo(m); setError(''); setAviso(''); }} options={[{ value: 'entrar', label: 'Ingresar' }, { value: 'crear', label: 'Crear cuenta' }]} /></div>}
      {modo === 'crear' && <Field label="Nombre" htmlFor="l-nombre"><input id="l-nombre" className="input" autoComplete="given-name" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sofi" maxLength={60} /></Field>}
      {modo === 'crear' && (
        <Field label="Nombre de usuario" htmlFor="l-user"
          hint={libre === 'ok' ? undefined : 'Único en toda la app. Es el que usan los demás para invitarte. Letras minúsculas, números o _.'}>
          <input id="l-user" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="sofi_ahorra" maxLength={21} />
          {libre === 'ok' && <p className="mt-1 text-[13px] text-pos">@{limpiarUsername(usuario)} está disponible.</p>}
          {libre === 'usado' && <p className="mt-1 text-[13px] text-neg">Ese nombre ya está en uso.</p>}
          {libre === 'invalido' && <p className="mt-1 text-[13px] text-neg">Usá de 3 a 20 letras minúsculas, números o _.</p>}
          {libre === 'error' && <p className="mt-1 text-[13px] text-muted">No pudimos comprobar si está libre. Podés seguir: lo verificamos al crear la cuenta.</p>}
        </Field>
      )}
      <Field label="Email" htmlFor="l-email"><input id="l-email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sofi@mail.com" /></Field>
      {modo !== 'olvide' && <Field label="Contraseña" htmlFor="l-clave" hint={modo === 'crear' ? 'Al menos 8 caracteres.' : undefined}>
        <input id="l-clave" type="password" className="input" autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} value={clave} onChange={(e) => setClave(e.target.value)} />
      </Field>}
      {modo === 'entrar' && <button type="button" className="self-start text-[14px] font-semibold text-accent hover:underline" onClick={() => { setModo('olvide'); setError(''); setAviso(''); }}>¿Te olvidaste la contraseña?</button>}
      {error && <p role="alert" className="err">{error}</p>}
      {aviso && <p role="status" className="mt-1 text-[14px] text-pos">{aviso}</p>}
      <button className="btn btn-primary mt-2 self-start" disabled={pending}>{modo === 'entrar' ? 'Ingresar' : modo === 'crear' ? 'Crear cuenta' : 'Enviarme el link'}</button>
      {modo === 'olvide' && <button type="button" className="mt-1 self-start text-[14px] font-semibold text-muted hover:underline" onClick={() => { setModo('entrar'); setError(''); setAviso(''); }}>← Volver a ingresar</button>}
    </form>
  );
}
