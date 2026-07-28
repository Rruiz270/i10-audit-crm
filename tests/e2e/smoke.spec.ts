import { expect, test } from '@playwright/test';

// ─── Smoke tests: login → pipeline → oportunidade ──────────────────────────
// Os 2 primeiros testes não precisam de banco (middleware + render do login).
// O fluxo completo exige DATABASE_URL apontando pra um banco com as contas de
// teste seedadas (`npm run seed:test-accounts`) — senão é skip, não falha.

const TEST_EMAIL = process.env.E2E_LOGIN_EMAIL ?? 'admin@i10.crm';
const TEST_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? 'admin2026';
const hasDatabase = Boolean(process.env.DATABASE_URL);

test('rota protegida redireciona visitante deslogado para /login', async ({ page }) => {
  await page.goto('/pipeline');
  await expect(page).toHaveURL(/\/login/);
});

test('login renderiza formulário de credenciais e opção Google', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com email' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar com Google/ })).toBeVisible();
});

test('login com credenciais → pipeline → abrir oportunidade', async ({ page }) => {
  test.skip(!hasDatabase, 'requer DATABASE_URL com contas de teste seedadas');

  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Entrar com email' }).click();
  // Sucesso = sair de /login (falha de credencial volta pra /login?error=...)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

  await page.goto('/pipeline');
  await expect(page).toHaveURL(/\/pipeline/);

  const firstCard = page.locator('a[href^="/opportunities/"]').first();
  const hasCards = (await firstCard.count()) > 0;
  test.skip(!hasCards, 'pipeline sem oportunidades no banco de teste');

  await firstCard.click();
  await page.waitForURL(/\/opportunities\/[^/]+/);
  await expect(page.locator('h1').first()).toBeVisible();
});
