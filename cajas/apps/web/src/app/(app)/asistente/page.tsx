import type { Metadata } from 'next';
import { Asistente } from '@/components/asistente';

export const metadata: Metadata = { title: 'Asistente IA' };

export default function Page() {
  return (
    <>
      <div>
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold tracking-tight">Asistente IA</h1>
        <p className="text-muted">Responde con tus propios números. Solo ve lo que vos ya ves en la app.</p>
      </div>
      <Asistente />
    </>
  );
}
