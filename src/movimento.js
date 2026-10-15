/* ============================================================================
   MOVIMENTO — passos na grade, rota do clique, pulo, espera de ponte, elevador
   e queda no vão. As regras puras de caminhada ficam em grade.js.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { chave, elevadorParado, quadranteAlvo, alvoDoPulo } from './grade.js';
import { moverBloco } from './elevadores.js';
import { direcaoDoMundo } from './toque.js';
import { camera } from './cena.js';
import { estado } from './estado.js';
import { som } from './sessao.js';
import { avisar } from './hud.js';
import { tween } from './tweens.js';
import { grade, tilesRaycast, carregarPorDados, carregarNivel, dicaGiro, contarMoeda, avisarEventoTutorial } from './fase.js';
import { coletarMoeda } from './regras.js';
import { personagem, posicaoNoBloco, girarPersonagemPara } from './personagem.js';
import { ultimaTentativa } from './sessao.js';

/* ---- raycast: bloco sob o cursor/toque ---- */
const ray = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();

/** Devolve o BLOCO que está sob o cursor (testando a face de cima dos tiles). */
export function blocoSobOCursor(ev, canvas) {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  if (!r || !r.width) return null;
  ponteiro.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ponteiro.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ponteiro, camera);
  const acertos = ray.intersectObjects(tilesRaycast, false); // false = ignora filhos (moedas)
  if (!acertos.length) return null;
  // prioriza a FACE SUPERIOR do bloco (como manda o design do jogo);
  // as malhas não são rotacionadas, então a normal local vale como mundial
  const superior = acertos.find(a => a.face && a.face.normal.y > 0.5);
  return (superior || acertos[0]).object.userData.bloco;
}

/* ============================================================================
   ROTA DO CLIQUE
   ============================================================================ */
/** Define uma sequência de blocos a percorrer. */
export function definirRota(rota) {
  if (estado.caindo) return;
  estado.aguardandoPonte = null;
  estado.fila = rota || [];
  if (!estado.passo) proximoPasso();
  return estado.fila.length;
}

/** Existe caminho A PÉ (sem elevador) de um bloco até uma célula? */
function alcancaAPe(de, celula) {
  const alvo = chave(celula.x, celula.y, celula.z);
  const ant = new Set([chave(de.x, de.y, de.z)]);
  const fila = [de];
  while (fila.length) {
    const atual = fila.shift();
    if (chave(atual.x, atual.y, atual.z) === alvo) return true;
    for (const v of grade().vizinhos(atual)) {
      const k = chave(v.x, v.y, v.z);
      if (!ant.has(k)) { ant.add(k); fila.push(v); }
    }
  }
  return false;
}

/** Quando o destino só é alcançável de elevador, devolve a célula de embarque
    (um vizinho do elevador que dá para alcançar a pé). */
function celulaDeEmbarque(destino) {
  const atual = estado.blocoAtual;
  for (const e of grade().lista) {
    if (!e.elev) continue;
    const ladoLa = { x: e.elev.para.x, y: e.elev.para.y, z: e.elev.para.z };
    // o destino tem de ser alcançável a pé do "lado de lá"...
    if (!alcancaAPe(ladoLa, destino)) continue;
    // ...e nós temos de estar do "lado de cá"
    if (alcancaAPe(ladoLa, atual)) continue;
    const celula = grade().vizinhos(e).find(v => alcancaAPe(atual, v));
    if (celula) return celula;
  }
  return null;
}

/** Próximo passo da fila. Placa de ponte fora do alinhamento: espera ou cai. */
function proximoPasso() {
  const destino = estado.fila.shift();
  if (!destino) return;
  if (destino.tipo === 'ponte' && !grade().ponteAtiva(destino.ponte)) {
    // a câmera está girando para o ângulo certo: espera o giro assentar, em vez de cair
    if (grade().quadrante === null && quadranteAlvo(estado.giroAlvo) === destino.ponte.angulo) {
      estado.aguardandoPonte = { destino, ponte: destino.ponte, t: 0 };
      return;
    }
    cairNoVao(destino.ponte);
    return;
  }
  const de = personagem.position.clone();
  estado.passo = { de, para: posicaoNoBloco(destino), bloco: destino, t: 0, pulo: false };
  girarPersonagemPara(destino.x - estado.blocoAtual.x, destino.z - estado.blocoAtual.z);
  estado.blocoAtual = destino;
}

/** Pulo com marcador: salta sobre o vão até o próximo bloco de pulo na direção.
    Sem bloco de pulo do outro lado, cai. Se há chão à frente, não é pulo. */
