'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { mensajeError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import { Field } from './client-ui';

export function RestablecerForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (clave.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.');
    if (clave !== repetir) return setError('Las dos contraseñas tienen que ser iguales.');
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    setPending(false);
    if (err) return setError(/different from the old/i.test(err.message) ? 'Elegí una contraseña distinta a la anterior.' : mensajeError(err));
    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1">
      <Field label="Contraseña nueva" htmlFor="r-clave" hint="Al menos 8 caracteres."><input id="r-clave" type="password" className="input" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} /></Field>
      <Field label="Repetila" htmlFor="r-rep"><input id="r-rep" type="password" className="input" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></Field>
      {error && <p role="alert" className="err">{error}</p>}
      <button className="btn btn-primary mt-2 self-start" disabled={pending}>{pending ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  );
}
