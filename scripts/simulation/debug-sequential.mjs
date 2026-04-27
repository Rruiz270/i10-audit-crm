import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log('1. Goto CRM /login');
await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
const crmEmail = page.locator('input[type="email"]').first();
await crmEmail.waitFor({ state: 'visible', timeout: 10000 });
console.log('   CRM email visible');
await crmEmail.fill('admin@i10.crm');
await page.locator('input[type="password"]').first().fill('admin2026');
await page.locator('input[type="password"]').first().press('Enter');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
console.log('   CRM logged in:', page.url());

console.log('2. Goto BNCC /login');
const t1 = Date.now();
await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('   goto took', Date.now() - t1, 'ms, url:', page.url());

await page.waitForTimeout(1000);
const bnccEmail = page.locator('input[type="email"]').first();
console.log('   email count:', await bnccEmail.count());

await bnccEmail.waitFor({ state: 'visible', timeout: 30000 });
console.log('   BNCC email visible');
await bnccEmail.fill('consultor@i10.crm');
await page.locator('input[type="password"]').first().fill('consultor2026');
await page.locator('input[type="password"]').first().press('Enter');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
console.log('   BNCC logged in:', page.url());

await browser.close();
console.log('OK');
