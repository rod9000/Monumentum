/* ============================================================================
   DIORAMA PUZZLE — ponto de entrada (estilo Captain Toad)
   ----------------------------------------------------------------------------
   Índice:
     src/config.js ............... parâmetros gerais (CONFIG)
     src/dados/niveis.js ......... dados das 18 fases manuais (NIVEIS)
     src/procedural.js ........... fases infinitas depois das manuais
     src/grade.js ................ regras de caminhada na matriz 3D (Grade)
     src/elevadores.js ........... dados e movimentação de elevadores
     src/moedas.js ............... sorteio padronizado de moedas
     src/aleatorio.js ............ RNG determinístico (semente)
   Este arquivo (ainda) concentra: cena 3D, personagem, câmera, movimentação,
   interface (HUD) e o loop principal. O bundle é gerado por `npm run build`.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NIVEIS } from './dados/niveis.js';
import { Grade, chave, elevadorParado, TIPOS_ANDAVEIS, quadranteAssentado, quadranteAlvo, giroNecessario, placasDaPonte, alvoDoPulo } from './grade.js';
import { clonarBloco, iniciarElevador, moverBloco } from './elevadores.js';
import { sortearMoedas } from './moedas.js';
import { gerarFase } from './procedural.js';


/* ============================================================================
   DIORAMA PUZZLE — protótipo de puzzle 3D em grade (estilo Captain Toad)
   ----------------------------------------------------------------------------
   Índice:
     1) DADOS DAS FASES ............ onde criar a Fase 2, 3, 4...
     2) SISTEMA DE GRADE ........... regras de caminhada na matriz 3D
     3) CENA, CÂMERA E LUZES ....... visual de diorama (ortográfica + sombras)
     4) CONSTRUÇÃO DO NÍVEL ........ dados -> blocos 3D
     5) PERSONAGEM .................
     6) CONTROLE DE CÂMERA ......... giro de 90° com interpolação suave
     7) MOVIMENTAÇÃO ............... raycast + grade + animação
     8) INTERFACE (HUD) ............
     9) LOOP PRINCIPAL .............
   ============================================================================ */


/* ============================================================================
   1) DADOS DAS FASES
   ----------------------------------------------------------------------------
   Cada bloco é um objeto { x, y, z, tipo }:
      x -> leste (+) / oeste (-)
      y -> altura (0 = chão)
      z -> sul (+) / norte (-)
   Tipos disponíveis:
      'chao'   -> piso por onde o personagem anda
      'parede' -> bloqueio (não dá para subir)
      'moeda'  -> piso com moeda: coletada quando o personagem passa por cima
      'spawn'  -> onde o personagem começa (também é um piso)

   >>> PARA CRIAR A FASE 2: copie o objeto inteiro abaixo, mude o "nome" e
   >>> desenhe um novo array de blocos. Nenhuma outra parte do código precisa
   >>> ser alterada (a câmera se enquadra sozinha no tamanho do mapa).
   ============================================================================ */

let indiceNivel = 0;


