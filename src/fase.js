/* ============================================================================
   FASE — dados da fase e construção do cenário (diorama) da partida
   ----------------------------------------------------------------------------
   Estado da partida que vive aqui: índice da fase, grade do nível, grupo 3D do
   nível, malhas testadas no clique, moedas coletadas e total da fase. Só este
   arquivo altera essas variáveis; os outros importam (leitura) ou chamam funções.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NIVEIS } from './dados/niveis.js';
import { Grade, quadranteAlvo, giroNecessario, placasDaPonte } from './grade.js';
import { clonarBloco, iniciarElevador } from './elevadores.js';
import { sortearMoedas } from './moedas.js';
import { gerarFase } from './procedural.js';
import { cena, alvoCentro, enquadramento, luzSol, GEO_BLOCO, GEO_MOEDA, GEO_BORDAS, GEO_PLACA, GEO_MARCADOR, GEO_ANEL_MARCADOR, MATERIAL_BORDA, MATERIAL, materialMoedaBrilhante, atualizarEnquadramento } from './cena.js';
import { avisar, atualizarTextoFase, atualizarContadores } from './hud.js';
import { personagem, posicaoNoBloco, girarPersonagemPara } from './personagem.js';
import { progresso, informarIndice } from './sessao.js';
import { calcularPar, notaDeDificuldade, faixaDeDificuldade } from './par.js';
import { estado } from './estado.js';
import { tween, cancelarTweens } from './tweens.js';

export let indiceNivel = 0;
export let grade = null;            // Grade do nível atual
export let grupoNivel = null;       // grupo com todos os blocos do nível
export let tilesRaycast = [];       // malhas testadas no raycast (blocos + placas)
export let coletadas = 0;           // moedas coletadas nesta tentativa (só valem ao concluir)
export let totalMoedas = 0;         // total de moedas da fase

/** Data de hoje ('aaaa-mm-dd', fuso local) — usada pelo desafio do dia. */
export function dataAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Gancho de eventos para o tutorial ('andou', 'girou', 'pulou', ...). */
export function avisarEventoTutorial(tipo) {
  painelTutorial?.evento(tipo);
}

let timersMostrarDicas = [];        // dicas agendadas da fase atual
let parDaFase = null;               // { par, passosPorMoeda }: menor nº de passos até todas as moedas
const faixas = new Map();           // índice da fase -> 'fácil' | 'médio' | 'difícil'
const nomeCurtoCache = new Map();

// gancho do tutorial: preenchido pelo main.js (criarTutorial)
let painelTutorial = null;
export function definirPainelTutorial(painel) { painelTutorial = painel; }

/* ---- personagem (grupo) ---- */
// (a malha e a posição do personagem moram em personagem.js)


/* ============================================================================
   0) NOMES (manuais vs. procedurais)
   ============================================================================ */
/** Nome da fase: manuais vêm do array; procedurais têm nome próprio.
 *  Usa um cache para não gerar as procedurais de novo a cada clique no menu. */
export function nomeCurto(indice) {
  if (indice < NIVEIS.length) return NIVEIS[indice].nome;
  if (!nomeCurtoCache.has(indice)) nomeCurtoCache.set(indice, `Fase ${indice + 1}`);
  return nomeCurtoCache.get(indice);
}


/* ============================================================================
   1) DADOS E CONSTRUÇÃO DO NÍVEL
   Cada bloco é { x, y, z, tipo }: x leste (+), y altura (0 = chão), z sul (+).
   Tipos: 'chao', 'parede', 'moeda', 'spawn', 'elevador', 'pulo' e 'ponte'.
   ============================================================================ */

/** Devolve uma CÓPIA dos dados de uma fase. O jogo muta os blocos durante a
 *  partida (moedas coletadas, elevadores), então os dados de NIVEIS precisam
 *  continuar intactos entre uma partida e outra. */
export function materializarNivel(indice) {
  // fases manuais (NIVEIS) e, depois delas, fases procedurais infinitas
  const n = indice < NIVEIS.length ? NIVEIS[indice] : gerarFase(indice);
  return {
    nome: n.nome,
    moedas: n.moedas ?? 0,
    distanciaMoedas: n.distanciaMoedas ?? 3,
    distanciaEntreMoedas: n.distanciaEntreMoedas,
    moedasFixas: n.moedasFixas,
    seed: n.seed,
    pontes: n.pontes || [],
    blocos: (n.blocos || []).map(clonarBloco)
  };
}

