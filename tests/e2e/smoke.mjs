// End-to-end check in a real Chromium: pages render without errors, and inputs drive outputs.
// Usage: npm run build && npx vite preview --port 4173 &  node tests/e2e/smoke.mjs
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const exe = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-headless-shell-linux64/chrome-headless-shell'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.hero');

const pages = ['overview', 'builder', 'risk', 'var', 'stress', 'frontier', 'data', 'method'];
for (const p of pages) {
  await page.evaluate((h) => { location.hash = h; }, p);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `tests/e2e/out/${p}.png`, fullPage: true });
  const txt = await page.innerText('main');
  check(`page "${p}" renders`, txt.length > 200 && !/NaN|undefined|Infinity/.test(txt), /NaN|undefined|Infinity/.test(txt) ? '(contains NaN/undefined)' : '');
}

// --- Viva removed; old link falls back to the dashboard; group identity shown
check('no Viva in navigation', !(await page.locator('nav').innerText()).toLowerCase().includes('viva'));
await page.evaluate(() => { location.hash = 'viva'; });
await page.waitForTimeout(500);
check('#viva falls back to the dashboard', (await page.innerText('main')).length > 200 && (await page.locator('.hero').count()) === 1);
check('group identity in header', (await page.locator('header').innerText()).includes('Group 4'));

// --- reactivity: investment doubles rupee VaR on the dashboard
const rupeeOf = async (label) => {
  const t = await page.locator('.kpi', { hasText: label }).first().locator('.val').innerText();
  return Number(t.replace(/[^\d]/g, ''));
};
await page.evaluate(() => { location.hash = 'overview'; });
await page.waitForTimeout(500);
const v1 = await rupeeOf('1-day VaR');
await page.evaluate(() => { location.hash = 'builder'; });
await page.waitForTimeout(300);
const inv = page.getByLabel('Portfolio A investment in rupees');
await inv.fill('3000000');
await page.evaluate(() => { location.hash = 'overview'; });
await page.waitForTimeout(900);
const v2 = await rupeeOf('1-day VaR');
check('doubling investment doubles ₹ VaR on dashboard', Math.abs(v2 / v1 - 2) < 0.01, `(${v1} → ${v2})`);

// --- weights not summing to 100% blocks results with an explicit message
await page.evaluate(() => { location.hash = 'builder'; });
await page.waitForTimeout(300);
await page.getByLabel('SUZLON weight percent').fill('25');
await page.waitForTimeout(600);
const banner = await page.locator('.banner.err').first().innerText();
check('invalid weights show an explicit error', /sum to/.test(banner), `"${banner.slice(0, 80)}"`);
await page.getByRole('button', { name: 'Normalise to 100%' }).first().click();
await page.waitForTimeout(600);
check('normalise clears the error', (await page.locator('.banner.err').count()) === 0);

// --- changing a weight changes volatility on dashboard
await page.evaluate(() => { location.hash = 'overview'; });
await page.waitForTimeout(700);
const vol1 = await page.locator('.kpi', { hasText: 'Annual volatility' }).first().locator('.val').innerText();
await page.evaluate(() => { location.hash = 'builder'; });
await page.getByLabel('SUZLON weight percent').fill('40');
await page.getByRole('button', { name: 'Normalise to 100%' }).first().click();
await page.evaluate(() => { location.hash = 'overview'; });
await page.waitForTimeout(900);
const vol2 = await page.locator('.kpi', { hasText: 'Annual volatility' }).first().locator('.val').innerText();
check('changing a weight changes portfolio volatility', vol1 !== vol2, `(${vol1} → ${vol2})`);

// --- confidence level slider changes VaR
await page.evaluate(() => { location.hash = 'var'; });
await page.waitForTimeout(700);
const before = await page.locator('.kpi', { hasText: 'VaR' }).first().locator('.val').innerText();
await page.getByLabel('Confidence level', { exact: true }).fill('99');
await page.waitForTimeout(900);
const after = await page.locator('.kpi', { hasText: 'VaR' }).first().locator('.val').innerText();
check('confidence change updates VaR', before !== after, `(${before} → ${after})`);

// --- frontier target
await page.evaluate(() => { location.hash = 'frontier'; });
await page.waitForTimeout(900);
await page.getByLabel('Target annual return percent').isDisabled().then((d) => check('target field is disabled while "auto" is on', d));
await page.getByText("Use portfolio's own return").click();
await page.getByLabel('Target annual return percent').fill('900');
await page.waitForTimeout(900);
check('infeasible target is reported, not altered', (await page.locator('main').innerText()).includes('Infeasible'));

// --- scenario bar: confidence, method, unit, risk-free all reach the outputs
await page.evaluate(() => { location.hash = 'overview'; });
await page.waitForTimeout(600);
const kv = async () => page.locator('.kpi', { hasText: '1-day ES' }).first().locator('.val').innerText();
await page.getByLabel('VaR confidence level').selectOption('0.95');
await page.waitForTimeout(700);
const k0 = await kv();
await page.getByLabel('VaR confidence level').selectOption('0.99');
await page.waitForTimeout(700);
const k1 = await kv();
check('scenario bar confidence 95→99 changes ES', k0 !== k1, `(${k0} → ${k1})`);
await page.getByLabel('VaR method').selectOption('parametric');
await page.waitForTimeout(700);
const k2 = await kv();
check('scenario bar method change updates ES', k1 !== k2, `(${k1} → ${k2})`);
await page.getByRole('button', { name: '%', exact: true }).click();
await page.waitForTimeout(500);
check('₹/% toggle switches the display', (await kv()).includes('%'));
await page.getByRole('button', { name: '₹', exact: true }).click();
await page.getByLabel('VaR method').selectOption('historical');
await page.getByLabel('VaR confidence level').selectOption('0.95');

// --- allocation test: weight limit makes the target impossible, reported per period
await page.evaluate(() => { location.hash = 'frontier'; });
await page.waitForTimeout(700);
await page.getByLabel('Maximum weight percent').fill('5');
await page.waitForTimeout(900);
check('impossible weight limit reported as infeasible', (await page.locator('main').innerText()).includes('cannot sum to 100%'));
await page.getByLabel('Maximum weight percent').fill('100');

// --- reset
await page.getByRole('button', { name: /Open analysis settings/ }).click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Reset to project defaults' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Close settings' }).click();
await page.evaluate(() => { location.hash = 'builder'; });
await page.waitForTimeout(500);
const invAfter = await page.getByLabel('Portfolio A investment in rupees').inputValue();
check('reset restores ₹15,00,000', Number(invAfter) === 1500000, `(${invAfter})`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
