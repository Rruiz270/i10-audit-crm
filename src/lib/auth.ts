import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { users, accounts, sessions, verificationTokens } from './schema';

/**
 * NextAuth v5 config com DOIS providers:
 *   · Google OAuth — para quem já tem Workspace (fluxo original)
 *   · Credentials (email/senha) — para contas criadas via /signup ou /admin/team
 *
 * Estratégia de sessão: JWT (obrigatório quando o Credentials provider está em uso).
 * O Drizzle adapter ainda persiste `users`/`accounts`/`verification_tokens`.
 *
 * Regras de signIn (ambos providers):
 *   · usuário precisa existir em crm.users
 *   · `is_active = true`
 *   · `approval_status = 'approved'`
 * Caso contrário, o login é rejeitado.
 */

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

async function findActiveApprovedUserByEmail(email: string) {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!row) return null;
  if (!row.isActive) return { status: 'inactive' as const, user: row };
  if (row.approvalStatus !== 'approved') {
    return { status: row.approvalStatus as 'pending' | 'rejected', user: row };
  }
  return { status: 'ok' as const, user: row };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  providers: [
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
    Credentials({
      id: 'credentials',
      name: 'Email e senha',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const result = await findActiveApprovedUserByEmail(email);
        if (!result) return null;
        if (result.status !== 'ok') return null;
        const u = result.user;
        if (!u.passwordHash) return null; // usuário Google-only, não pode logar via credentials
        const valid = await bcrypt.compare(password, u.passwordHash);
        if (!valid) return null;
        return {
          id: u.id,
          email: u.email,
          name: u.displayName ?? u.name ?? null,
          image: u.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Credentials já validou em authorize() — aceita direto
      if (account?.provider === 'credentials') return true;

      if (!user?.email) return false;
      const email = user.email.toLowerCase();
      const result = await findActiveApprovedUserByEmail(email);
      // Admin allowlist via env continua criando contas novas como admin aprovados
      if (adminEmails.includes(email)) {
        if (!result) {
          // Deixa o DrizzleAdapter criar o user; signIn callback roda antes.
          // Depois do insert, o approvalStatus vai cair no default 'approved' e role permanecerá 'consultor'.
          // O segundo login promove pra admin no signIn callback abaixo através de UPDATE.
        }
        // Promove + aprova o admin allowlisted
        await db
          .update(users)
          .set({ role: 'admin', isActive: true, approvalStatus: 'approved' })
          .where(eq(users.email, email));
        return true;
      }
      if (!result) return false;
      if (result.status !== 'ok') return false;
      return true;
    },
    async jwt({ token, user, trigger }) {
      // No primeiro login ou sempre que Next chama com "update"
      if (user?.email) {
        const fresh = await db.query.users.findFirst({
          where: eq(users.email, user.email as string),
        });
        if (fresh) {
          token.id = fresh.id;
          token.role = fresh.role;
          token.isActive = !!fresh.isActive;
          token.approvalStatus = fresh.approvalStatus;
        }
      } else if (trigger === 'update' || !token.role) {
        // Refresh a cada request se token estiver desatualizado
        if (token.email) {
          const fresh = await db.query.users.findFirst({
            where: eq(users.email, token.email as string),
          });
          if (fresh) {
            token.id = fresh.id;
            token.role = fresh.role;
            token.isActive = !!fresh.isActive;
            token.approvalStatus = fresh.approvalStatus;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as typeof session.user & { id?: string }).id =
          (token.id as string) ?? token.sub;
        (session.user as typeof session.user & { role?: string }).role =
          (token.role as string) ?? 'consultor';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
