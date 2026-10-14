/* ============================================================================
   APARÊNCIA DAS SKINS — aplica a skin ao material da bola (cor, brilho, metal
   e padrão) e gera a miniatura 3D que a loja mostra. O desenho do padrão fica
   em padroes.js; aqui só fica a ponte com o Three.js.
   ============================================================================ */
import * as THREE from 'three';
import { desenharPadrao } from './padroes.js';

const texturas = new Map();     // id da skin -> CanvasTexture (ou null se não há padrão)

/** Textura do padrão da skin (feita uma vez por skin). null quando a skin é lisa. */
function texturaDoPadrao(s) {
  if (s.padrao === 'liso' || typeof document === 'undefined') return null;
  if (!texturas.has(s.id)) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;        // sem canvas 2D (ambiente de teste): cai para a cor lisa
    desenharPadrao(ctx, canvas.width, canvas.height, s);
    texturas.set(s.id, new THREE.CanvasTexture(canvas));
  }
  return texturas.get(s.id) ?? null;
}

/** Aplica a skin ao material da bola. Com padrão, a cor fica branca: o desenho já traz as cores. */
export function aplicarAparencia(material, s) {
  const textura = texturaDoPadrao(s);
  material.color.set(textura ? '#ffffff' : s.cor);
  material.map = textura;
  material.emissive.set(s.emissiva);
  material.emissiveIntensity = s.intensidadeEmissiva;
  material.roughness = s.rugosidade;
  material.metalness = s.metalico;
  material.needsUpdate = true;
}

let miniatura = null;           // renderizador e cena da miniatura (criados na primeira vez)
const imagens = new Map();      // id da skin -> PNG em data URL (ou null)

function criarMiniatura() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const renderizador = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderizador.setSize(128, 128, false);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0.35, 3.2);
  const luz = new THREE.DirectionalLight(0xffffff, 2.2);
  luz.position.set(2, 3, 4);
  cena.add(luz);
  cena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const bola = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cena.add(bola);
  return { canvas, renderizador, cena, camera, bola };
}

/** Miniatura 3D da skin como PNG (data URL), para a loja. null se o navegador não conseguir desenhar. */
export function miniaturaDaSkin(s) {
  if (imagens.has(s.id)) return imagens.get(s.id);
  let url = null;
  try {
    miniatura ??= criarMiniatura();
    aplicarAparencia(miniatura.bola.material, s);
    miniatura.renderizador.render(miniatura.cena, miniatura.camera);
    url = miniatura.canvas.toDataURL('image/png');
  } catch {
    url = null;                 // sem WebGL: a loja mostra a bolinha de cor
  }
  imagens.set(s.id, url);
  return url;
}
