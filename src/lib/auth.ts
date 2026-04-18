import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';
import { users, accounts, sessions, verificationTokens } from './schema';

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
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
  ],
  session: { strategy: 'database' },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      const email = user.email.toLowerCase();
      // Allow existing users + admin allowlist. New non-admin users need to
      // be invited by an admin (we'll build that flow later).
      if (adminEmails.includes(email)) return true;

      const existing = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email),
      });
      return !!existing?.isActive;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        (session.user as typeof session.user & { role?: string }).role =
          (user as typeof user & { role?: string }).role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
