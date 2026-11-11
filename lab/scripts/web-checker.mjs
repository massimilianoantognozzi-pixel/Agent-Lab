// Trusted checker: generated website code executes only in a disposable browser.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { startPublicServer } from './public-web-server.mjs';

if (process.env.AGENTLAB_CONTAINER_CHECKER !== '1') throw new Error('Website checks must run in the isolated checker container.');
const require = createRequire('/tool/package.json');
const { chromium } = require('playwright');
const inputFile = path.resolve(process.argv[2]);
if (inputFile !== '/job/input.json') throw new Error('Checker input outside control folder.');
const config = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const root = fs.realpathSync(config.publicRoot);
if (root !== '/workspace') throw new Error('Checker root outside execution copy.');
const asset = '/tool/axe.min.js';
const outputRoot = '/out';
if (createHash('sha256').update(fs.readFileSync(asset)).digest('hex') !== '20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878') throw new Error('Axe integrity mismatch.');
const result = { pass: false, errors: [], warnings: [], screenshots: [], checkedPages: [], sandbox: [] };
let server; let browser;
try {
  server = await startPublicServer(root, { axeFile: asset, spa: config.spa });
  fs.mkdirSync('/tmp/agentlab-home', { recursive: true });
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-setuid-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(server.url) ? route.continue() : (result.errors.push('Risorsa esterna bloccata: ' + route.request().url()), route.abort()));
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => result.errors.push('JavaScript: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push('Console: ' + message.text().slice(0, 500)); });
  page.on('response', response => { if (response.status() >= 400) result.errors.push(`Risorsa HTTP ${response.status()}: ${response.url()}`); });
  const htmlFiles = [];
  const walk = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Link in public output.');
    if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.html')) htmlFiles.push(path.relative(root, file).replaceAll('\\', '/'));
  } };
  walk(root);
  if (!htmlFiles.includes('index.html')) throw new Error('index.html non presente nell' + "'" + 'output pubblico.');
  if (htmlFiles.length > 30) throw new Error('Progetto oltre il perimetro di piccoli siti (30 pagine); pianificare i controlli.');
  for (const file of htmlFiles) {
    await page.goto(server.url + file, { waitUntil: 'networkidle', timeout: 20000 });
    const semantics = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, text: document.body.innerText, main: Boolean(document.querySelector('main')), viewport: Boolean(document.querySelector('meta[name="viewport"]')) }));
    if (!semantics.title.trim() || !semantics.lang || semantics.h1 !== 1 || !semantics.main || !semantics.viewport || semantics.text.length < 200 || /AGENTLAB_TODO|lorem ipsum/i.test(semantics.text)) result.errors.push(`${file}: struttura o contenuto incompleto (titolo, lingua, h1, main, viewport, testo).`);
    await page.addScriptTag({ url: server.url + '__agentlab_axe.js' });
    const accessibility = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    for (const violation of accessibility.violations) result.errors.push(`${file}: accessibilita ${violation.id} (${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(', ')}). ${violation.nodes.slice(0, 2).map(node => node.failureSummary ?? '').join('; ').slice(0, 1800)}`);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (overflow) result.errors.push(`${file}: overflow orizzontale a ${width}px.`);
      if (file === 'index.html') {
        const screenshot = path.join(outputRoot, `viewport-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }); result.screenshots.push(screenshot);
      }
    }
    const anchors = await page.locator('a[href^="#"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    for (const anchor of anchors) if (anchor === '#' || !await page.locator(`[id=${JSON.stringify(anchor.slice(1))}]`).count()) result.errors.push(`${file}: collegamento interno non funzionante ${anchor}.`);
    result.checkedPages.push(file);
  }
  await page.goto(server.url, { waitUntil: 'networkidle' });
  const baseFilters = Number(fs.readFileSync('/proc/self/status', 'utf8').match(/^Seccomp_filters:\s+(\d+)/m)?.[1]);
  for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      if (!fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('--type=renderer')) continue;
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const levels = status.match(/^NSpid:\s+(.+)/m)?.[1].trim().split(/\s+/).length ?? 0;
      const filters = Number(status.match(/^Seccomp_filters:\s+(\d+)/m)?.[1]);
      result.sandbox.push({ pid, pidNamespaceLevels: levels, seccompFilters: filters, baselineFilters: baseFilters });
    } catch (error) { result.warnings.push('Stato processo browser non leggibile: ' + pid); }
  }
  if (!result.sandbox.length || result.sandbox.some(state => state.pidNamespaceLevels < 2 || state.seccompFilters <= state.baselineFilters)) result.errors.push('Isolamento interno del browser non confermato.');
  for (const check of config.acceptance ?? []) {
    try {
      if (!['visible','text','fill','click','press','viewport'].includes(check.type)) throw new Error('tipo di prova non valido');
      if (check.type !== 'viewport' && typeof check.selector !== 'string') throw new Error('selettore richiesto');
      if (['text','fill','press'].includes(check.type) && typeof check.value !== 'string') throw new Error('valore della prova richiesto');
      if (check.type === 'visible' && !await page.locator(check.selector).isVisible()) throw new Error('elemento non visibile');
      if (check.type === 'text') { const actual = await page.locator(check.selector).innerText(); if (!actual.includes(check.value)) throw new Error(`atteso "${check.value}", trovato "${actual.slice(0,150)}"`); }
      if (check.type === 'fill') await page.locator(check.selector).fill(check.value);
      if (check.type === 'click') await page.locator(check.selector).click({ timeout: 5000 });
      if (check.type === 'press') await page.locator(check.selector).press(check.value);
      if (check.type === 'viewport') await page.setViewportSize({ width: check.width, height: 900 });
    } catch (error) { result.errors.push(`Accettazione ${check.type} ${check.selector ?? ''}: ${error.message.slice(0, 200)}`); }
  }
  result.errors = [...new Set(result.errors)]; result.pass = result.errors.length === 0;
} catch (error) { result.errors.push(error.message); }
finally {
  await browser?.close(); await server?.close();
  fs.writeFileSync(path.join(outputRoot, 'web-report.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ pass: result.pass, errors: result.errors.slice(0, 15), screenshots: result.screenshots }));
if (!result.pass) process.exitCode = 1;
