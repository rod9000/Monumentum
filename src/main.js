/* ============================================================================
   DIORAMA PUZZLE — ponto de entrada: liga os módulos e roda o loop principal.
   ----------------------------------------------------------------------------
   Regras puras e telas ficam nos módulos:
     config ........ parâmetros (CONFIG)        estado ....... estado da partida
     cena .......... 3D: câmera, luzes          hud .......... textos e avisos
     fase .......... construção do nível        movimento .... passos, pulo, queda
     regras ........ conclusão e pontuação      entrada ...... mouse/toque/teclado
     menus ......... menu, loja, conquistas     diario ....... desafio do dia
     tutorial ...... passos guiados             conquistas ... regras dos selos
   Este arquivo só faz a ligação e o loop de animação.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NIVEIS } from './dados/niveis.js';
import { Grade, quadranteAssentado, TIPOS_ANDAVEIS, alcancaveis } from './grade.js';
import { clonarBloco, iniciarElevador } from './elevadores.js';
import { sortearMoedas } from './moedas.js';
import { canvas, renderer, cena, camera } from './cena.js';
import { estado } from './estado.js';
import { avisar, atualizarBotaoSom } from './hud.js';
import { som, progresso, TOQUE, informarIndice, ultimaTentativa } from './sessao.js';
import { grade, tilesRaycast, indiceNivel, carregarNivel, carregarPorDados, atualizarPontes, atualizarMoedas, definirPainelTutorial, avisarEventoTutorial } from './fase.js';
import { atualizarElevadores, atualizarPasso, atualizarPontePendente } from './movimento.js';
import { atualizarTweens } from './tweens.js';
import { aplicarSkin } from './personagem.js';
import { iniciarEntradas } from './entrada.js';
import { criarTutorial } from './tutorial.js';
import { CONQUISTAS } from './conquistas.js';
import { atualizarRotacaoPersonagem } from './personagem.js';

// símbolos que os testes leem pelo escopo do main (via teste/carregar-jogo.mjs)
export { grade, estado, CONFIG, NIVEIS, indiceNivel, carregarNivel, pressionarSeta, definirRota, personagemMain, camera, Grade, sortearMoedas, iniciarElevador, girar, canvas };

import { personagem as personagemMain } from './personagem.js';
import { pressionarSeta, definirRota } from './movimento.js';
import { girar } from './controle-camera.js';

let ultimo = performance.now();

/* ============================================================================
   TUTORIAL — painel do HUD ligado à máquina de passos (tutorial.js)
   ============================================================================ */
const tut = criarTutorial({
  elementos: typeof document !== 'undefined' ? {
    painel: document.getElementById('painel-tutorial'),
    texto: document.getElementById('texto-tutorial'),
    contador: document.getElementById('conta-tutorial')
  } : null,
  vistos: i => progresso.tutorialVisto(i),
  marcar: (i, n) => progresso.marcarTutorialVisto(i, n)
});

// fachada usada pelo jogo (fase.js chama avisarEventoTutorial)
const painelTutorial = {
  iniciar: i => tut.iniciar(i),
  cancelar: () => tut.cancelar(),
  rever: () => tut.rever(),
  evento: tipo => tut.evento(tipo),
  proximo: () => avancoManual()
};

/** Passo manual do painel: "Ver ▶" anda o tutorial à mão. */
function avancoManual() {
  tut.evento('andou');
  if (!tut.ativo) tut.cancelar();
}

if (typeof document !== 'undefined') {
  document.getElementById('btn-tutorial-pular')?.addEventListener('click', () => tut.cancelar());
  document.getElementById('btn-tutorial-proximo')?.addEventListener('click', () => painelTutorial.proximo());
}

/* ============================================================================
   CONQUISTAS — aviso quando uma é desbloqueada
   ============================================================================ */
const nomesConquistas = new Map(CONQUISTAS.map(c => [c.id, c]));
progresso.aoDesbloquearConquista(novas => {
  for (const id of novas) {
    const c = nomesConquistas.get(id);
    if (c) avisar(`🏆 Conquista: ${c.nome} — ${c.quanto}`, 3200);
  }
});

/* ============================================================================
   INÍCIO
   ============================================================================ */
aplicarSkin(progresso.skinAtual);
iniciarEntradas();
definirPainelTutorial(painelTutorial);

/** Começa uma fase: tried = dados soltos (diário/teste do editor) ou índice. */
function abrir(indice, dados = null) {
  informarIndice(indice, dados);
  if (dados) carregarPorDados(dados);
  else carregarNivel(indice);
}

// ?teste=1 abre a fase gravada em localStorage pelo editor de fases
const testeDoEditor = typeof location !== 'undefined' && location.search.includes('teste')
  ? faseDoEditor()
  : null;

if (testeDoEditor) {
  abrir(-1, testeDoEditor);
} else {
  abrir(Math.max(0, progresso.maiorConcluida() + 1));
}

/** Lê a fase de teste do editor (localStorage['diorama-editor-teste']). */
function faseDoEditor() {
  try {
    const bruto = localStorage.getItem('diorama-editor-teste');
    if (!bruto) return null;
    const d = JSON.parse(bruto);
    if (!d || !Array.isArray(d.blocos) || !d.blocos.some(b => b.tipo === 'spawn')) return null;
    return {
      nome: d.nome || 'Fase do editor',
      moedas: d.moedas ?? d.blocos.filter(b => b.tipo === 'moeda').length,
      distanciaMoedas: d.distanciaMoedas ?? 2,
      moedasFixas: true,
      distanciaEntreMoedas: 99,
      blocos: d.blocos,
      pontes: d.pontes || []
    };
  } catch { return null; }
}


/* ============================================================================
   LOOP PRINCIPAL
   ============================================================================ */
function animar(agora) {
  requestAnimationFrame(animar);
  const dt = Math.min((agora - ultimo) / 1000, 0.05);   // no máx. 50ms por quadro
  const tempo = agora / 1000;
  ultimo = agora;

  grade().quadrante = quadranteAssentado(estado.giroAtual, estado.giroAlvo);
  atualizarPontes();
  atualizarElevadores(dt);
  atualizarPasso(dt);
  atualizarPontePendente(dt);
  atualizarRotacaoPersonagem(dt);
  atualizarMoedas(dt, tempo);
  atualizarTweens(dt);

  renderer.render(cena, camera);
}

requestAnimationFrame(animar);
window.__DIORAMA_PRONTO__ = true;   // usada pelos testes de ponta a ponta

// ganchos para os testes de ponta a ponta (só com ?debug na URL)
if (typeof location !== 'undefined' && location.search.includes('debug')) {
  window.__DIORAMA_DEBUG__ = {
    estado, CONFIG, progresso, som,
    indice: () => indiceNivel,
    grade,
    /** posição do mundo -> pixel da tela (para os testes de toque) */
    projetar: (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
    }
  };
}
