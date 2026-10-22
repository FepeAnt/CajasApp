'use client';

import { useRef, useState, type FormEvent } from 'react';

interface Msg { rol: 'yo' | 'ia'; texto: string }
const SUGERENCIAS = ['¿Cuánto gasté este mes?', '¿En qué categoría gasto más?', '¿Cómo voy a cerrar el mes?', '¿Cuánto debo en mis cajas compartidas?'];

export function Asistente() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  async function enviar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    setMsgs((m) => [...m, { rol: 'yo', texto: pregunta }]);
    setQ('');
    setCargando(true);
    try {
      const res = await fetch('/api/ia/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta }) });
      const j = (await res.json()) as { respuesta?: string };
      setMsgs((m) => [...m, { rol: 'ia', texto: res.ok && j.respuesta ? j.respuesta : 'No pude responder ahora. Probá de nuevo en un rato.' }]);
    } catch {
      setMsgs((m) => [...m, { rol: 'ia', texto: 'No hay conexión con el servidor.' }]);
    } finally {
      setCargando(false);
      setTimeout(() => fin.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void enviar(q); };

  return (
    <section className="panel flex min-h-[420px] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="text-muted">
            Preguntame por tus gastos. Pruebá con:
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => <button key={s} type="button" className="chip cursor-pointer hover:bg-accent-soft" onClick={() => void enviar(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${m.rol === 'yo' ? 'self-end bg-accent text-white' : 'self-start bg-line/60'}`}>{m.texto}</div>
        ))}
        {cargando && <div className="self-start text-muted">Pensando…</div>}
        <div ref={fin} />
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="Escribí tu pregunta" aria-label="Pregunta" />
        <button className="btn btn-primary" disabled={cargando || !q.trim()}>Enviar</button>
      </form>
    </section>
  );
}
