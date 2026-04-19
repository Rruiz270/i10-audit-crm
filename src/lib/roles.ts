/**
 * Helpers puros de role — client-safe (sem imports de server code).
 * Importante: NÃO importar nada de `./auth`, `./db`, `bcryptjs` aqui.
 * Client components que precisam decidir "mostrar link admin?" importam daqui.
 */

export const ADMIN_ROLES = ['admin', 'gestor'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdmin(role: string | null | undefined): boolean {
  return typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role);
}
