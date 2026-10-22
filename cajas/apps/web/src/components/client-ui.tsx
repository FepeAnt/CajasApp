'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mensajeError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

/** Diálogo modal con <dialog>: foco atrapado, Escape y fondo bloqueado vienen del navegador. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[520px] overflow-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/55"
    >
      {open && (
        <div className="p-[22px]">
          <h2 className="mb-4 font-display text-[22px] font-bold tracking-tight">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Llama a una función de la base de datos con la sesión de la persona y refresca la pantalla. */
export function useRpc() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const call = useCallback(
    async (fn: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data: unknown }> => {
      setPending(true);
      setError('');
      const { data, error: e } = await supabase.rpc(fn, args);
      setPending(false);
      if (e) {
        setError(mensajeError(e));
        return { ok: false, data: null };
      }
      router.refresh();
      return { ok: true, data };
    },
    [supabase, router],
  );
  return { call, pending, error, setError, supabase };
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex gap-0.5 rounded-[10px] border border-line bg-surface2 p-[3px]" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3.5 py-1.5 font-semibold ${value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botón de dos pasos para acciones que no se pueden deshacer (sin usar confirm()). */
export function ConfirmButton({ label, confirmLabel = '¿Seguro?', onConfirm, className = 'btn btn-sm btn-danger', disabled }: { label: string; confirmLabel?: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" disabled={disabled} className={className} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}
