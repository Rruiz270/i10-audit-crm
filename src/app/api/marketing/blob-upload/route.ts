import type { NextRequest } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireUser, requireRole } from '@/lib/session';
import { MEDIA_ALLOWED_TYPES_LIST, MEDIA_MAX_UPLOAD_BYTES } from '@/lib/marketing/media-types';

// ─── /api/marketing/blob-upload ────────────────────────────────────────────
// Emite o token de upload CLIENT-DIRECT pro Vercel Blob. O browser faz o PUT do
// arquivo direto no Blob (via `upload()` do @vercel/blob/client), contornando o
// limite de body da função serverless (~4.5MB) e o limite de 1MB do Server
// Action — é assim que PDF/PPT grandes passam a funcionar.
//
// Gate: só admin/gestor consegue token (senão qualquer um pediria upload).
// A allowlist de content-type + o teto de tamanho são ENFORÇADOS aqui no
// onBeforeGenerateToken (server-side) — o cliente não escolhe.

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Auth obrigatória ANTES de emitir o token. requireUser lança
        // UNAUTHORIZED sem sessão; requireRole lança FORBIDDEN sem papel.
        const user = await requireUser();
        requireRole(user, ['admin', 'gestor']);
        return {
          allowedContentTypes: [...MEDIA_ALLOWED_TYPES_LIST],
          maximumSizeInBytes: MEDIA_MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // O envio via Twilio é feito pelo cliente chamando sendMediaUrlReply
        // com a URL resultante — aqui só logamos (no-op funcional).
        console.log('[blob-upload] upload concluído', blob.url);
      },
    });
    return Response.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'UNAUTHORIZED' ? 401 : msg === 'FORBIDDEN' ? 401 : 400;
    return Response.json({ error: msg }, { status });
  }
}