function pularSobre(ix, iz) {
  if (estado.passo || estado.caindo) return;
  const de = estado.blocoAtual;
  const destino = alvoDoPulo(grade(), de, ix, iz);
  if (!destino) { cairNoVao(); return; }
  estado.fila = [];
  estado.aguardandoPonte = null;
  som.tocar('pulo');
  avisarEventoTutorial('pulou');
  const origem = personagem.position.clone();
  estado.passo = { de: origem, para: posicaoNoBloco(destino), bloco: destino, t: 0, pulo: true };
  girarPersonagemPara(destino.x - de.x, destino.z - de.z);
  estado.blocoAtual = destino;
}

/** Uma seta anda um passo (uma placa inativa leva à espera ou à queda). */
export function andarUmPasso(ix, iz) {
  if (estado.caindo || estado.concluido || viajandoDeElevador()) return;
  const de = estado.blocoAtual;
  for (const dy of [0, 1, -1]) {
    const alvo = grade().obter(de.x + ix, de.y + dy, de.z + iz);
    if (alvo && alvo.tipo === 'ponte') { definirRota([alvo]); return; }
    if (grade().podeMover(de, alvo)) { definirRota([alvo]); return; }
  }
}

const PRAZO_SETA_MS = 400;
/** Setas: uma seta anda um passo. No bloco de pulo sem chão à frente, duas setas
    seguidas na mesma direção pulam até o próximo bloco de pulo. */
export function pressionarSeta(ix, iz) {
  const noMarcador = !estado.passo && estado.blocoAtual.tipo === 'pulo';
  const frente = noMarcador ? grade().obter(estado.blocoAtual.x + ix, estado.blocoAtual.y, estado.blocoAtual.z + iz) : null;
  const pend = estado.setaPulo;
  if (pend) {                                           // havia uma seta esperando
    clearTimeout(pend.timer);
    estado.setaPulo = null;
    if (noMarcador && pend.ix === ix && pend.iz === iz && performance.now() - pend.t < PRAZO_SETA_MS) {
      if (grade().andavel(frente)) andarUmPasso(ix, iz); else pularSobre(ix, iz);
      return;
    }
    andarUmPasso(pend.ix, pend.iz);
  }
  // no bloco de pulo, só espera a 2ª seta se não há chão à frente (senão é um passo comum)
  if (noMarcador && !grade().andavel(frente)) {
    const geracao = estado.geracao;
    const timer = setTimeout(() => {
      if (geracao !== estado.geracao) return;           // a fase mudou nesse meio-tempo
      estado.setaPulo = null;
      andarUmPasso(ix, iz);
    }, PRAZO_SETA_MS);
    estado.setaPulo = { t: performance.now(), timer, ix, iz };
    return;
  }
  andarUmPasso(ix, iz);
}

/** Seta da tela (D-pad ou teclado): as mesmas regras para os dois. */
export function pressionarDirecao(dir) {
  if (estado.concluido) return;
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
  const { ix, iz } = direcaoDoMundo(dir, estado.giroAtual);
  pressionarSeta(ix, iz);
}

/** O personagem está viajando de elevador? (usado para travar os controles) */
export function viajandoDeElevador() {
  const b = estado.blocoAtual;
  return !!b.elev && !elevadorParado(b);
}

/** O clique precisa ser ignorado? (fase concluída ou personagem caindo) */
export function ocupado() {
  return estado.caindo || estado.concluido;
}

/** Recomeça a tentativa atual: fase numerada recarrega; desafio do dia/teste do
    editor recarregam os dados guardados na sessão. */
export function recarregarAtual() {
  if (ultimaTentativa.indice < 0 && ultimaTentativa.dados) carregarPorDados(ultimaTentativa.dados);
  else carregarNivel(ultimaTentativa.indice);
}

/** Recusa um clique com o motivo certo (elevador, paredes, elevador travado...). */
export function recusarClique(b) {
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return true; }
  if (!b) return false;
  if (!TIPOS_ANDAVEIS.has(b.tipo) && b.tipo !== 'ponte') {
    avisar('Esse bloco não é caminhável 🚧');
    return true;
  }
  return false;
}

import { TIPOS_ANDAVEIS } from './grade.js';

/* ============================================================================
   QUEDA NO VÃO
   ============================================================================ */
/** Caiu no vão: o personagem some para baixo e a fase reinicia (as moedas da
    tentativa são descartadas). */
