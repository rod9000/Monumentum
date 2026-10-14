/* ============================================================================
   DIORAMA PUZZLE — regras do jogo e ligação de tudo (estilo Captain Toad)
   ----------------------------------------------------------------------------
   Módulos:
     config.js ........ parâmetros (CONFIG)              estado.js ..... estado da partida
     cena.js .......... 3D: câmera, luzes, materiais     hud.js ........ textos, avisos, conclusão
     menu.js .......... escolha de fase                  som.js ........ sons e mudo (WebAudio)
     progresso.js ..... moedas, recordes e estrelas      toque.js ...... gestos e D-pad
     grade.js ......... caminhada na grade (pontes, pulo, elevador)
     elevadores.js .... movimentação dos elevadores      moedas.js ..... sorteio de moedas
     dados/niveis.js .. fases manuais                    procedural.js . fases infinitas
   Este arquivo tem: construção do nível, personagem, movimentação, entrada
   (teclado, mouse, toque), regras de moedas e fases, e o loop principal.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NIVEIS } from './dados/niveis.js';
import { Grade, chave, elevadorParado, TIPOS_ANDAVEIS, quadranteAssentado, quadranteAlvo, giroNecessario, placasDaPonte, alvoDoPulo } from './grade.js';
import { clonarBloco, iniciarElevador, moverBloco } from './elevadores.js';
import { sortearMoedas } from './moedas.js';
import { gerarFase } from './procedural.js';
import { classificarGesto, fatorDePinca, direcaoDoMundo, maisProximoDoToque, ehDispositivoDeToque } from './toque.js';
import { estado } from './estado.js';
import { canvas, renderer, cena, camera, alvoCentro, enquadramento, luzSol, GEO_BLOCO, GEO_MOEDA, GEO_BORDAS, MATERIAL_BORDA, MATERIAL, materialMoedaBrilhante, destaque, atualizarCamera, atualizarEnquadramento } from './cena.js';
import { avisar, popupMoeda, atualizarTextoFase, atualizarContadores, mostrarConclusao, esconderConclusao, atualizarBotaoSom } from './hud.js';
import { montarMenu } from './menu.js';
import { montarLoja } from './loja.js';
import { SKINS } from './skins.js';
import { criarSom } from './som.js';
import { criarProgresso, textoEstrelas } from './progresso.js';
import { calcularPar, notaDeDificuldade, faixaDeDificuldade } from './par.js';

const TOQUE = ehDispositivoDeToque();       // celular/tablet: D-pad, gestos e layout compacto
const som = criarSom();
const progresso = criarProgresso();
const menu = montarMenu({ onEscolher: indice => { carregarNivel(indice); avisar(`Fase ${indice + 1}`); } });
const loja = montarLoja({ onEscolher: escolherSkin });


/* ============================================================================
   ESTADO DA PARTIDA
   ============================================================================ */
let indiceNivel = 0;
let grade = null;            // Grade do nível atual
let grupoNivel = null;       // grupo com todos os blocos do nível
let tilesRaycast = [];       // malhas testadas no raycast
let spawn = null;
let totalMoedas = 0;         // moedas desta fase
let coletadas = 0;           // moedas coletadas nesta tentativa (só valem ao concluir)
let timersDicas = [];        // dicas agendadas da fase atual (cancelam ao trocar de fase)
let parDaFase = null;        // { par, passosPorMoeda }: passos do caminho mais curto até todas as moedas
const faixas = new Map();    // índice da fase -> 'fácil' | 'médio' | 'difícil' (a nota é calculada uma vez)
let nomeDaFase = '';         // nome da fase atual, para atualizar o HUD quando a faixa ficar pronta
let ultimo = performance.now();

const RAIO_PERSONAGEM = 0.30;

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

/** Pinta a bola com a skin escolhida (cor, brilho próprio, rugosidade e metal). Os olhos não mudam. */
function aplicarSkin(id) {
  const s = SKINS.find(x => x.id === id) || SKINS[0];
  const m = corpo.material;
  m.color.set(s.cor);
  m.emissive.set(s.emissiva);
  m.emissiveIntensity = s.intensidadeEmissiva;
  m.roughness = s.rugosidade;
  m.metalness = s.metalico;
}
aplicarSkin(progresso.skinAtual);


