/* Testes de ponta a ponta no navegador: o jogo gerado (diorama-puzzle.html) aberto
   direto do disco (file://), com toque no celular e mouse no desktop.
   Rode `npm run build` antes (o teste usa o HTML gerado). */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_JOGO = pathToFileURL(path.join(raiz, 'diorama-puzzle.html')).href + '?debug';

/** Abre o jogo e espera ele ficar pronto. Devolve a lista de erros e de requisições externas. */
async function abrir(page) {
  const erros = [];
  const externas = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/manifest|favicon/i.test(m.text())) erros.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url())) externas.push(r.url()); });
  await page.goto(URL_JOGO);
  await page.waitForFunction(() => window.__DIORAMA_PRONTO__ === true, null, { timeout: 20_000 });
  return { erros, externas };
}

const estadoJogo = page => page.evaluate(() => {
  const d = window.__DIORAMA_DEBUG__;
  return { x: d.estado.blocoAtual.x, y: d.estado.blocoAtual.y, z: d.estado.blocoAtual.z,
           passos: d.estado.passos, giroAlvo: d.estado.giroAlvo, zoom: d.CONFIG.zoom };
});

test('abre sem erros, sem internet e com o Three.js embutido', async ({ page }) => {
  const { erros, externas } = await abrir(page);
  await page.waitForTimeout(500);
  expect(erros, 'erros no console').toEqual([]);
  expect(externas, 'requisições para a internet').toEqual([]);
});

test('toque num bloco vizinho anda até ele', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'teste de toque (celular)');
  await abrir(page);
  const alvo = await page.evaluate(() => {
    const d = window.__DIORAMA_DEBUG__;
    const b = d.grade().vizinhos(d.estado.blocoAtual).find(v => v.tipo !== 'ponte');
    if (!b) return null;
    const p = d.projetar(b.x, b.y + 0.5, b.z);
    return { x: b.x, y: b.y, z: b.z, px: p.x, py: p.y };
  });
  test.skip(!alvo, 'a primeira fase não tem vizinho andável neste teste');
  await page.touchscreen.tap(alvo.px, alvo.py);
  await page.waitForFunction(({ x, y, z }) => {
    const b = window.__DIORAMA_DEBUG__.estado.blocoAtual;
    return b.x === x && b.y === y && b.z === z;
  }, alvo, { timeout: 5000 });
});

test('arraste horizontal gira a câmera 90°', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'gesto de toque (celular)');
  await abrir(page);
  const cdp = await page.context().newCDPSession(page);
  const g0 = (await estadoJogo(page)).giroAlvo;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 500, id: 1 }] });
  for (let x = 100; x <= 300; x += 40) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 500, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const g1 = (await estadoJogo(page)).giroAlvo;
  expect(Math.abs(g1 - g0 - Math.PI / 2)).toBeLessThan(1e-6);
});

test('pinça com dois dedos dá zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'gesto de pinça (celular)');
  await abrir(page);
  const cdp = await page.context().newCDPSession(page);
  const z0 = (await estadoJogo(page)).zoom;
  const cx = 195, cy = 400;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (let d = 40; d <= 120; d += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const z1 = (await estadoJogo(page)).zoom;
  expect(z1).toBeGreaterThan(z0);
});

test('D-pad na tela anda (mesma regra das setas)', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'D-pad aparece em dispositivos de toque');
  await abrir(page);
  await expect(page.locator('#dpad')).toBeVisible();
  let andou = false;
  for (const id of ['#btn-dpad-cima', '#btn-dpad-dir', '#btn-dpad-baixo', '#btn-dpad-esq']) {
    const antes = (await estadoJogo(page)).passos;
    await page.tap(id);
    await page.waitForTimeout(400);
    if ((await estadoJogo(page)).passos > antes) { andou = true; break; }
  }
  expect(andou, 'algum botão do D-pad deveria andar o personagem').toBe(true);
});

test('layout de celular: sem dica de teclado, zoom por pinça e D-pad visível', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'layout de celular');
  await abrir(page);
  const css = await page.evaluate(() => ({
    dica: getComputedStyle(document.getElementById('dica')).display,
    zoomMais: getComputedStyle(document.getElementById('btn-zoom-mais')).display,
    dpad: getComputedStyle(document.getElementById('dpad')).display
  }));
  expect(css.dica).toBe('none');
  expect(css.zoomMais).toBe('none');
  expect(css.dpad).toBe('grid');
});

test('botão de som liga e desliga o mudo e lembra a escolha', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-som');
  await expect(page.locator('#btn-som')).toHaveText('🔇');
  expect(await page.evaluate(() => localStorage.getItem('diorama-mudo'))).toBe('1');
  await page.click('#btn-som');
  await expect(page.locator('#btn-som')).toHaveText('🔊');
});

test('menu de fases abre, mostra as fases e escolhe uma', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-menu');
  await expect(page.locator('#menu-fases')).toBeVisible();
  const botoes = page.locator('#grade-fases button:not(.fase-desafio)');   // o 1º botão é o desafio do dia
  expect(await botoes.count()).toBeGreaterThanOrEqual(3);
  await botoes.first().click();
  await expect(page.locator('#menu-fases')).toBeHidden();
  expect(await page.evaluate(() => window.__DIORAMA_DEBUG__.indice())).toBe(0);
});

test('botões do HUD têm fundo escuro (contraste sobre o céu claro)', async ({ page }) => {
  await abrir(page);
  const fundo = await page.evaluate(() => getComputedStyle(document.getElementById('btn-menu')).backgroundColor);
  expect(fundo).toContain('11, 18, 32');
});
