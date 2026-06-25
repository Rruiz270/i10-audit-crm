// Tipos + constantes do Leads Hub. Separados de leads.ts porque aquele módulo é
// 'use server' (só pode exportar funções async — nem tipos nem consts).

export const PAGE_SIZE = 50;

export type LeadFilters = {
  q?: string;
  source?: string;
  uf?: string;
  role?: string;
  status?: string;
  audienceId?: number;
  page?: number;
};

export type LeadRow = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  municipio: string | null;
  uf: string | null;
  role: string | null;
  source: string | null;
  status: string;
  partido: string | null;
};

export type LeadsKpis = {
  total: number;
  withPhone: number;
  withEmail: number;
  recent: number;
  sources: number;
};

export type Facet = { value: string; count: number };

// Rótulos de "papel" do contato (quem é: prefeito pessoal, gabinete, sec. educação…).
// Compartilhado entre a página (server) e a tabela/modal (client).
export const ROLE_LABELS: Record<string, string> = {
  prefeito_pessoal: 'Prefeito (pessoal)',
  prefeitura: 'Gabinete',
  educacao: 'Sec. Educação',
  prefeito: 'Prefeito',
  secretario: 'Secretário',
  gabinete: 'Gabinete',
};
export function roleLabel(r: string | null): string {
  if (!r) return '—';
  return ROLE_LABELS[r] ?? r;
}

export const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  unsubscribed: 'bg-slate-100 text-slate-600',
  bounced: 'bg-rose-100 text-rose-700',
  complained: 'bg-amber-100 text-amber-800',
};

export type LeadsHubData = {
  kpis: LeadsKpis;
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    source: Facet[];
    uf: Facet[];
    role: Facet[];
    status: Facet[];
  };
  audiencesList: Array<{ id: number; name: string; contactCount: number }>;
};