/* ============================================================================
   1) DADOS DAS FASES E CONSTRUÇÃO DO NÍVEL
   Cada bloco é um objeto { x, y, z, tipo }: x leste (+), y altura (0 = chão),
   z sul (+). Tipos: 'chao', 'parede', 'moeda', 'spawn', 'elevador', 'pulo'.
   As fases ficam em src/dados/niveis.js (manuais) e em src/procedural.js.
   ============================================================================ */

/** Devolve uma CÓPIA dos dados de uma fase. O jogo muta os blocos durante a
 *  partida (moedas coletadas, estado dos elevadores), então os dados em
 *  NIVEIS precisam continuar intactos entre uma partida e outra. */
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

/** Carrega a fase `indice`. Qualquer partida anterior (esperas, setas, dicas,
 *  moedas da tentativa) é descartada: a fase começa do zero. */
function carregarNivel(indice) {
  indiceNivel = indice;
  estado.geracao++;                             // cancela esperas e quedas da fase anterior
  if (estado.setaPulo) clearTimeout(estado.setaPulo.timer);
  estado.setaPulo = null;
  estado.aguardandoPonte = null;
  estado.caindo = false;
  timersDicas.forEach(clearTimeout);
  timersDicas = [];

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

  // ---- grade com os dados da fase (cópia: o jogo muta os blocos) ----
  grade = new Grade(dados.blocos.map(clonarBloco), dados.pontes);
  grade.pontesLivres = CONFIG.pontesSempreAtivas;
  for (const b of grade.lista) iniciarElevador(b);

  // ---- moedas: sorteio padronizado (ver sortearMoedas) ----
  sortearMoedas(dados, grade);
  parDaFase = calcularPar(grade);             // meta da fase: o caminho mais curto até todas as moedas

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
  dicas.forEach((texto, i) => timersDicas.push(setTimeout(() => avisar(texto, 4000), 300 + i * 4300)));

  // ---- personagem no spawn ----
  spawn = spawnLocal;                 // já resolvido acima (usado pelas moedas)
  estado.blocoAtual = spawn;
  estado.passo = null;
  estado.fila = [];
  estado.concluido = false;
  estado.passos = 0;                  // nova tentativa: pontuação do zero
  estado.inicioMs = performance.now();
  personagem.position.copy(posicaoNoBloco(spawn));
  personagem.scale.setScalar(1);
  personagem.visible = true;
  destaque.visible = false;
  esconderConclusao();

  // ---- HUD ----
  CONFIG.zoom = 1;               // cada fase começa enquadrada por completo
  totalMoedas = grade.lista.filter(b => b.tipo === 'moeda').length;
  coletadas = 0;
  nomeDaFase = dados.nome;
  atualizarTextoFase(nomeDaFase, indice, faixaDaFase(indice));
  agendarFaixaAtual();
  atualizarMostrador();

  atualizarEnquadramento();
}

/** Mostra moedas e passos. O total salvo mais o que está em jogo nesta tentativa. */
function atualizarMostrador() {
  atualizarContadores({
    coletadas,
    total: totalMoedas,
    passos: estado.passos,
    par: parDaFase ? parDaFase.par : null,
    saldo: progresso.saldo,
    emJogo: estado.concluido ? 0 : coletadas
  });
}


/* ============================================================================
   2) PONTES DE CÂMERA (placas andáveis no vão, acesas quando ativa)
   ============================================================================ */
const COR_PONTE = new THREE.Color(0xe9d8b4);
let pontesVisuais = [];                            // { ponte, material } do nível atual
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

/** Texto de quantos giros e para que lado (Q/E) ativam a ponte de `angulo`. */
function dicaGiro(angulo) {
  const g = giroNecessario(quadranteAlvo(estado.giroAlvo), angulo);
  if (!g.vezes) return 'a ponte já está alinhada';
  const tecla = g.lado === 'direita' ? 'DIREITA (E)' : 'ESQUERDA (Q)';
  return `gire ${g.vezes > 1 ? g.vezes + '× ' : ''}para a ${tecla}`;
}

/** Posição mundial (centro do personagem) em cima de um bloco. */
function posicaoNoBloco(b) {
  return new THREE.Vector3(b.x, b.y + 0.5 + RAIO_PERSONAGEM + 0.02, b.z);
}


