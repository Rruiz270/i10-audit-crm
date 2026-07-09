// ─── Catálogo de produtos i10 ────────────────────────────────────────────────
// Fonte de verdade do campo `products` em crm.opportunities. O popup de Ganho
// exige ao menos um; cada produto dispara seu pós-venda (FUNDEB mantém o
// handoff manual → fundeb.consultorias; os demais geram tarefa de kickoff).

export const PRODUCTS = [
  'Acelerador FUNDEB',
  'Ensino Integral',
  'Escola Online',
  'Município Bilíngue',
  'Radar Fiscal 360',
] as const;

export type Product = (typeof PRODUCTS)[number];

export const PRODUCT_POSVENDA: Record<Product, string> = {
  'Acelerador FUNDEB':
    'Handoff → consultoria FUNDEB (kickoff, duração, secretário) — use o botão de transferência no card.',
  'Ensino Integral': 'Checklist de implantação OSC + termo de colaboração (multiplicador 1,50x).',
  'Escola Online': 'Onboarding da plataforma + carga de turmas e docentes.',
  'Município Bilíngue': 'Cronograma plurianual: formação docente, material Alumni, tablets.',
  'Radar Fiscal 360': 'Provisionar acesso SaaS + convites aos usuários da prefeitura.',
};
