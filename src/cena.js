/* ============================================================================
   CENA 3D — renderer, câmera ortográfica isométrica, luzes e materiais
   (visual de diorama). Não conhece as regras do jogo.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { estado } from './estado.js';

export const canvas = document.getElementById('palco');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;                       // sombras ativadas
renderer.shadowMap.type = THREE.PCFSoftShadowMap;        // sombra suave

export const cena = new THREE.Scene();
cena.background = new THREE.Color(0xbfe3f2);             // céu clarinho

/* ---- CÂMERA ISOMÉTRICA ----------------------------------------------------
   OrthographicCamera = sem perspectiva: todos os blocos têm o MESMO tamanho
   na tela, independentemente da distância (isometria perfeita).
   A câmera orbita o centro do nível a um raio fixo, com a elevação clássica
   de 35,26° (arctg(1/√2)) — o ângulo isométrico "verdadeiro".            */
export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const ELEVACAO = Math.atan(1 / Math.sqrt(2));   // ≈ 35,26°
const RAIO_ORBITA = 90;                         // distância fictícia da órbita

export const alvoCentro = new THREE.Vector3();  // centro do diorama na tela
export const enquadramento = { raio: 5 };       // raio do diorama (enquadramento automático)

/* ---- LUZES ---------------------------------------------------------------
   Ambiente: lá de cima e de baixo (aspecto cartoon, sem sombra dura).
   Direcional: o "sol", com Shadow Map.                                */
const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.55);

export const luzSol = new THREE.DirectionalLight(0xfff3dd, 1.55);
luzSol.castShadow = true;
luzSol.shadow.mapSize.set(2048, 2048);
luzSol.shadow.bias = -0.0007;          // evita "shadow acne"
luzSol.shadow.normalBias = 0.02;

const luzPreenchimento = new THREE.DirectionalLight(0xcfe2ff, 0.35);
luzPreenchimento.position.set(-8, 5, -6);

cena.add(luzAmbiente, luzSol, luzSol.target, luzPreenchimento);


/* ---- MATERIAIS E GEOMETRIAS COMPARTILHADOS -------------------------------- */
export const GEO_BLOCO = new THREE.BoxGeometry(1, 1, 1);
export const GEO_MOEDA = new THREE.CylinderGeometry(0.30, 0.30, 0.07, 28);
GEO_MOEDA.rotateX(Math.PI / 2);        // moeda "em pé", girando no eixo Y

export const GEO_PLACA = new THREE.BoxGeometry(0.9, 0.06, 0.9); // placa fina (ponte de câmera)
export const GEO_MARCADOR = new THREE.BoxGeometry(0.46, 0.04, 0.46);      // marcador de pulo: quadrado...
export const GEO_ANEL_MARCADOR = new THREE.RingGeometry(0.1, 0.16, 24);   // ...com um círculo dentro

// BORDA de cada bloco: arestas do cubo (LineSegments é filho do tile, então
// não interfere no raycast, que não é recursivo)
export const GEO_BORDAS = new THREE.EdgesGeometry(GEO_BLOCO);
export const MATERIAL_BORDA = new THREE.LineBasicMaterial({
  color: 0x1c2b1c, transparent: true, opacity: .38
});
MATERIAL_BORDA.userData.compartilhado = true;

function padrao(corTopo, corLado, extra = {}) {
  const cima  = new THREE.MeshStandardMaterial({ color: corTopo, roughness: .9,  metalness: 0, ...extra });
  const lados = new THREE.MeshStandardMaterial({ color: corLado, roughness: .95, metalness: 0, ...extra });
  // Ordem das faces do BoxGeometry: +X, -X, +Y(topo), -Y, +Z, -Z
  return [lados, lados, cima, lados, lados, lados];
}

export const MATERIAL = {
  chao:   padrao(0x8ed679, 0x6aa84f),
  parede: padrao(0xe8845f, 0xb8553a),
  moeda:  padrao(0xffd34d, 0xd9a020, { emissive: 0x7a5c00, emissiveIntensity: .5 }),
  spawn:  padrao(0x9fd9f2, 0x62a8cc),
  elevador: padrao(0xd7dee6, 0x7f8c9b, { emissive: 0x20303c, emissiveIntensity: .35 })
};
for (const k in MATERIAL) MATERIAL[k].forEach(m => (m.userData.compartilhado = true));

export function materialMoedaBrilhante() {
  return new THREE.MeshStandardMaterial({
    color: 0xffd34d, emissive: 0xffc400, emissiveIntensity: .45,
    metalness: .6, roughness: .25, transparent: true
  });
}

/** Destaque do bloco sob o dedo ou o mouse. */
export const destaque = new THREE.Mesh(
  new THREE.BoxGeometry(1.05, 1.05, 1.05),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25, depthWrite: false })
);
destaque.visible = false;
destaque.renderOrder = 2;
cena.add(destaque);


/* ---- CONTROLE DE CÂMERA (órbita interpolada e enquadramento) -------------- */
export function atualizarCamera(dt) {
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
    O zoom (roda do mouse / botões / pinça) só aperta ou afasta esse enquadramento. */
export function atualizarEnquadramento() {
  const aspecto = window.innerWidth / window.innerHeight;
  const necessario = 2 * enquadramento.raio * CONFIG.margemCamera / CONFIG.zoom;
  const altura = aspecto < 1 ? necessario / aspecto : necessario;

  camera.top = altura / 2;
  camera.bottom = -altura / 2;
  camera.left = -altura * aspecto / 2;
  camera.right = altura * aspecto / 2;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  atualizarEnquadramento();
});
