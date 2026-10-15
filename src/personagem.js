/* ============================================================================
   PERSONAGEM — a bola: malha, olhos, skin, posição sobre um bloco e rotação.
   ============================================================================ */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { cena, camera } from './cena.js';
import { estado } from './estado.js';
import { SKINS } from './skins.js';
import { aplicarAparencia } from './aparencia.js';

export const RAIO_PERSONAGEM = 0.30;

export const personagem = new THREE.Group();
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

/** Pinta a bola com a skin escolhida (cor, brilho, metal e padrão). Os olhos não mudam. */
export function aplicarSkin(id) {
  const s = SKINS.find(x => x.id === id) || SKINS[0];
  aplicarAparencia(corpo.material, s);
}

/** Posição mundial (centro do personagem) em cima de um bloco. */
export function posicaoNoBloco(b) {
  return new THREE.Vector3(b.x, b.y + 0.5 + RAIO_PERSONAGEM + 0.02, b.z);
}

/* ---- rotação (encara o destino; parado, mantém a direção do último passo) ---- */
export function girarPersonagemPara(dx, dz) {
  if (dx || dz) rotacaoPersonagemAlvo = Math.atan2(dx, dz);
}

export function atualizarRotacaoPersonagem(dt) {
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