export function cairNoVao(ponte = null) {
  estado.caindo = true;
  estado.fila = [];
  estado.passo = null;
  estado.aguardandoPonte = null;
  estado.setaPulo = null;
  avisarEventoTutorial('caiu');
  const y0 = personagem.position.y;
  const geracao = estado.geracao;
  som.tocar('queda');
  avisar(ponte ? `💀 Caiu no vão! Para atravessar, ${dicaGiro(ponte.angulo)}` : '💀 Caiu no vão! A fase vai reiniciar…', 3500);
  tween(0.8, p => {
    if (geracao !== estado.geracao) return;
    personagem.position.y = y0 - p * p * 6;
    personagem.scale.setScalar(1 - p * 0.5);
  }, () => {
    if (geracao !== estado.geracao) return;
    recarregarAtual();
  });
}

/** Espera de ponte: retoma a travessia quando a ponte acende; cai se a câmera
    saiu do ângulo ou se o prazo acabou. */
const PRAZO_PONTE = 2;                                 // segundos
export function atualizarPontePendente(dt) {
  const p = estado.aguardandoPonte;
  if (!p) return;
  p.t += dt;
  if (grade().ponteAtiva(p.ponte)) {
    estado.aguardandoPonte = null;
    som.tocar('ponte');
    estado.fila.unshift(p.destino);
    proximoPasso();
  } else if (grade().quadrante !== null || quadranteAlvo(estado.giroAlvo) !== p.ponte.angulo || p.t >= PRAZO_PONTE) {
    estado.aguardandoPonte = null;
    cairNoVao(p.ponte);
  }
}

/* ============================================================================
   PASSOS ATUAIS (chamado a cada quadro pelo loop principal)
   ============================================================================ */
export function atualizarPasso(dt) {
  const p = estado.passo;
  if (!p) return;

  p.t += dt / CONFIG.duracaoPasso;
  if (p.t >= 1) {
    p.t = 1;
    estado.passo = null;
    personagem.position.copy(p.para);
    estado.passos++;                    // pontuação: cada passo (ou pulo) conta
    if (!p.pulo) som.tocar('passo');
    contarMoeda();
    avisarEventoTutorial('andou');
    aoEntrarNoBloco(p.bloco);
    if (!estado.concluido) proximoPasso();
  } else {
    const e = p.t < .5 ? 4 * p.t ** 3 : 1 - (-2 * p.t + 2) ** 3 / 2;  // easeInOutCubic
    personagem.position.lerpVectors(p.de, p.para, e);
    const altura = p.pulo ? CONFIG.alturaSalto : CONFIG.alturaPulo;
    personagem.position.y += Math.sin(Math.PI * p.t) * altura;  // pulinho (arco, no pulo)
  }
}

/** Chegou em um bloco: era moeda? então coleta. */
function aoEntrarNoBloco(b) {
  if (b.tipo === 'moeda') coletarMoeda(b);
}

/* ============================================================================
   ELEVADORES (atualização por quadro)
   ============================================================================ */
export function atualizarElevadores(dt) {
  for (const e of grade().lista) {
    if (!e.elev) continue;
    const ev = e.elev;
    const estavaParado = elevadorParado(e);

    // parado em uma das ponta: só espera o tempo de embarque
    if (ev.pausaAtual > 0) {
      ev.pausaAtual -= dt;
      if (!ev.avisouParada) {
        ev.avisouParada = true;
        if (estado.blocoAtual === e) avisar('🛗 Elevador chegou! Pode descer.');
      }
      continue;
    }

    // avança o trajeto (0 -> 1 -> 0, vaivém)
    ev.t += ev.dir * ev.velocidade * dt / ev.distancia;
    if (ev.t >= 1) { ev.t = 1; ev.dir = -1; ev.pausaAtual = ev.espera; ev.avisouParada = false; }
    else if (ev.t <= 0) { ev.t = 0; ev.dir = 1; ev.pausaAtual = ev.espera; ev.avisouParada = false; }

    const p = ev.inicio;
    moverBloco(grade(), e,
      p.x + (ev.para.x - p.x) * ev.t,
      p.y + (ev.para.y - p.y) * ev.t,
      p.z + (ev.para.z - p.z) * ev.t);

    // personagem em cima viaja junto e não pode andar enquanto isso
    if (estado.blocoAtual === e) {
      if (estavaParado) avisar('🛗 Elevador em movimento — espere…');
      estado.passo = null;
      estado.fila = [];
      personagem.position.copy(posicaoNoBloco(e));
    }
  }
}
