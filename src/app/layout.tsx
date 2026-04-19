import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';

// Inter = voz principal da marca i10 (pesos 400–800 usados na UI).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Source Serif 4 = serifa institucional (headlines, eyebrow em documentos).
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'i10 Audit CRM',
  description:
    'CRM do Instituto i10 — captação de parcerias com municípios e handoff para consultoria FUNDEB (BNCC-CAPTACAO).',
  manifest: '/manifest.webmanifest',
  applicationName: 'i10 Audit CRM',
  appleWebApp: {
    capable: true,
    title: 'i10 CRM',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/icon-192.svg', sizes: '192x192' }],
  },
};

export const viewport = {
  themeColor: '#0A2463',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
