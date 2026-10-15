/* ============================================================================
   ENTRADA — mouse, toque (gestos, D-pad), teclado e botões da interface.
   Recebe o canvas do jogo e liga os receptores uma única vez.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TIPOS_ANDAVEIS, chave } from './grade.js';
import { camera, destaque, canvas } from './cena.js';
import { estado } from './estado.js';
import { som } from './sessao.js';
import { avisar, atualizarBotaoSom } from './hud.js';
import { blocoSobOCursor, definirRota, pressionarDirecao, recusarClique, ocupado, viajandoDeElevador } from './movimento.js';
import { ajustarZoom, girar } from './controle-camera.js';
import { ligarBotoes, jogarDesafioDoDia } from './menus.js';
import { grade, carregarNivel, dicaGiro, avisarEventoTutorial, tilesRaycast, materializarNivel } from './fase.js';
import { NIVEIS } from './dados/niveis.js';
import { reiniciar, proximaFase } from './regras.js';
import { TOQUE } from './sessao.js';
import { classificarGesto, fatorDePinca, direcaoDoMundo, maisProximoDoToque } from './toque.js';

/** Gancho dos testes: o teste escolhe o bloco "sob o cursor". */
let ultimoTipoPonteiro = 'mouse';

export function iniciarEntradas() {
  if (TOQUE && document.body) document.body.classList.add('toque');

  /* ---- roda do mouse aproxima/afasta ---- */
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    ajustarZoom(ev.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });

  /* ---- clique: move o personagem ---- */
  canvas.addEventListener('click', ev => {
    if (ocupado()) return;
    if (performance.now() - fimDoGestoMs < 350) return;     // fim de arraste/pinça, não é toque
    if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
    const b = blocoNoToque(ev);
    if (!b || b === estado.blocoAtual) return;
    if (recusarClique(b)) return;

    if (CONFIG.permitirCliqueDistante) {
      let caminho = grade().rota(estado.blocoAtual, b);
      // não dá a pé? talvez só dê de elevador: manda para a célula de embarque
      if ((!caminho || !caminho.length) && !viajandoDeElevador()) {
        const embarque = celulaDeEmbarque(b);
        if (embarque) {
          avisar('🛗 Só dá de elevador — indo para a plataforma');
          caminho = grade().rota(estado.blocoAtual, embarque);
        }
      }
      if (!caminho || !caminho.length) {
        // a ponte até lá está fora do alinhamento: vai até a borda e cai se tentar atravessar
        const angulo = grade().anguloPonteBloqueante(estado.blocoAtual, b);
        if (angulo == null) { avisar('Não existe caminho até lá 🚫'); return; }
        avisar(`🔭 Ponte fora do alinhamento: ${dicaGiro(angulo)} ou cai no vão`, 3500);
        caminho = grade().rotaSobPontes(estado.blocoAtual, b);
      }
      avisarEventoTutorial('andou');
      definirRota(caminho);
    } else {
      if (!grade().podeMover(estado.blocoAtual, b)) { avisar('Clique em um bloco ao lado 👆'); return; }
      avisarEventoTutorial('andou');
      definirRota([b]);
    }
  });

  /* ---- mouse: destaca o bloco que pode receber o personagem ---- */
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;          // no toque, o destaque é o do toque (abaixo)
    const b = blocoSobOCursor(ev, canvas);
    if (b && grade().podeMover(estado.blocoAtual, b)) {
      destaque.visible = true;
      destaque.position.set(b.x, b.y, b.z);
      canvas.style.cursor = 'pointer';
    } else {
      destaque.visible = false;
      canvas.style.cursor = 'default';
    }
  });
  canvas.addEventListener('pointerleave', () => { destaque.visible = false; });

  /* ---- toque: arraste na horizontal gira 90°, pinça dá zoom, toque curto anda ---- */
  const ponteirosToque = new Map();          // pointerId -> { x, y }
  let gestoToque = null;                     // { x0, y0, t0, dedos, distIni, distAnt }
  let fimDoGestoMs = -Infinity;              // quando o último gesto terminou (-∞: nenhum ainda)

  canvas.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    ultimoTipoPonteiro = 'touch';
    ponteirosToque.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ponteirosToque.size === 1) {
      gestoToque = { x0: ev.clientX, y0: ev.clientY, t0: performance.now(), dedos: 1, distIni: 0, distAnt: 0 };
      const b = blocoNoToque(ev);            // destaque ao tocar (no celular não há hover)
      destaque.visible = !!(b && grade().podeMover(estado.blocoAtual, b));
      if (destaque.visible) destaque.position.set(b.x, b.y, b.z);
    } else if (ponteirosToque.size === 2) {
      const [a, c] = [...ponteirosToque.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      gestoToque = { ...gestoToque, dedos: 2, distIni: d, distAnt: d };
      destaque.visible = false;              // dois dedos: não é toque de andar
    }
  });

  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'touch' || !ponteirosToque.has(ev.pointerId)) return;
    ponteirosToque.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ponteirosToque.size === 2 && gestoToque) {
      const [a, c] = [...ponteirosToque.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      const f = fatorDePinca(gestoToque.distAnt, d);
      if (Math.abs(f - 1) >= 0.02) {
        ajustarZoom(f, true);
        gestoToque.distAnt = d;
      }
    }
  });

  const terminarToque = ev => {
    if (ev.pointerType !== 'touch' || !ponteirosToque.has(ev.pointerId)) return;
    const eramDois = ponteirosToque.size === 2;
    ponteirosToque.delete(ev.pointerId);
    destaque.visible = false;
    if (eramDois) fimDoGestoMs = performance.now();                 // pinça: não é clique
    if (!eramDois && gestoToque && gestoToque.dedos === 1 && ponteirosToque.size === 0) {
      const tipo = classificarGesto({
        dx: ev.clientX - gestoToque.x0, dy: ev.clientY - gestoToque.y0,
        ms: performance.now() - gestoToque.t0, dedos: 1
      });
      if (tipo === 'arraste-h') girar(ev.clientX > gestoToque.x0 ? 1 : -1);
      if (tipo !== 'toque') fimDoGestoMs = performance.now();       // arraste: não é clique
    }
    if (ponteirosToque.size === 0) gestoToque = null;
  };
  canvas.addEventListener('pointerup', terminarToque);
  canvas.addEventListener('pointercancel', terminarToque);

  /** Bloco sob o toque. No celular, se o raio não acerta nenhum bloco, usa o mais
      próximo na tela (blocos pequenos ou afastados). */
  function blocoNoToque(ev) {
    const b = blocoSobOCursor(ev, canvas);
    if (b || ultimoTipoPonteiro !== 'touch') return b;
    const r = canvas.getBoundingClientRect();
    const candidatos = [];
    const v = camera.position.clone();
    for (const m of tilesRaycast()) {
      if (!m.userData.bloco) continue;
      v.copy(m.position).project(camera);
      candidatos.push({
        sx: (v.x + 1) / 2 * r.width + r.left,
        sy: (1 - v.y) / 2 * r.height + r.top,
        bloco: m.userData.bloco
      });
    }
    return maisProximoDoToque(candidatos, ev.clientX, ev.clientY);
  }

  /** Célula de embarque (vizinho do elevador alcançável a pé). */
  function celulaDeEmbarque(destino) {
    const atual = estado.blocoAtual;
    for (const e of grade().lista) {
      if (!e.elev) continue;
      const ladoLa = { x: e.elev.para.x, y: e.elev.para.y, z: e.elev.para.z };
      if (!alcancaAPe(ladoLa, destino)) continue;
      if (alcancaAPe(ladoLa, atual)) continue;
      const celula = grade().vizinhos(e).find(v => alcancaAPe(atual, v));
      if (celula) return celula;
    }
    return null;
  }

  function alcancaAPe(de, celula) {
    const alvo = celula.x + '|' + celula.y + '|' + celula.z;
    const visitados = new Set([de.x + '|' + de.y + '|' + de.z]);
    const fila = [de];
    while (fila.length) {
      const atual = fila.shift();
      if (atual.x + '|' + atual.y + '|' + atual.z === alvo) return true;
      for (const v of grade().vizinhos(atual)) {
        const k = v.x + '|' + v.y + '|' + v.z;
        if (visitidos.has(k)) continue;
        visitidos.add(k);
        fila.push(v);
      }
    }
    return false;
  }

  /* ---- teclado: WASD/setas movem, Q/E giram a tela ---- */
  const TECLAS = {
    arrowup: [0, 1], w: [0, 1],
    arrowdown: [0, -1], s: [0, -1],
    arrowleft: [-1, 0], a: [-1, 0],
    arrowright: [1, 0], d: [1, 0],
    q: 'girar-esq', e: 'girar-dir'          // giram o cenário em 90°
  };

  window.addEventListener('keydown', ev => {
    som.desbloquear();                        // o áudio começa na primeira tecla
    const tecla = TECLAS[ev.key.toLowerCase()];

    // Q / E: giro da tela (funciona até com a fase concluída)
    if (tecla === 'girar-esq' || tecla === 'girar-dir') {
      ev.preventDefault();
      girar(tecla === 'girar-esq' ? -1 : 1);
      avisarEventoTutorial('girou');
      return;
    }

    if (estado.concluido) return;
    if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
    const dir = tecla;
    if (!dir) return;
    ev.preventDefault();
    pressionarDirecao(dir);
  });

  // Enter / Espaço avançam de fase na tela de conclusão
  window.addEventListener('keydown', ev => {
    if (!estado.concluido) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); proximaFase(); }
  });

  // o áudio do navegador só começa depois de um toque (ou tecla) do jogador
  window.addEventListener('pointerdown', () => som.desbloquear());

  /* ---- botões da interface ---- */
  document.getElementById('btn-girar-esq')?.addEventListener('click', () => { girar(-1); avisarEventoTutorial('girou'); });
  document.getElementById('btn-girar-dir')?.addEventListener('click', () => { girar(1); avisarEventoTutorial('girou'); });

  const DPAD = { 'btn-dpad-cima': [0, 1], 'btn-dpad-baixo': [0, -1], 'btn-dpad-esq': [-1, 0], 'btn-dpad-dir': [1, 0] };
  for (const [id, dir] of Object.entries(DPAD)) {
    document.getElementById(id)?.addEventListener('click', () => pressionarDirecao(dir));
  }

  document.getElementById('btn-zoom-menos')?.addEventListener('click', () => ajustarZoom(1 / 1.2));
  document.getElementById('btn-zoom-mais')?.addEventListener('click', () => ajustarZoom(1.2));

  // navegação livre entre fases (botões ◀ ▶ do HUD)
  const faseAlvo = () => (estado.diario ? progressoIndice().maiorConcluida() + 1 : indiceNivel());
  const mostrarFase = () => avisar(`Fase ${faseAlvo() + 1}`);

  document.getElementById('btn-fase-anterior')?.addEventListener('click', () => {
    // ◀ na Fase 1 volta para a última fase manual
    const alvo = faseAlvo();
    carregarNivel(alvo === 0 ? NIVEIS.length - 1 : alvo - 1);
    mostrarFase();
  });
  document.getElementById('btn-fase-proxima')?.addEventListener('click', () => {
    carregarNivel(faseAlvo() + 1);
    mostrarFase();
  });

  // som: liga/desliga (salvo no navegador)
  document.getElementById('btn-som')?.addEventListener('click', () => {
    som.alternarMudo();
    som.desbloquear();
    atualizarBotaoSom(som.mudo);
  });

  // recomeçar / avançar (HUD e tela de conclusão)
  document.getElementById('btn-reiniciar-hud')?.addEventListener('click', reiniciar);
  document.getElementById('btn-reiniciar')?.addEventListener('click', reiniciar);
  document.getElementById('btn-proxima')?.addEventListener('click', proximaFase);

  // menu, loja, conquistas, diário e tutorial (ligados nos próprios módulos)
  ligarBotoes();
}

/** Índice da fase em jogo (para os botões ◀ ▶). No desafio do dia volta às
    fases a partir da primeira fase ainda não concluída. */
function indiceAtual() {
  return progressoIndice().maiorConcluida() + 1;
}

import { indiceNivel } from './fase.js';
import { progresso as progressoIndice } from './sessao.js';
