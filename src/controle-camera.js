/* ============================================================================
   CONTROLE DE CÂMERA — giro em passos de 90° e zoom (teclado, botões e toque).
   ============================================================================ */
import { CONFIG } from './config.js';
import { atualizarEnquadramento } from './cena.js';
import { estado } from './estado.js';
import { som } from './sessao.js';
import { avisar } from './hud.js';

export function girar(direcao) {                 // -1 = esquerda, +1 = direita
  estado.giroAlvo += direcao * Math.PI / 2;
  som.tocar('giro');
}

/** Aproxima/afasta a câmera sem sair dos limites. */
export function ajustarZoom(fator, silencioso = false) {
  CONFIG.zoom = Math.min(CONFIG.zoomMax, Math.max(CONFIG.zoomMin, CONFIG.zoom * fator));
  atualizarEnquadramento();
  if (!silencioso) avisar(`Zoom ${Math.round(CONFIG.zoom * 100)}%`);
}
