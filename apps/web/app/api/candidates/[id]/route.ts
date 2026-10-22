import { ACCESS_MODELS, BIAS_LEANS, OWNERSHIP_TYPES, approveCandidate, rejectCandidate } from '@newswiz/db';
import type { AccessModel, BiasLean, OwnershipType } from '@newswiz/db';
import { db, parseId } from '@/lib/server';

/** Add a discovered outlet ({ action: 'approve', ... }) or dismiss it ({ action: 'reject' }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!id || !body) return Response.json({ error: 'bad request' }, { status: 400 });

  if (body.action === 'reject') {
    return (await rejectCandidate(db(), id)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
  }
  if (body.action !== 'approve') return Response.json({ error: 'bad action' }, { status: 400 });

  const access = body.access_model as AccessModel;
  const ownership = body.ownership_type as OwnershipType;
  const lean = (body.lean || null) as BiasLean | null;
  if (!ACCESS_MODELS.includes(access) || !OWNERSHIP_TYPES.includes(ownership) || (lean && !BIAS_LEANS.includes(lean))) {
    return Response.json({ error: 'bad fields' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const added = await approveCandidate(db(), id, { name, access_model: access, ownership_type: ownership, user_bias_lean: lean });
  return added ? Response.json({ ok: true, slug: added.slug }) : Response.json({ error: 'not found' }, { status: 404 });
}
