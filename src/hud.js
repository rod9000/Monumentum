/* ============================================================================
   INTERFACE (HUD) — textos, avisos, popup de moeda e tela de conclusão.
   Só escreve no DOM; as regras do jogo ficam no main.js.
   ============================================================================ */
import * as THREE from 'three';
import { camera } from './cena.js';
import { ehDispositivoDeToque } from './toque.js';

const TOQUE = ehDispositivoDeToque();
let temporizadorAviso = null;

/** Aviso flutuante (some sozinho). No toque ele fica mais tempo na tela. */
export function avisar(texto, ms = TOQUE ? 2500 : 1700) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visivel'), ms);
}

/** Nome da fase com o número e a faixa de dificuldade: "O Salão  ·  2/∞  ·  médio". */
export function atualizarTextoFase(nome, indice, faixa = null) {
  const dificuldade = faixa ? `  ·  ${faixa}` : '';
  const numero = indice >= 0 ? `  ·  ${indice + 1}/∞` : '';   // desafio do dia não tem número
  document.getElementById('nome-fase').textContent = `${nome}${numero}${dificuldade}`;
}

/** Contadores do topo: moedas desta fase, saldo (só sobe quando a fase é concluída) e passos. */
export function atualizarContadores({ coletadas, total, passos, par, saldo }) {
  document.getElementById('contador-moedas').textContent = `🪙 ${coletadas}/${total}`;
  document.getElementById('total-moedas').textContent = `Saldo 🪙 ${saldo}`;
  document.getElementById('passos').textContent = par === null || par === undefined
    ? `👣 ${passos}`
    : `👣 ${passos} · meta ${par}`;
}

/** Popup "+1" que sobe da moeda coletada (posição do mundo -> tela). */
export function popupMoeda(bloco) {
  const mundo = new THREE.Vector3(bloco.x, bloco.y + 1.1, bloco.z).project(camera);
  const x = (mundo.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-mundo.y * 0.5 + 0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'popup-moeda';
  el.textContent = '+1';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/** Tela de conclusão: título, texto, estatísticas e o botão principal. */
export function mostrarConclusao({ titulo, texto, estatisticas, proximo, total }) {
  document.getElementById('titulo-conclusao').textContent = titulo;
  document.getElementById('texto-conclusao').textContent = texto;
  document.getElementById('estatisticas').textContent = estatisticas;
  document.getElementById('btn-proxima').textContent = proximo;
  document.getElementById('total-moedas').textContent = total;
  document.getElementById('tela-conclusao').classList.add('visivel');
}

export function esconderConclusao() {
  document.getElementById('tela-conclusao').classList.remove('visivel');
}

/** Ícone do botão de som: 🔊 com som, 🔇 mudo. */
export function atualizarBotaoSom(mudo) {
  const b = document.getElementById('btn-som');
  b.textContent = mudo ? '🔇' : '🔊';
  b.title = mudo ? 'Ligar o som' : 'Desligar o som';
  if (b.setAttribute) b.setAttribute('aria-pressed', mudo ? 'false' : 'true');
}