/** Carrega a fase numerada `indice` (a partida anterior é descartada). */
export function carregarNivel(indice) {
  carregarFase(materializarNivel(indice), indice);
}

/** Carrega uma fase a partir dos dados — usado pelo desafio do dia e pelo
 *  teste de fase do editor (indice = -1). */
export function carregarPorDados(dados) {
  carregarFase(dados, -1);
}

function carregarFase(dados, indice) {
  indiceNivel = indice;
  informarIndice(indice, dados);
  estado.geracao++;                             // cancela esperas e quedas da fase anterior
  if (estado.setaPulo) clearTimeout(estado.setaPulo.timer);
  estado.setaPulo = null;
  estado.aguardandoPonte = null;
  estado.caindo = false;
  estado.diario = indice < 0;
  timersMostrarDicas.forEach(clearTimeout);
  timersMostrarDicas = [];

  // limpa o cenário do nível anterior
  if (grupoNivel) {
    cena.remove(grupoNivel);
    grupoNivel.traverse(o => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m && !m.userData.compartilhado) m.dispose(); });
      }
    });
  }

  grupoNivel = new THREE.Group();
  cena.add(grupoNivel);
  tilesRaycast = [];
  pontesVisuais = [];

  // ---- grade com os dados da fase (cópia: o jogo muta os blocos) ----
  grade = new Grade(dados.blocos.map(clonarBloco), dados.pontes);
  grade.pontesLivres = CONFIG.pontesSempreAtivas;
  for (const b of grade.lista) iniciarElevador(b);

  // ---- moedas: sorteio padronizado (ver sortearMoedas) ----
  sortearMoedas(dados, grade);
  parDaFase = calcularPar(grade);             // meta: o caminho mais curto até todas as moedas

  // ---- limites (centro e tamanho do diorama) ----
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of grade.lista) {
    min.x = Math.min(min.x, b.x); max.x = Math.max(max.x, b.x);
    min.y = Math.min(min.y, b.y); max.y = Math.max(max.y, b.y);
    min.z = Math.min(min.z, b.z); max.z = Math.max(max.z, b.z);
  }
  const tam = {
    x: (max.x - min.x + 1) + 0.8,   // + base (plinto)
    y: (max.y - min.y + 1) + 0.6,
    z: (max.z - min.z + 1) + 0.8
  };
  alvoCentro.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  // raio da esfera que envolve o diorama -> usado pra enquadrar a câmera
  enquadramento.raio = 0.5 * Math.sqrt(tam.x ** 2 + tam.y ** 2 + tam.z ** 2) + 0.3;

  // ---- sol posicionado em relação ao centro do nível ----
  // (a área da sombra cresce junto com o mapa, para não "cortar" sombras)
  luzSol.position.set(alvoCentro.x + 7, alvoCentro.y + 13, alvoCentro.z + 6);
  luzSol.target.position.copy(alvoCentro);
  const s = enquadramento.raio * 1.6;
  Object.assign(luzSol.shadow.camera, {
    left: -s, right: s, top: s, bottom: -s,
    near: 1, far: enquadramento.raio * 4 + 40
  });
  luzSol.shadow.camera.updateProjectionMatrix();

  // ---- base/plinto do diorama (a "maquete") ----
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(tam.x, 0.5, tam.z),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 1 })
  );
  base.position.set(alvoCentro.x, min.y - 0.75, alvoCentro.z);
  base.castShadow = true;
  base.receiveShadow = true;
  grupoNivel.add(base);
  if (CONFIG.mostrarBordas) {
    const bordaBase = new THREE.LineSegments(GEO_BORDAS, MATERIAL_BORDA);
    bordaBase.scale.set(tam.x, 0.5, tam.z);   // mesma geometria, escala do plinto
    base.add(bordaBase);
  }

  // ---- blocos ----
  // o spawn é resolvido ANTES do loop porque a animação de surgimento das
  // moedas usa a distância até ele
  const spawnLocal = grade.lista.find(b => b.tipo === 'spawn') || grade.lista[0];
  for (const b of grade.lista) {
    if (b.tipo === 'ponte') continue;       // placas: malha própria (criarPontes)
    const malha = new THREE.Mesh(GEO_BLOCO, MATERIAL[b.tipo] || MATERIAL.chao);
    malha.position.set(b.x, b.y, b.z);
    malha.castShadow = true;      // projeta sombra
    malha.receiveShadow = true;   // recebe sombra dos outros blocos
    malha.userData.bloco = b;     // <-- ligação malha <-> dado da fase
    b.malha = malha;
    grupoNivel.add(malha);
    tilesRaycast.push(malha);
    if (b.tipo === 'pulo') {                  // marcador de pulo: quadrado com círculo
      const quadrado = new THREE.Mesh(GEO_MARCADOR, MATERIAL_MARCADOR);
      quadrado.position.set(0, 0.52, 0);
      const anel = new THREE.Mesh(GEO_ANEL_MARCADOR, MATERIAL_ANEL_MARCADOR);
      anel.rotation.x = -Math.PI / 2;
      anel.position.set(0, 0.56, 0);
      malha.add(quadrado, anel);
    }

    // borda (contorno) do bloco — filha da malha, não entra no raycast
    if (CONFIG.mostrarBordas) {
      malha.add(new THREE.LineSegments(GEO_BORDAS, MATERIAL_BORDA));
    }

    // moeda flutuando sobre o bloco 'moeda'
    if (b.tipo === 'moeda') {
      const moeda = new THREE.Mesh(GEO_MOEDA, materialMoedaBrilhante());
      moeda.position.set(0, 0.78, 0);
      moeda.castShadow = true;
      moeda.scale.setScalar(0.001);         // começa invisível: vai "surgir"
      b.moeda = moeda;
      b.faseMoeda = Math.random() * Math.PI * 2;
      malha.add(moeda);           // filha do bloco (não entra no raycast)

      // animação de surgimento: pop com atraso conforme a distância do spawn
      const passos = Math.abs(b.x - spawnLocal.x) + Math.abs(b.y - spawnLocal.y) + Math.abs(b.z - spawnLocal.z);
      tween(0.42, p => {
        // 0 → 1,15 → 1 (estufa e volta)
        const escala = p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15;
        moeda.scale.setScalar(Math.max(0.001, escala));
      }, null, passos * 0.045, moeda);
    }
  }

  criarPontes(dados.pontes);

  // ---- dicas da fase (uma vez por carregamento; cancelam ao trocar de fase) ----
  const dicas = [];
  if (dados.pontes.length) dicas.push('🔭 Esta fase tem pontes: gire a câmera (Q/E) até as placas acenderem');
  if (dados.blocos.some(b => b.tipo === 'pulo')) dicas.push('🦘 Bloco de pulo: aperte a seta 2× na direção do outro bloco (o par volta)');
  dicas.forEach((texto, i) => timersMostrarDicas.push(setTimeout(() => avisar(texto, 4000), 300 + i * 4300)));

  // ---- personagem no spawn ----
  const spawn = spawnLocal;                 // já resolvido acima (usado pelas moedas)
  estado.blocoAtual = spawn;
  estado.passo = null;
  estado.fila = [];
  estado.concluido = false;
  estado.passos = 0;                        // nova tentativa: pontuação do zero
  estado.inicioMs = performance.now();
  personagem.position.copy(posicaoNoBloco(spawn));
  personagem.scale.setScalar(1);
  personagem.visible = true;
  girarPersonagemPara(0, 1);

  // ---- HUD ----
  CONFIG.zoom = 1;               // cada fase começa enquadrada por completo
  totalMoedas = grade.lista.filter(b => b.tipo === 'moeda').length;
  coletadas = 0;
  atualizarTextoFase(nomeCurto(indice), indice, faixaDaFase(indice));
  agendarFaixaAtual();
  atualizarMostrador();

  atualizarEnquadramento();

  if (painelTutorial) painelTutorial.cancelar();
}


