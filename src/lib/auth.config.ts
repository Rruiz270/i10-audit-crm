import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Auth config **edge-safe** — sem imports de DB, bcrypt, ou qualquer Node-only.
 *
 * O Next 16 `proxy.ts` roda em Edge runtime por padrão. Se `proxy` importar
 * `auth.ts` inteira, o bundler puxa bcryptjs/drizzle/pg pro Edge e o build quebra
 * com "Failed to collect page data".
 *
 * Pattern oficial NextAuth v5:
 *   - `auth.config.ts` (este arquivo) — só config leve + providers sem authorize
 *   - `auth.ts` — config completa com DrizzleAdapter + Credentials (Node runtime)
 *   - `proxy.ts` importa daqui, não do auth.ts
 *
 * Os callbacks pesados (jwt fetch no DB, signIn checks) vivem no `auth.ts`.
 * Aqui mantemos só o mínimo pra proxy decidir autorização.
 */
export default {
  providers: [
    // Google é leve (só URLs + escopos), pode ficar aqui.
    Google({
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar.events',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    // Credentials fica em auth.ts (precisa de bcrypt + DB no authorize).
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    // Callback mínimo pro middleware/proxy decidir "logado ou não".
    // A lógica rica de signIn (admin allowlist, approval_status) fica no auth.ts.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
