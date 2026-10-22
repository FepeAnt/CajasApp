import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export const iaDisponible = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
const MODEL = (): string => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

/** Una sola respuesta de texto del modelo. Sin herramientas: solo ve el texto que le pasamos. */
export async function pedirTexto(system: string, user: string, maxTokens = 400): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
}