/* ============================================================================
   2) PONTES DE CÂMERA (placas andáveis no vão, acesas quando ativa)
   ============================================================================ */
const COR_PONTE = new THREE.Color(0xe9d8b4);
let pontesVisuais = [];                            // { ponte, material } do nível atual
const MATERIAL_MARCADOR = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
const MATERIAL_ANEL_MARCADOR = new THREE.MeshBasicMaterial({ color: 0x1f2937 });

function criarPontes(pontes = []) {
  for (const p of pontes) {
    const material = new THREE.MeshStandardMaterial({ color: COR_PONTE.getHex(), roughness: .6, transparent: true, opacity: .25 });
    // uma placa por célula do vão: é a própria célula da grade (andável com a câmera alinhada)
    for (const c of placasDaPonte(p)) {
      const placa = new THREE.Mesh(GEO_PLACA, material);
      placa.position.set(c.x, c.y + 0.47, c.z);     // topo rente ao topo dos blocos
      const bloco = grade.obter(c.x, c.y, c.z);
      placa.userData.bloco = bloco;
      bloco.malha = placa;
      tilesRaycast.push(placa);
      grupoNivel.add(placa);
    }
    pontesVisuais.push({ ponte: p, material });
  }
}

export function atualizarPontes() {
  for (const { ponte, material } of pontesVisuais) {
    material.opacity = grade.ponteAtiva(ponte) ? 1 : 0.25;
  }
}