function atualizarElevadores(dt) {
  for (const e of grade.lista) {
    if (!e.elev) continue;
    const ev = e.elev;
    const estavaParado = elevadorParado(e);

    // parado em uma das pontas: só espera o tempo de embarque
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
    moverBloco(grade, e,
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

/** O personagem está viajando de elevador? (usado para travar os controles) */
const viajandoDeElevador = () => {
  const b = estado.blocoAtual;
  return !!b.elev && !elevadorParado(b);
};





/* ============================================================================
   3) CENA, CÂMERA ORTOGRÁFICA E LUZES  (visual de diorama)
   ============================================================================ */
const canvas = document.getElementById('palco');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;                       // sombras ativadas
renderer.shadowMap.type = THREE.PCFSoftShadowMap;        // sombra suave

const cena = new THREE.Scene();
cena.background = new THREE.Color(0xbfe3f2);             // céu clarinho

/* ---- CÂMERA ISOMÉTRICA ----------------------------------------------------
   OrthographicCamera = sem perspectiva: todos os blocos têm o MESMO tamanho
   na tela, independentemente da distância (isometria perfeita).
   A câmera orbita o centro do nível a um raio fixo, com a elevação clássica
   de 35,26° (arctg(1/√2)) — o ângulo isométrico "verdadeiro".            */
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const ELEVACAO   = Math.atan(1 / Math.sqrt(2));   // ≈ 35,26°
const RAIO_ORBITA = 90;                          // distância fictícia da órbita

let alvoCentro = new THREE.Vector3();            // centro do diorama na tela
let raioNivel  = 5;                              // raio p/ enquadramento automático

/* ---- LUZES ---------------------------------------------------------------
   Ambiente: lá de cima e de baixo (aspecto cartoon, sem sombra dura).
   Direcional: o "sol", com Shadow Map.                                */
const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.55);

const luzSol = new THREE.DirectionalLight(0xfff3dd, 1.55);
luzSol.castShadow = true;
luzSol.shadow.mapSize.set(2048, 2048);
luzSol.shadow.bias = -0.0007;          // evita "shadow acne"
luzSol.shadow.normalBias = 0.02;

const luzPreenchimento = new THREE.DirectionalLight(0xcfe2ff, 0.35);
luzPreenchimento.position.set(-8, 5, -6);

cena.add(luzAmbiente, luzSol, luzSol.target, luzPreenchimento);


/* ---- MATERIAIS E GEOMETRIAS COMPARTILHADOS -------------------------------- */
const GEO_BLOCO = new THREE.BoxGeometry(1, 1, 1);
const GEO_MOEDA = new THREE.CylinderGeometry(0.30, 0.30, 0.07, 28);
GEO_MOEDA.rotateX(Math.PI / 2);        // moeda "em pé", girando no eixo Y

// BORDA de cada bloco: arestas do cubo (LineSegments é filho do tile, então
// não interfere no raycast, que não é recursivo)
const GEO_BORDAS = new THREE.EdgesGeometry(GEO_BLOCO);
const MATERIAL_BORDA = new THREE.LineBasicMaterial({
  color: 0x1c2b1c, transparent: true, opacity: .38
});
MATERIAL_BORDA.userData.compartilhado = true;

function padrao(corTopo, corLado, extra = {}) {
  const cima  = new THREE.MeshStandardMaterial({ color: corTopo, roughness: .9,  metalness: 0, ...extra });
  const lados = new THREE.MeshStandardMaterial({ color: corLado, roughness: .95, metalness: 0, ...extra });
  // Ordem das faces do BoxGeometry: +X, -X, +Y(topo), -Y, +Z, -Z
  return [lados, lados, cima, lados, lados, lados];
}

const MATERIAL = {
  chao:   padrao(0x8ed679, 0x6aa84f),
  parede: padrao(0xe8845f, 0xb8553a),
  moeda:  padrao(0xffd34d, 0xd9a020, { emissive: 0x7a5c00, emissiveIntensity: .5 }),
  spawn:  padrao(0x9fd9f2, 0x62a8cc),
  elevador: padrao(0xd7dee6, 0x7f8c9b, { emissive: 0x20303c, emissiveIntensity: .35 })
};
for (const k in MATERIAL) MATERIAL[k].forEach(m => (m.userData.compartilhado = true));

function materialMoedaBrilhante() {
  return new THREE.MeshStandardMaterial({
    color: 0xffd34d, emissive: 0xffc400, emissiveIntensity: .45,
    metalness: .6, roughness: .25, transparent: true
  });
}

/** Destaque do bloco sob o mouse. */
const destaque = new THREE.Mesh(
  new THREE.BoxGeometry(1.05, 1.05, 1.05),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25, depthWrite: false })
);
destaque.visible = false;
destaque.renderOrder = 2;
cena.add(destaque);


/* ============================================================================
   ESTADO GLOBAL
   ============================================================================ */

const RAIO_PERSONAGEM = 0.30;

let grade = null;            // Grade do nível atual
let grupoNivel = null;       // grupo com todos os blocos do nível
let tilesRaycast = [];       // malhas testadas no raycast
let spawn = null;

let totalMoedas = 0;
let coletadas = 0;

const estado = {
  giroAtual: 0,          // rotação atual da câmera (radianos)
  giroAlvo: 0,           // rotação desejada (sempre múltiplo de 90°)
  passo: null,           // passo em andamento { de, para, bloco, t }
  fila: [],              // próximos blocos do caminho
  blocoAtual: null,      // bloco onde o personagem está (ou está indo)
  concluido: false,
  caindo: false,         // caiu no vão: a fase está reiniciando
  aguardandoPonte: null, // { destino, ponte, t }: espera a câmera alinhar
  setaPulo: null         // seta no marcador esperando a 2ª { t, timer, ix, iz }
};

/* ---- personagem (grupo) ---- */
const personagem = new THREE.Group();
const corpo = new THREE.Mesh(
  new THREE.SphereGeometry(RAIO_PERSONAGEM, 28, 20),
  new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: .5, metalness: .05 })
);
corpo.castShadow = true;
personagem.add(corpo);

const materialOlho = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: .4 });
for (const lado of [-1, 1]) {
  const olho = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), materialOlho);
  olho.position.set(0.105 * lado, 0.09, 0.275);
  personagem.add(olho);
}
cena.add(personagem);

