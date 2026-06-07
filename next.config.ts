import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static envia um binário nativo; mantê-lo fora do bundle do servidor
  // garante que o binário seja resolvido a partir de node_modules em runtime
  // (Node/Fluid na Vercel) em vez de ser empacotado/quebrado pelo bundler.
  serverExternalPackages: ['ffmpeg-static'],
  // Upload de anexos (PDF/PPT/imagem) via Server Action: o padrão de 1MB
  // estourava com "unexpected response". 16MB = teto de mídia do WhatsApp.
  experimental: {
    serverActions: {
      bodySizeLimit: '16mb',
    },
  },
};

export default nextConfig;
