import { auth } from './auth';

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new Error('UNAUTHORIZED');
  }
  const role =
    (session.user as typeof session.user & { role?: string }).role ?? 'consultor';
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    role,
  };
}

export async function getUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

export function requireRole(user: SessionUser, allowed: string[]) {
  if (!allowed.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
}

// Re-export dos helpers puros de role para compatibilidade com código que já importava daqui.
// Código novo (especialmente client components) deve importar direto de `@/lib/roles`.
export { ADMIN_ROLES, isAdmin } from './roles';
