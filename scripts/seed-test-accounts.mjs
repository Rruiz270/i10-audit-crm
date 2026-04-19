// Seed 3 contas de teste (admin / gestor / consultor) + 1 pending para exercitar
// o fluxo de aprovação. Re-rodar sobrescreve a senha mas preserva atividades.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const bcrypt = (await import('bcryptjs')).default;

const sql = neon(process.env.DATABASE_URL);

const ACCOUNTS = [
  {
    id: 'test-admin',
    email: 'admin@i10.crm',
    name: 'Admin Teste',
    role: 'admin',
    password: 'admin2026',
    approval_status: 'approved',
  },
  {
    id: 'test-gestor',
    email: 'gestor@i10.crm',
    name: 'Gestor Teste',
    role: 'gestor',
    password: 'gestor2026',
    approval_status: 'approved',
  },
  {
    id: 'test-consultor',
    email: 'consultor@i10.crm',
    name: 'Consultor Teste',
    role: 'consultor',
    password: 'consultor2026',
    approval_status: 'approved',
  },
  {
    id: 'test-pending',
    email: 'pendente@i10.crm',
    name: 'Consultor Pendente',
    role: 'consultor',
    password: 'pendente2026',
    approval_status: 'pending',
  },
];

console.log('Criando 3 contas de teste + 1 pending:\n');

for (const a of ACCOUNTS) {
  const hash = await bcrypt.hash(a.password, 10);
  const existing = await sql`SELECT id FROM crm.users WHERE email = ${a.email}`;
  if (existing.length > 0) {
    await sql`UPDATE crm.users
      SET name = ${a.name}, role = ${a.role}, is_active = true,
          approval_status = ${a.approval_status}, password_hash = ${hash}
      WHERE email = ${a.email}`;
    console.log(`  ↻ ${a.role.padEnd(10)} ${a.email.padEnd(30)} (atualizado)`);
  } else {
    await sql`INSERT INTO crm.users
      (id, email, name, role, is_active, approval_status, password_hash)
      VALUES (${a.id}, ${a.email}, ${a.name}, ${a.role}, true, ${a.approval_status}, ${hash})`;
    console.log(`  + ${a.role.padEnd(10)} ${a.email.padEnd(30)} (criado)`);
  }
}

console.log('\n─────────────────────────────────────────────');
console.log('Contas prontas para testar login/logout:\n');
for (const a of ACCOUNTS) {
  const status = a.approval_status === 'pending' ? ' ⏳ PENDING' : '';
  console.log(`  ${a.role.padEnd(10)} ${a.email.padEnd(24)}  senha: ${a.password}${status}`);
}
console.log('\nFluxo de teste sugerido:');
console.log('  1. http://localhost:3000/login → login com admin@i10.crm / admin2026');
console.log('     (verifica que o sidebar mostra a seção "Administração")');
console.log('  2. Logout (/api/auth/signout), login com consultor@i10.crm / consultor2026');
console.log('     (verifica que admin links NÃO aparecem)');
console.log('  3. Logout, login com gestor@i10.crm / gestor2026');
console.log('     (admin links aparecem — mesmo nível do admin)');
console.log('  4. Logout, tentar login com pendente@i10.crm → deve falhar com erro');
console.log('  5. Como admin, vá em /admin/team e aprove o pendente');
console.log('  6. Logout, login pendente@i10.crm agora funciona');
console.log('\nOu teste o /signup:');
console.log('  7. /signup → crie novo@i10.crm, senha qualquer');
console.log('  8. Como admin, aprove em /admin/team');