/* ============================================================================
   3) CONTROLE DE CÂMERA — giro em passos de 90° e zoom
   ============================================================================ */
function girar(direcao) {                 // -1 = esquerda, +1 = direita
  estado.giroAlvo += direcao * Math.PI / 2;
  som.tocar('giro');
}

/** Aproxima/afasta a câmera sem sair dos limites. */
function ajustarZoom(fator, silencioso = false) {
  CONFIG.zoom = Math.min(CONFIG.zoomMax, Math.max(CONFIG.zoomMin, CONFIG.zoom * fator));
  atualizarEnquadramento();
  if (!silencioso) avisar(`Zoom ${Math.round(CONFIG.zoom * 100)}%`);
}

// roda do mouse aproxima/afasta (passive:false para poder prevenir o scroll)
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  ajustarZoom(ev.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });


/* ============================================================================
   4) ELEVADORES (atualização por quadro)
   ============================================================================ */
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
   5) MOVIMENTAÇÃO — raycast, rota na grade, passos, pulo e queda
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

/** Próximo passo da fila. Placa de ponte fora do alinhamento: espera ou cai. */
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

/** Pulo com marcador: salta sobre o vão até o próximo bloco de pulo na direção.
    Sem bloco de pulo do outro lado, cai. Se há chão à frente, não é pulo. */
