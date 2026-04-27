import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log('1. Goto BNCC /login');
const response = await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('   status:', response?.status());
console.log('   url after:', page.url());

await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/bncc-login.png', fullPage: true });
console.log('   screenshot: /tmp/bncc-login.png');

const inputCount = await page.locator('input').count();
console.log('   input count:', inputCount);

const inputs = await page.locator('input').all();
for (const input of inputs.slice(0, 8)) {
  const type = await input.getAttribute('type');
  const name = await input.getAttribute('name');
  const visible = await input.isVisible();
  console.log(`   - input type=${type} name=${name} visible=${visible}`);
}

const html = await page.content();
const has404 = html.includes('404') || html.includes('not found');
console.log('   has 404?', has404);

await browser.close();