/** Texto de quantos giros e para que lado (Q/E) ativam a ponte de `angulo`. */
export function dicaGiro(angulo) {
  const g = giroNecessario(quadranteAlvo(estado.giroAlvo), angulo);
  if (!g.vezes) return 'a ponte já está alinhada';
  const tecla = g.lado === 'direita' ? 'DIREITA (E)' : 'ESQUERDA (Q)';
  return `gire ${g.vezes > 1 ? g.vezes + '× ' : ''}para a ${tecla}`;
}

export function iniciarPainelTutorial() {
  if (painelTutorial && indiceNivel >= 0) painelTutorial.iniciar(indiceNivel);
}


/* ============================================================================
   3) MOSTRADOR: moedas, passos e saldo
   ============================================================================ */
export function atualizarMostrador() {
  atualizarContadores({
    coletadas,
    total: totalMoedas,
    passos: estado.passos,
    par: parDaFase ? parDaFase.par : null,
    saldo: progresso.saldo
  });
}

/** Conta uma moeda coletada nesta tentativa (e atualiza o mostrador). */
export function contarMoeda() {
  coletadas++;
  atualizarMostrador();
}

/** Confirma as moedas da tentativa no progresso salvo (chamada ao concluir). */
export function moedasDaTentativa() {
  return coletadas;
}

/** Meta da fase atual (par) e o caminho mais curto até cada moeda. */
export function metaDaFase() {
  return parDaFase;
}


/* ============================================================================
   4) MOEDAS (giro e flutuação) — chamado a cada quadro pelo loop principal
   ============================================================================ */
export function atualizarMoedas(dt, tempo) {
  for (const b of grade.lista) {
    if (!b.moeda) continue;
    b.moeda.rotation.y += dt * 2.4;                                    // gira
    b.moeda.position.y = 0.78 + Math.sin(tempo * 2.2 + b.faseMoeda) * 0.05; // flutua
  }
}


/* ============================================================================
   5) DIFICULDADE DA FASE
   ----------------------------------------------------------------------------
   A nota (média do par sobre 30 sorteios) é calculada uma vez por fase, quando
   ela aparece, para não travar o carregamento.
   ============================================================================ */
export function faixaDaFase(indice) {
  return faixas.get(indice) ?? null;
}

/** Calcula a faixa de uma fase e guarda (no máximo uma vez por fase). */
export function calcularFaixa(indice) {
  if (!faixas.has(indice)) {
    const nota = notaDeDificuldade(materializarNivel(indice));
    faixas.set(indice, faixaDeDificuldade(nota.media));
  }
  return faixas.get(indice);
}

/** Faixa da fase atual, calculada logo depois que ela aparece. */
function agendarFaixaAtual() {
  const indice = indiceNivel;
  setTimeout(() => {
    if (indice !== indiceNivel) return;          // a fase mudou nesse meio-tempo
    atualizarTextoFase(nomeCurto(indice), indice, calcularFaixa(indice));
  }, 0);
}

/** Calcula, uma por vez, as faixas que a lista do menu ainda não tem. */
export function completarFaixasDoMenu(indices, atualizar) {
  const pendentes = indices.filter(i => !faixas.has(i));
  const proxima = () => {
    const i = pendentes.shift();
    if (i === undefined) return;
    atualizar(i, calcularFaixa(i));
    setTimeout(proxima, 0);
  };
  setTimeout(proxima, 0);
}
