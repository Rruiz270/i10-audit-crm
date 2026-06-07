/**
 * UF → nome do estado (client-safe, sem server imports). Usado para gerar
 * tags de região automáticas (ex.: PB → "Paraíba FUNDEB").
 */

export const UF_TO_STATE: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

/** Tag de região no formato "<Estado> FUNDEB", ou null se UF desconhecida. */
export function regionTagForUf(uf: string | null | undefined): string | null {
  if (!uf) return null;
  const name = UF_TO_STATE[uf.trim().toUpperCase()];
  return name ? `${name} FUNDEB` : null;
}
