import { asc } from 'drizzle-orm';
import { db } from './db';
import { fundebMunicipalities } from './schema';

export async function allMunicipalities() {
  return db
    .select({ id: fundebMunicipalities.id, nome: fundebMunicipalities.nome, regiao: fundebMunicipalities.regiao })
    .from(fundebMunicipalities)
    .orderBy(asc(fundebMunicipalities.nome));
}
