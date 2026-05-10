import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { assets, events, sends, contacts, campaigns } from '@/lib/schema-marketing';
import { sql } from 'drizzle-orm';

// ─── /api/marketing/d/[assetId]?contact=X&campaign=Y&token=Z ──────────────
// Asset download tracker. Funciona em 2 modos:
//
// Modo 1 — link direto em emails NOSSOS:
//   Email tem href={{link_pdf}} → template engine reescreve pra
//   /api/marketing/t/c/[trackingToken]?u=ENCODED(/api/marketing/d/[assetId])
//   Click → tracking event 'click' → redirect aqui → event 'asset_download'
//   → redirect final pra storage URL.
//
// Modo 2 — link em emails de OUTROS (APM, Insight, social):
//   URL pública: /api/marketing/d/123?contact=joao@xpto.com&campaign=apm_jan
//   Resolve contact por email, registra event independente de send.
//
// Asset.is_templated: se URL contém {{ibge}}, resolvido via contact.ibge.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const { assetId: assetIdStr } = await ctx.params;
  const assetId = Number(assetIdStr);
  const url = new URL(request.url);
  const trackingToken = url.searchParams.get('token');
  const contactParam = url.searchParams.get('contact')?.toLowerCase().trim();
  const campaignSlug = url.searchParams.get('campaign');

  if (!assetId) return new Response('asset id required', { status: 400 });

  const assetRow = await db
    .select()
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!assetRow[0]) return new Response('asset not found', { status: 404 });
  const asset = assetRow[0];

  // Resolver contactId — tenta por trackingToken (mais confiável), depois email
  let contactId: number | null = null;
  let sendId: number | null = null;
  let resolvedIbge: string | null = null;

  if (trackingToken) {
    const sendRow = await db
      .select({ id: sends.id, contactId: sends.contactId })
      .from(sends)
      .where(eq(sends.trackingToken, trackingToken))
      .limit(1);
    if (sendRow[0]) {
      sendId = sendRow[0].id;
      contactId = sendRow[0].contactId;
    }
  }

  if (!contactId && contactParam) {
    const cRow = await db
      .select({ id: contacts.id, ibge: contacts.ibge })
      .from(contacts)
      .where(eq(contacts.email, contactParam))
      .limit(1);
    if (cRow[0]) {
      contactId = cRow[0].id;
      resolvedIbge = cRow[0].ibge;
    }
  }

  if (contactId && !resolvedIbge) {
    const cRow = await db
      .select({ ibge: contacts.ibge })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    resolvedIbge = cRow[0]?.ibge ?? null;
  }

  // Resolver URL final (templated com {{ibge}} → contact.ibge)
  let finalUrl = asset.storageUrl;
  if (asset.isTemplated && resolvedIbge) {
    finalUrl = finalUrl.replace(/\{\{\s*ibge\s*\}\}/g, resolvedIbge);
  }

  // Registrar event (best-effort — não bloqueia download)
  if (sendId && contactId) {
    void db
      .insert(events)
      .values({
        sendId,
        contactId,
        type: 'asset_download',
        payload: { assetId, assetName: asset.name, campaignSlug },
        metadata: {
          ua: request.headers.get('user-agent') ?? '',
          ip: request.headers.get('x-forwarded-for')?.split(',')[0] ?? '',
        },
      })
      .catch(() => {});
  }

  // Redirect 302 — browser baixa o arquivo no storage
  return Response.redirect(finalUrl, 302);
}
