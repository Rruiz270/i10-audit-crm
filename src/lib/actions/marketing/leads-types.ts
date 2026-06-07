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
