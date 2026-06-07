import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static envia um binário nativo; mantê-lo fora do bundle do servidor
  // garante que o binário seja resolvido a partir de node_modules em runtime
  // (Node/Fluid na Vercel) em vez de ser empacotado/quebrado pelo bundler.
  serverExternalPackages: ['ffmpeg-static'],
};

export default nextConfig;
