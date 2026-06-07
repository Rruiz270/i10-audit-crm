// Constantes de mídia do inbox WhatsApp — compartilhadas entre o Server Action
// de envio, a rota de token de upload client-direct e o composer.
// IMPORTANTE: NÃO pode morar num arquivo 'use server' (lá só funções async
// podem ser exportadas). Por isso vive aqui, num módulo neutro.

// Tipos de arquivo aceitos pelo WhatsApp (Twilio) p/ envio como mídia. Mantido
// alinhado com a allowlist do proxy de mídia e do <input accept> no composer.
export const MEDIA_ALLOWED_TYPES_LIST = [
  // imagens
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  // vídeo
  'video/mp4',
] as const;

export const MEDIA_ALLOWED_TYPES = new Set<string>(MEDIA_ALLOWED_TYPES_LIST);

// Teto de upload client-direct → Blob (browser → Vercel Blob, sem passar pela
// função serverless). 50MB cobre PDF/PPT grandes; o Twilio/WhatsApp ainda
// rejeita acima do próprio teto, mas o erro vem do provider (não do upload).
export const MEDIA_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
