import { BIAS_LEANS, setSourceBiasOverride, setSourceWeight } from '@newswiz/db';
import type { BiasLean } from '@newswiz/db';
import { db } from '@/lib/server';

/** Mute/boost a source ({ weight: -1 | 0 | 1 }) or override its lean ({ userLean: lean | null }). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as { weight?: unknown; userLean?: unknown } | null;
  if (!body) return Response.json({ error: 'bad body' }, { status: 400 });
  let found = true;
  if ('weight' in body) {
    if (body.weight !== -1 && body.weight !== 0 && body.weight !== 1) return Response.json({ error: 'bad weight' }, { status: 400 });
    found = await setSourceWeight(db(), slug, body.weight);
  }
  if ('userLean' in body) {
    const lean = body.userLean;
    if (lean !== null && !BIAS_LEANS.includes(lean as BiasLean)) return Response.json({ error: 'bad lean' }, { status: 400 });
    found = await setSourceBiasOverride(db(), slug, lean as BiasLean | null);
  }
  return found ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
}