let rotacaoPersonagemAlvo = 0;


/* ============================================================================
   4) CONSTRUÇÃO DO NÍVEL (dados -> blocos 3D)
   ============================================================================ */

/** Devolve uma CÓPIA dos dados de uma fase. O jogo muta os blocos durante a
 *  partida (moedas coletadas, estado dos elevadores), então os dados em
 *  NIVEIS precisam continuar intactos entre uma partida e outra.
 *  Índice fora da faixa dá a volta (o texto de conclusão olha a próxima). */
function materializarNivel(indice) {
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

function carregarNivel(indice) {
  indiceNivel = indice;
  const dados = materializarNivel(indice);

  // limpa o nível anterior
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

  // ---- sistema de grade com os dados da fase ----
  // (cópia profunda dos dados: o jogo MUTA os blocos — moedas coletadas e
  //  estado dos elevadores — e os dados em NIVEIS precisam continuar intactos)
  grade = new Grade(dados.blocos.map(clonarBloco), dados.pontes);
  grade.pontesLivres = CONFIG.pontesSempreAtivas;
  for (const b of grade.lista) iniciarElevador(b);

  // ---- moedas: sorteio padronizado (ver sortearMoedas) ----
  sortearMoedas(dados, grade);
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
  raioNivel = 0.5 * Math.sqrt(tam.x ** 2 + tam.y ** 2 + tam.z ** 2) + 0.3;

  // ---- sol posicionado em relação ao centro do nível ----
  // (a área da sombra cresce junto com o mapa, para não "cortar" sombras)
  luzSol.position.set(alvoCentro.x + 7, alvoCentro.y + 13, alvoCentro.z + 6);
  luzSol.target.position.copy(alvoCentro);
  const s = raioNivel * 1.6;
  Object.assign(luzSol.shadow.camera, {
    left: -s, right: s, top: s, bottom: -s,
    near: 1, far: raioNivel * 4 + 40
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
    malha.userData.bloco = b;     // <-- ligação mala <-> dado da fase
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
  if (dados.pontes.length) setTimeout(() => avisar('🔭 Esta fase tem pontes: gire a câmera (Q/E) até as placas acenderem', 4000), 300);

  // ---- personagem no spawn ----
  spawn = spawnLocal;                 // já resolvido acima (usado pelas moedas)
  estado.blocoAtual = spawn;
  estado.passo = null;
  estado.fila = [];
  estado.concluido = false;
  personagem.position.copy(posicaoNoBloco(spawn));
  personagem.scale.setScalar(1);
  personagem.visible = true;
  destaque.visible = false;
  document.getElementById('tela-conclusao').classList.remove('visivel');

  // ---- HUD ----
  CONFIG.zoom = 1;               // cada fase começa enquadrada por completo
  totalMoedas = grade.lista.filter(b => b.tipo === 'moeda').length;
  coletadas = 0;
  atualizarHUD();
  atualizarIndicadorFase();

  atualizarEnquadramento();
}

/** Posição mundial (centro do personagem) em cima de um bloco. */
/* ---- pontes de câmera: placas quadradas finas no vão (acesas quando ativa) ---- */
const ANGULOS_TXT = ['0°', '90°', '180°', '270°'];   // quadrantes, para os avisos
let pontesVisuais = [];                            // { ponte, material } do nível atual
const COR_PONTE = new THREE.Color(0xe9d8b4);
const GEO_PLACA = new THREE.BoxGeometry(0.9, 0.06, 0.9);   // quadrado fino
const GEO_MARCADOR = new THREE.BoxGeometry(0.46, 0.04, 0.46);      // marcador de pulo: quadrado...
const MATERIAL_MARCADOR = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
const GEO_ANEL_MARCADOR = new THREE.RingGeometry(0.1, 0.16, 24);   // ...com um círculo dentro
const MATERIAL_ANEL_MARCADOR = new THREE.MeshBasicMaterial({ color: 0x1f2937 });

function criarPontes(pontes = []) {
  for (const p of pontes) {
    const material = new THREE.MeshStandardMaterial({ color: COR_PONTE, roughness: .6, transparent: true, opacity: .25 });
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

function atualizarPontes() {
  for (const { ponte, material } of pontesVisuais) {
    material.opacity = grade.ponteAtiva(ponte) ? 1 : 0.25;
  }
}

function posicaoNoBloco(b) {
  return new THREE.Vector3(b.x, b.y + 0.5 + RAIO_PERSONAGEM + 0.02, b.z);
}




/* ============================================================================
   6) CONTROLE DE CÂMERA — giro do cenário em passos de 90°
   ============================================================================ */
function girar(direcao) {                 // -1 = esquerda, +1 = direita
  estado.giroAlvo += direcao * Math.PI / 2;
}

function atualizarCamera(dt) {
  // interpolação exponencial (independente do FPS) até o alvo
  const dif = estado.giroAlvo - estado.giroAtual;
  if (Math.abs(dif) < 0.0008) estado.giroAtual = estado.giroAlvo;
  else estado.giroAtual += dif * (1 - Math.exp(-CONFIG.suavizacaoGiro * dt));

  const r = RAIO_ORBITA * Math.cos(ELEVACAO);
  camera.position.set(
    alvoCentro.x + r * Math.cos(estado.giroAtual),
    alvoCentro.y + RAIO_ORBITA * Math.sin(ELEVACAO),
    alvoCentro.z + r * Math.sin(estado.giroAtual)
  );
  camera.lookAt(alvoCentro);   // cenário sempre centralizado
}

/** Enquadra o diorama inteiro, em qualquer proporção de tela.
    O zoom (roda do mouse / botões) só aperta ou afasta esse enquadramento. */
function atualizarEnquadramento() {
  const aspecto = window.innerWidth / window.innerHeight;
  const necessario = 2 * raioNivel * CONFIG.margemCamera / CONFIG.zoom;
  const altura = aspecto < 1 ? necessario / aspecto : necessario;

  camera.top = altura / 2;
  camera.bottom = -altura / 2;
  camera.left = -altura * aspecto / 2;
  camera.right = altura * aspecto / 2;
  camera.updateProjectionMatrix();
}

/** Aproxima/afasta a câmera sem sair dos limites. */
function ajustarZoom(fator) {
  CONFIG.zoom = Math.min(CONFIG.zoomMax, Math.max(CONFIG.zoomMin, CONFIG.zoom * fator));
  atualizarEnquadramento();
  avisar(`Zoom ${Math.round(CONFIG.zoom * 100)}%`);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  atualizarEnquadramento();
});

// roda do mouse aproxima/afasta (passive:false para poder prevenir o scroll)
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  ajustarZoom(ev.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });


/* ============================================================================
   7) MOVIMENTAÇÃO — raycast na face superior + validação na grade
   ============================================================================ */
const ray = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();

/** Devolve o BLOCO que está sob o cursor (testando a face de cima dos tiles). */
function blocoSobOCursor(ev) {
  const r = canvas.getBoundingClientRect();
  ponteiro.x =  ((ev.clientX - r.left) / r.width)  * 2 - 1;
  ponteiro.y = -((ev.clientY - r.top)  / r.height) * 2 + 1;
  ray.setFromCamera(ponteiro, camera);
  const acertos = ray.intersectObjects(tilesRaycast, false); // false = ignora filhos (moedas)
  if (!acertos.length) return null;
  // prioriza a FACE SUPERIOR do bloco (como manda o design do jogo);
  // as malhas não são rotacionadas, então a normal local vale como mundial
  const superior = acertos.find(a => a.face && a.face.normal.y > 0.5);
  return (superior || acertos[0]).object.userData.bloco;
}

/** Define uma sequência de blocos a percorrer. */
function definirRota(rota) {
  if (estado.caindo) return;
  estado.aguardandoPonte = null;
  estado.fila = rota || [];
  if (!estado.passo) proximoPasso();
}

/** Existe caminho A PÉ (sem elevador) de um bloco até uma célula? */
function alcancaAPe(de, celula) {
  const alvo = chave(celula.x, celula.y, celula.z);
  const ant = new Set([chave(de.x, de.y, de.z)]);
  const fila = [de];
  while (fila.length) {
    const atual = fila.shift();
    if (chave(atual.x, atual.y, atual.z) === alvo) return true;
    for (const v of grade.vizinhos(atual)) {
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
  for (const e of grade.lista) {
    if (!e.elev) continue;
    const ladoLa = { x: e.elev.para.x, y: e.elev.para.y, z: e.elev.para.z };
    // o destino tem de ser alcançável a pé do "lado de lá"...
    if (!alcancaAPe(ladoLa, destino)) continue;
    // ...e nós temos de estar do "lado de cá"
    if (alcancaAPe(ladoLa, atual)) continue;
    const celula = grade.vizinhos(e).find(v => alcancaAPe(atual, v));
    if (celula) return celula;
  }
  return null;
}

function proximoPasso() {
  const destino = estado.fila.shift();
  if (!destino) return;
  if (destino.tipo === 'ponte' && !grade.ponteAtiva(destino.ponte)) {
    // a câmera está girando para o ângulo certo: espera o giro assentar, em vez de cair
    if (grade.quadrante === null && quadranteAlvo(estado.giroAlvo) === destino.ponte.angulo) {
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

/** Pulo com marcador: salta sobre o vão até a célula andável. Sem chão do outro
    lado, cai. Se há chão à frente, não é pulo: quem chama anda um passo. */
function pularSobre(ix, iz) {
  if (estado.passo || estado.caindo) return;
  const de = estado.blocoAtual;
  const destino = alvoDoPulo(grade, de, ix, iz);
  if (!destino) { cairNoVao(); return; }
  estado.fila = [];
  estado.aguardandoPonte = null;
  const origem = personagem.position.clone();
  estado.passo = { de: origem, para: posicaoNoBloco(destino), bloco: destino, t: 0, pulo: true };
  girarPersonagemPara(destino.x - de.x, destino.z - de.z);
  estado.blocoAtual = destino;
}

/** Uma seta anda um passo (uma placa inativa leva à espera ou à queda). */
function andarUmPasso(ix, iz) {
  if (estado.caindo || estado.concluido || viajandoDeElevador()) return;
  const de = estado.blocoAtual;
  for (const dy of [0, 1, -1]) {
    const alvo = grade.obter(de.x + ix, de.y + dy, de.z + iz);
    if (alvo && alvo.tipo === 'ponte') { definirRota([alvo]); return; }
    if (grade.podeMover(de, alvo)) { definirRota([alvo]); return; }
  }
}

const PRAZO_SETA_MS = 400;
/** Setas: uma seta anda um passo. No marcador de pulo, duas setas seguidas
    na direção da ponte pulam até a outra ponta. */
function pressionarSeta(ix, iz) {
  const noMarcador = !estado.passo && estado.blocoAtual.tipo === 'pulo';
  const frente = noMarcador ? grade.obter(estado.blocoAtual.x + ix, estado.blocoAtual.y, estado.blocoAtual.z + iz) : null;
  const pend = estado.setaPulo;
  if (pend) {                                           // havia uma seta esperando
    clearTimeout(pend.timer);
    estado.setaPulo = null;
    if (noMarcador && pend.ix === ix && pend.iz === iz && performance.now() - pend.t < PRAZO_SETA_MS) {
      if (grade.andavel(frente)) andarUmPasso(ix, iz); else pularSobre(ix, iz);
      return;
    }
    andarUmPasso(pend.ix, pend.iz);
  }
  if (noMarcador) {                                     // 1ª seta no marcador: espera a 2ª
    const timer = setTimeout(() => { estado.setaPulo = null; andarUmPasso(ix, iz); }, PRAZO_SETA_MS);
    estado.setaPulo = { t: performance.now(), timer, ix, iz };
    return;
  }
  andarUmPasso(ix, iz);
}

/** Tentou atravessar uma ponte fora do alinhamento: cai no vão e a fase reinicia. */
function cairNoVao(ponte = null) {
  estado.caindo = true;
  estado.fila = [];
  estado.passo = null;
  const y0 = personagem.position.y;
  avisar(ponte ? `💀 Caiu no vão! Para atravessar, ${dicaGiro(ponte.angulo)}` : '💀 Caiu no vão! A fase vai reiniciar…', 3500);
  tween(0.8, p => {
    personagem.position.y = y0 - p * p * 6;
    personagem.scale.setScalar(1 - p * 0.5);
  }, () => {
    estado.caindo = false;
    carregarNivel(indiceNivel);
  });
}

/** Espera de ponte: retoma a travessia quando a ponte acende; cai se a câmera
    saiu do ângulo ou se o prazo acabou. */
const PRAZO_PONTE = 2;                                 // segundos
function atualizarPontePendente(dt) {
  const p = estado.aguardandoPonte;
  if (!p) return;
  p.t += dt;
  if (grade.ponteAtiva(p.ponte)) {
    estado.aguardandoPonte = null;
    estado.fila.unshift(p.destino);
    proximoPasso();
  } else if (grade.quadrante !== null || quadranteAlvo(estado.giroAlvo) !== p.ponte.angulo || p.t >= PRAZO_PONTE) {
    estado.aguardandoPonte = null;
    cairNoVao(p.ponte);
  }
}

function atualizarPasso(dt) {
  const p = estado.passo;
  if (!p) return;

  p.t += dt / CONFIG.duracaoPasso;
  if (p.t >= 1) {
    p.t = 1;
    estado.passo = null;
    personagem.position.copy(p.para);
    aoEntrarNoBloco(p.bloco);
    if (!estado.concluido) proximoPasso();
  } else {
    const e = p.t < .5 ? 4 * p.t ** 3 : 1 - (-2 * p.t + 2) ** 3 / 2;  // easeInOutCubic
    personagem.position.lerpVectors(p.de, p.para, e);
    const altura = p.pulo ? CONFIG.alturaSalto : CONFIG.alturaPulo;
    personagem.position.y += Math.sin(Math.PI * p.t) * altura;  // pulinho (arco, na ponte)
  }
}

/** Chegou em um bloco: era moeda? então coleta. */
function aoEntrarNoBloco(b) {
  if (b.tipo === 'moeda') coletarMoeda(b);
}

function coletarMoeda(b) {
  b.tipo = 'chao';                       // o piso continua lá, sem a moeda
  b.malha.material = MATERIAL.chao;

  const malha = b.moeda;
  b.moeda = null;
  cancelarTweens(malha);                     // interrompe o "surgir", se ainda rolando
  malha.scale.setScalar(1);

  // animação: a moeda sobe, gira e desaparece
  tween(0.45, p => {
    malha.position.y = 0.78 + p * 1.2;
    malha.rotation.y += 0.35;
    malha.scale.setScalar(Math.max(0.001, 1 - p));
    malha.material.opacity = 1 - p;
  }, () => {
    malha.parent.remove(malha);
    malha.material.dispose();
  });

  coletadas++;
  somarMoedaUniversal();            // +1 no contador universal (salvo)
  atualizarHUD();
  popupMoeda(b);                    // "+1" sobe da moeda
  avisar(`🪙 Moeda coletada! (${coletadas}/${totalMoedas} · total ${totalUniversal})`);

  if (CONFIG.concluirAposTodasAsMoedas && coletadas >= totalMoedas) concluirFase();
  else if (!CONFIG.concluirAposTodasAsMoedas) concluirFase();
}

/* ---- rotação do personagem (encara o destino; parado, encara a câmera) ---- */
function girarPersonagemPara(dx, dz) {
  if (dx || dz) rotacaoPersonagemAlvo = Math.atan2(dx, dz);
}

function atualizarRotacaoPersonagem(dt) {
  // enquanto anda, encara o destino; quando para, mantém a direção do último
  // passo (a menos que CONFIG.personagemEncaraACamera esteja true)
  if (!estado.passo && CONFIG.personagemEncaraACamera) {
    rotacaoPersonagemAlvo = Math.atan2(
      camera.position.x - personagem.position.x,
      camera.position.z - personagem.position.z
    );
  }
  let d = rotacaoPersonagemAlvo - personagem.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));   // menor ângulo
  personagem.rotation.y += d * (1 - Math.exp(-12 * dt));
}

/* ---- clique: move o personagem ---- */
canvas.addEventListener('click', ev => {
  if (estado.concluido || estado.caindo) return;
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
  const b = blocoSobOCursor(ev);
  if (!b || b === estado.blocoAtual) return;

  if (!TIPOS_ANDAVEIS.has(b.tipo) && b.tipo !== 'ponte') { avisar('Esse bloco não é caminhável 🚧'); return; }

  if (CONFIG.permitirCliqueDistante) {
    let caminho = grade.rota(estado.blocoAtual, b);
    // não dá a pé? talvez só dê de elevador: manda para a célula de embarque
    if ((!caminho || !caminho.length) && !viajandoDeElevador()) {
      const embarque = celulaDeEmbarque(b);
      if (embarque) {
        avisar('🛗 Só dá de elevador — indo para a plataforma');
        caminho = grade.rota(estado.blocoAtual, embarque);
      }
    }
    if (!caminho || !caminho.length) {
      // a ponte até lá está fora do alinhamento: vai até a borda e cai se tentar atravessar
      const angulo = grade.anguloPonteBloqueante(estado.blocoAtual, b);
      if (angulo == null) { avisar('Não existe caminho até lá 🚫'); return; }
      avisar(`🔭 Ponte fora do alinhamento: ${dicaGiro(angulo)} ou cai no vão`, 3500);
      caminho = grade.rotaSobPontes(estado.blocoAtual, b);
    }
    definirRota(caminho);
  } else {
    if (!grade.podeMover(estado.blocoAtual, b)) { avisar('Clique em um bloco ao lado 👆'); return; }
    definirRota([b]);
  }
});

/* ---- mouse: destaca o bloco que pode receber o personagem ---- */
canvas.addEventListener('pointermove', ev => {
  const b = blocoSobOCursor(ev);
  if (b && grade.podeMover(estado.blocoAtual, b)) {
    destaque.visible = true;
    destaque.position.set(b.x, b.y, b.z);
    canvas.style.cursor = 'pointer';
  } else {
    destaque.visible = false;
    canvas.style.cursor = 'default';
  }
});
canvas.addEventListener('pointerleave', () => { destaque.visible = false; });

/* ---- teclado: WASD/setas movem, Q/E giram a tela ---- */
const TECLAS = {
  arrowup: [0, 1], w: [0, 1],
  arrowdown: [0, -1], s: [0, -1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  q: 'girar-esq', e: 'girar-dir'          // giram o cenário em 90°
};

window.addEventListener('keydown', ev => {
  const tecla = TECLAS[ev.key.toLowerCase()];

  // Q / E: giro da tela (funciona até com a fase concluída)
  if (tecla === 'girar-esq' || tecla === 'girar-dir') {
    ev.preventDefault();
    girar(tecla === 'girar-esq' ? -1 : 1);
    return;
  }

  if (estado.concluido) return;
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
  const dir = tecla;
  if (!dir) return;
  ev.preventDefault();

  // converte a direção da tela para a direção do mundo, conforme o giro atual
  const yaw = estado.giroAtual;
  const frenteX = -Math.cos(yaw), frenteZ = -Math.sin(yaw);  // "fundo da tela"
  const dirX = Math.sin(yaw), dirZ = -Math.cos(yaw);         // "direita da tela"
  const mx = dirX * dir[0] + frenteX * dir[1];
  const mz = dirZ * dir[0] + frenteZ * dir[1];

  // reduz para o eixo dominante (movimento sempre alinhado à grade)
  const ix = Math.abs(mx) >= Math.abs(mz) ? Math.sign(mx) : 0;
  const iz = Math.abs(mx) >= Math.abs(mz) ? 0 : Math.sign(mz);

  pressionarSeta(ix, iz);
});

/* ---- botões de giro ---- */
document.getElementById('btn-girar-esq').addEventListener('click', () => girar(-1));
document.getElementById('btn-girar-dir').addEventListener('click', () => girar(1));
document.getElementById('btn-zoom-menos').addEventListener('click', () => ajustarZoom(1 / 1.2));
document.getElementById('btn-zoom-mais').addEventListener('click', () => ajustarZoom(1.2));

// navegação livre entre fases (botões ◀ ▶ do HUD)
document.getElementById('btn-fase-anterior').addEventListener('click', () => {
  // ◀ na Fase 1 volta para a última fase manual
  carregarNivel(indiceNivel === 0 ? NIVEIS.length - 1 : indiceNivel - 1);
  avisar(`Fase ${indiceNivel + 1}`);
});
document.getElementById('btn-fase-proxima').addEventListener('click', () => {
  carregarNivel(indiceNivel + 1);
  avisar(`Fase ${indiceNivel + 1}`);
});


/* ============================================================================
   8) INTERFACE (HUD)
   ============================================================================ */
/* ---- CONTADOR UNIVERSAL DE MOEDAS -----------------------------------------
   Cada moeda coletada em QUALQUER fase soma +1 neste total, que fica salvo no
   navegador (localStorage). Diferente do contador da fase, que mostra
   "coletadas/total desta fase" e zera ao trocar de nível.                */
let totalUniversal = 0;

function carregarTotalUniversal() {
  try {
    const salvo = Number(localStorage.getItem('diorama-total-moedas'));
    totalUniversal = Number.isFinite(salvo) && salvo > 0 ? Math.floor(salvo) : 0;
  } catch { totalUniversal = 0; }
  return totalUniversal;
}

function somarMoedaUniversal() {
  totalUniversal++;
  try { localStorage.setItem('diorama-total-moedas', String(totalUniversal)); }
  catch { /* localStorage indisponível: o total vale só para esta sessão */ }
  return totalUniversal;
}

function atualizarTotalUniversal() {
  document.getElementById('total-moedas').textContent = `Total 🪙 ${totalUniversal}`;
}

function atualizarHUD() {
  document.getElementById('nome-fase').textContent = materializarNivel(indiceNivel).nome;
  document.getElementById('contador-moedas').textContent = `🪙 ${coletadas}/${totalMoedas}`;
  atualizarTotalUniversal();
}

/** Popup "+1" que sobe da moeda coletada (posição do mundo -> tela). */
function popupMoeda(bloco) {
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

/** Rótulo "Fase 2/5" — aparece no painel de título. */
function atualizarIndicadorFase() {
  document.getElementById('nome-fase').textContent =
    `${materializarNivel(indiceNivel).nome}  ·  ${indiceNivel + 1}/∞`;
}
let temporizadorAviso;
function avisar(texto, ms = 1700) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visivel'), ms);
}

/** Texto de quantos giros e para que lado (Q/E) ativam a ponte de `angulo`. */
function dicaGiro(angulo) {
  const g = giroNecessario(quadranteAlvo(estado.giroAlvo), angulo);
  if (!g.vezes) return 'a ponte já está alinhada';
  const tecla = g.lado === 'direita' ? 'DIREITA (E)' : 'ESQUERDA (Q)';
  return `gire ${g.vezes > 1 ? g.vezes + '× ' : ''}para a ${tecla}`;
}

/** Existe uma fase depois dessa? (na última, o botão volta para a Fase 1) */

function concluirFase() {
  estado.concluido = true;
  estado.fila = [];
  estado.passo = null;

  // guarda o progresso (a fase mais avançada já concluída)
  try {
    const salvo = Number(localStorage.getItem('diorama-progresso') || 0);
    if (indiceNivel + 1 > salvo) localStorage.setItem('diorama-progresso', String(indiceNivel + 1));
  } catch { /* localStorage indisponível: segue sem salvar */ }

  if (CONFIG.usarAlertaNativo) alert('Fase Concluída!');

  // não há fim: depois das fases manuais, as fases procedurais continuam
  document.getElementById('titulo-conclusao').textContent = 'Fase Concluída!';
  document.getElementById('texto-conclusao').textContent =
    `Você coletou todas as moedas. Prepare-se para: ${materializarNivel(indiceNivel + 1).nome}`;
  document.getElementById('btn-proxima').textContent = 'Próxima Fase ▶';
  document.getElementById('total-moedas').textContent = `Total 🪙 ${totalUniversal} moedas`;
  document.getElementById('tela-conclusao').classList.add('visivel');  }

function reiniciar() {
  document.getElementById('tela-conclusao').classList.remove('visivel');
  carregarNivel(indiceNivel);
  avisar('Fase reiniciada ↺');
}

/** Avança para a próxima fase; na última, volta para a primeira. */
function proximaFase() {
  document.getElementById('tela-conclusao').classList.remove('visivel');
  carregarNivel(indiceNivel + 1);
  avisar(`Fase ${indiceNivel + 1}`);
}

document.getElementById('btn-reiniciar').addEventListener('click', reiniciar);
document.getElementById('btn-reiniciar-hud').addEventListener('click', reiniciar);
document.getElementById('btn-proxima').addEventListener('click', proximaFase);

// Enter / Espaço avançam de fase na tela de conclusão
window.addEventListener('keydown', ev => {
  if (!estado.concluido) return;
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); proximaFase(); }
});

/* ---- sistema simples de "tweens" (animações com duração) ---- */
const tweens = [];
function tween(duracao, aoAtualizar, aoTerminar = null, atraso = 0, alvo = null) {
  tweens.push({ t: -atraso, duracao, aoAtualizar, aoTerminar, alvo });
}
/** Cancela animações pendentes de um objeto (ex.: moeda que foi coletada). */
function cancelarTweens(alvo) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    if (tweens[i].alvo === alvo) tweens.splice(i, 1);
  }
}
function atualizarTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    if (tw.t < 0) continue;                 // ainda no atraso inicial
    const p = Math.min(tw.t / tw.duracao, 1);
    tw.aoAtualizar(p);
    if (p >= 1) {
      tweens.splice(i, 1);
      if (tw.aoTerminar) tw.aoTerminar();
    }
  }
}


/* ============================================================================
   9) LOOP PRINCIPAL
   ============================================================================ */
function atualizarMoedas(dt, tempo) {
  for (const b of grade.lista) {
    if (!b.moeda) continue;
    b.moeda.rotation.y += dt * 2.4;                                    // gira
    b.moeda.position.y = 0.78 + Math.sin(tempo * 2.2 + b.faseMoeda) * 0.05; // flutua
  }
}

let ultimo = performance.now();
function animar(agora) {
  requestAnimationFrame(animar);
  const dt = Math.min((agora - ultimo) / 1000, 0.05);   // no máx. 50ms por quadro
  const tempo = agora / 1000;
  ultimo = agora;

  atualizarCamera(dt);
  grade.quadrante = quadranteAssentado(estado.giroAtual, estado.giroAlvo);
  atualizarPontes();
  atualizarElevadores(dt);
  atualizarPasso(dt);
  atualizarPontePendente(dt);
  atualizarRotacaoPersonagem(dt);
  atualizarMoedas(dt, tempo);
  atualizarTweens(dt);

  renderer.render(cena, camera);
}

/* ---- início ---- */
// continua de onde o jogador parou (progresso salvo no navegador)
let inicio = 0;
try {
  const salvo = Number(localStorage.getItem('diorama-progresso') || 0);
  if (Number.isFinite(salvo) && salvo >= 0) inicio = salvo;
} catch { /* localStorage indisponível: começa na Fase 1 */ }
carregarTotalUniversal();          // contador universal de moedas
carregarNivel(inicio);
requestAnimationFrame(animar);
window.__DIORAMA_PRONTO__ = true;   // usada pelo aviso de erro da CDN