function pularSobre(ix, iz) {
  if (estado.passo || estado.caindo) return;
  const de = estado.blocoAtual;
  const destino = alvoDoPulo(grade, de, ix, iz);
  if (!destino) { cairNoVao(); return; }
  estado.fila = [];
  estado.aguardandoPonte = null;
  som.tocar('pulo');
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
/** Setas: uma seta anda um passo. No bloco de pulo sem chão à frente, duas setas
    seguidas na mesma direção pulam até o próximo bloco de pulo. */
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
  // no bloco de pulo, só espera a 2ª seta se não há chão à frente (senão é um passo comum)
  if (noMarcador && !grade.andavel(frente)) {
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

/** Caiu no vão: o personagem some para baixo e a fase reinicia (as moedas da
    tentativa são descartadas). */
function cairNoVao(ponte = null) {
  estado.caindo = true;
  estado.fila = [];
  estado.passo = null;
  estado.aguardandoPonte = null;
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
    som.tocar('ponte');
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
    estado.passos++;                    // pontuação: cada passo (ou pulo) conta
    if (!p.pulo) som.tocar('passo');
    atualizarMostrador();
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

function coletarMoeda(b) {
  b.tipo = 'chao';                       // o piso continua lá, sem a moeda
  b.malha.material = MATERIAL.chao;

  const malha = b.moeda;
  b.moeda = null;
  cancelarTweens(malha);                 // interrompe o "surgir", se ainda rolando
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
  som.tocar('moeda');
  atualizarMostrador();
  popupMoeda(b);                         // "+1" sobe da moeda
  avisar(`🪙 Moeda coletada! (${coletadas}/${totalMoedas} · saldo ${progresso.saldo + coletadas})`);

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


/* ============================================================================
   6) ENTRADA — mouse, toque (gestos, D-pad) e teclado
   ============================================================================ */

/* ---- clique: move o personagem ---- */
canvas.addEventListener('click', ev => {
  if (estado.concluido || estado.caindo) return;
  if (performance.now() - fimDoGestoMs < 350) return;     // fim de arraste/pinça, não é toque
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
  const b = blocoNoToque(ev);
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
  if (ev.pointerType === 'touch') return;          // no toque, o destaque é o do toque (abaixo)
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
    destaque.visible = !!(b && grade.podeMover(estado.blocoAtual, b));
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

/** Seta da tela (D-pad ou teclado): as mesmas regras para os dois. */
function pressionarDirecao(dir) {
  if (estado.concluido) return;
  if (viajandoDeElevador()) { avisar('🛗 Espera o elevador chegar…'); return; }
  const { ix, iz } = direcaoDoMundo(dir, estado.giroAtual);
  pressionarSeta(ix, iz);
}

let ultimoTipoPonteiro = 'mouse';
/** Bloco sob o toque. No celular, se o raio não acerta nenhum bloco, usa o mais
    próximo na tela (blocos pequenos ou afastados). */
function blocoNoToque(ev) {
  const b = blocoSobOCursor(ev);
  if (b || ultimoTipoPonteiro !== 'touch') return b;
  const r = canvas.getBoundingClientRect();
  const candidatos = [];
  const v = new THREE.Vector3();
  for (const m of tilesRaycast) {
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
document.getElementById('btn-girar-esq').addEventListener('click', () => girar(-1));
document.getElementById('btn-girar-dir').addEventListener('click', () => girar(1));

/* ---- D-pad na tela (celular): mesma lógica das setas do teclado ---- */
const DPAD = { 'btn-dpad-cima': [0, 1], 'btn-dpad-baixo': [0, -1], 'btn-dpad-esq': [-1, 0], 'btn-dpad-dir': [1, 0] };
for (const [id, dir] of Object.entries(DPAD)) {
  document.getElementById(id).addEventListener('click', () => pressionarDirecao(dir));
}
if (TOQUE && document.body) document.body.classList.add('toque');

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

// som: liga/desliga (salvo no navegador)
document.getElementById('btn-som').addEventListener('click', () => {
  som.alternarMudo();
  som.desbloquear();
  atualizarBotaoSom(som.mudo);
});

// menu de fases: abre a grade com as fases abertas e concluídas
document.getElementById('btn-menu').addEventListener('click', () => {
  const itens = itensMenu();
  menu.abrir(itens);
  completarFaixasDoMenu(itens.map(it => it.indice));
});

// loja de skins (🎨): as aparências da bola, compradas com as moedas salvas
document.getElementById('btn-skins').addEventListener('click', () => loja.abrir(itensLoja(), progresso.saldo));

/** Itens da loja: cada skin com a situação dela (equipada, já comprada, à venda ou sem saldo). */
function itensLoja() {
  const saldo = progresso.saldo;
  return SKINS.map(s => {
    let estadoSkin = 'sem-saldo';
    if (progresso.possui(s.id)) estadoSkin = progresso.skinAtual === s.id ? 'equipada' : 'possui';
    else if (saldo >= s.preco) estadoSkin = 'comprar';
    return { id: s.id, nome: s.nome, cor: s.cor, preco: s.preco, estado: estadoSkin, faltam: Math.max(0, s.preco - saldo) };
  });
}

/** Toque numa skin da loja: compra (e equipa) se ainda não tem, ou só equipa se já comprou. */
function escolherSkin(id) {
  const s = SKINS.find(x => x.id === id);
  if (progresso.possui(id)) {
    progresso.equipar(id);
    avisar(`Skin ${s.nome} equipada`);
  } else if (progresso.comprar(id, s.preco)) {
    avisar(`🎨 Skin ${s.nome} comprada e equipada!`);
  } else {
    avisar(`Faltam ${s.preco - progresso.saldo} 🪙 para ${s.nome}`);
  }
  aplicarSkin(progresso.skinAtual);
  atualizarMostrador();
  loja.abrir(itensLoja(), progresso.saldo);
}

/** Itens do menu: as concluídas (com estrelas), a atual e as abertas; mais duas travadas à frente. */
function itensMenu() {
  const maior = progresso.maiorConcluida();
  const fim = Math.max(indiceNivel, maior + 1) + 2;
  const itens = [];
  for (let i = 0; i <= fim; i++) {
    const rec = progresso.recorde(i);
    let estadoFase = 'travada';
    if (progresso.concluida(i)) estadoFase = 'concluida';
    else if (i === indiceNivel) estadoFase = 'atual';
    else if (progresso.aberta(i)) estadoFase = 'aberta';
    itens.push({
      indice: i,
      nome: NIVEIS[i]?.nome ?? `Fase ${i + 1} (procedural)`,
      estado: estadoFase,
      estrelas: rec ? rec.estrelas : 0,
      dificuldade: faixaDaFase(i)
    });
  }
  return itens;
}

/* ---- dificuldade da fase: a nota (média do par sobre sorteios) é calculada uma vez,
   depois que a fase aparece, para não travar o carregamento ---- */
function faixaDaFase(indice) {
  return faixas.get(indice) ?? null;
}

/** Calcula a faixa de uma fase e guarda (no máximo uma vez por fase). */
function calcularFaixa(indice) {
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
    atualizarTextoFase(nomeDaFase, indice, calcularFaixa(indice));
  }, 0);
}

/** Calcula, uma por vez, as faixas que a lista do menu ainda não tem. */
function completarFaixasDoMenu(indices) {
  const pendentes = indices.filter(i => !faixas.has(i));
  const proxima = () => {
    const i = pendentes.shift();
    if (i === undefined) return;
    menu.atualizarDificuldade(i, calcularFaixa(i));
    setTimeout(proxima, 0);
  };
  setTimeout(proxima, 0);
}


/* ============================================================================
   7) REGRAS DE MOEDAS, CONCLUSÃO E FASES
   ============================================================================ */

/** Fase concluída: confirma as moedas no total (progresso salvo) e mostra a pontuação. */
function concluirFase() {
  estado.concluido = true;
  estado.fila = [];
  estado.passo = null;
  estado.aguardandoPonte = null;
  const tempo = (performance.now() - estado.inicioMs) / 1000;
  const par = parDaFase ? parDaFase.par : null;
  const r = progresso.concluir(indiceNivel, { moedas: coletadas, passos: estado.passos, tempo, par });
  som.tocar('fase');
  if (CONFIG.usarAlertaNativo) alert('Fase Concluída!');
  atualizarMostrador();

  // não há fim: depois das fases manuais, as fases procedurais continuam
  mostrarConclusao({
    titulo: 'Fase Concluída!',
    texto: `Você coletou todas as moedas. Prepare-se para: ${materializarNivel(indiceNivel + 1).nome}`,
    estatisticas: textoEstatisticas(r, tempo),
    proximo: 'Próxima Fase ▶',
    total: `Saldo 🪙 ${progresso.saldo} moedas`
  });
}

/** Linha da pontuação: passos, recorde, tempo, estrelas e moedas ganhas. */
function textoEstatisticas(r, tempo) {
  const recorde = r.primeira ? 'primeiro recorde!'
    : r.novoRecorde ? `novo recorde! (antes: ${r.recordeAnterior})`
    : `recorde: ${r.passosRecorde}`;
  const ganho = r.ganho ? ` · +${r.ganho} 🪙` : '';
  const meta = r.par === null || r.par === undefined ? '' : ` (meta ${r.par})`;
  return `Passos: ${r.passos}${meta} · ${recorde} · Tempo: ${tempo.toFixed(0)} s · ${textoEstrelas(r.estrelas)}${ganho}`;
}

/** Recomeça a fase: a tentativa é descartada e o total volta ao de antes da fase. */
function reiniciar() {
  carregarNivel(indiceNivel);
  avisar('Fase reiniciada ↺');
}

/** Avança para a próxima fase (a partir da última manual, vem a primeira procedural). */
function proximaFase() {
  carregarNivel(indiceNivel + 1);
  avisar(`Fase ${indiceNivel + 1}`);
}

document.getElementById('btn-reiniciar').addEventListener('click', reiniciar);
document.getElementById('btn-reiniciar-hud').addEventListener('click', reiniciar);
document.getElementById('btn-proxima').addEventListener('click', proximaFase);


/* ============================================================================
   8) TWEENS (animações com duração) E LOOP PRINCIPAL
   ============================================================================ */
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

function atualizarMoedas(dt, tempo) {
  for (const b of grade.lista) {
    if (!b.moeda) continue;
    b.moeda.rotation.y += dt * 2.4;                                    // gira
    b.moeda.position.y = 0.78 + Math.sin(tempo * 2.2 + b.faseMoeda) * 0.05; // flutua
  }
}

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


/* ============================================================================
   9) INÍCIO
   ============================================================================ */
atualizarBotaoSom(som.mudo);
// continua de onde o jogador parou: a primeira fase ainda não concluída
carregarNivel(Math.max(0, progresso.maiorConcluida() + 1));
requestAnimationFrame(animar);
window.__DIORAMA_PRONTO__ = true;   // usada pelo aviso de erro da CDN

// ganchos para os testes de ponta a ponta (só com ?debug na URL)
if (typeof location !== 'undefined' && location.search.includes('debug')) {
  window.__DIORAMA_DEBUG__ = {
    estado, CONFIG, progresso, som,
    indice: () => indiceNivel,
    grade: () => grade,
    /** posição do mundo -> pixel da tela (para os testes de toque) */
    projetar: (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
    }
  };
}
