/* ============================================================================
   SKINS DA BOLA — catálogo das aparências do personagem principal.
   Cada skin tem preço em moedas (coletadas e salvas no progresso). A primeira
   é a aparência inicial, de graça. Os olhos são iguais em todas.
   Campos: cor base, brilho próprio (emissiva), rugosidade, metal, padrão
   desenhado (ver padroes.js) e a cor usada nos detalhes do padrão.
   ============================================================================ */
export const SKIN_PADRAO = 'laranja';
export const PRECO_SKIN = 50;

export const SKINS = [
  { id: 'laranja',  nome: 'Laranja Clássica', preco: 0,          cor: '#ff7043', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .50, metalico: .05, padrao: 'liso',     detalhe: '#ffffff' },
  { id: 'oceano',   nome: 'Oceano',           preco: PRECO_SKIN, cor: '#1e88e5', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .35, metalico: .10, padrao: 'faixas',   detalhe: '#90caf9' },
  { id: 'floresta', nome: 'Floresta',         preco: PRECO_SKIN, cor: '#43a047', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .60, metalico: .00, padrao: 'bolinhas', detalhe: '#c5e1a5' },
  { id: 'cosmica',  nome: 'Cósmica',          preco: PRECO_SKIN, cor: '#7e57c2', emissiva: '#5e35b1', intensidadeEmissiva: .5,  rugosidade: .35, metalico: .20, padrao: 'bolinhas', detalhe: '#ffee58' },
  { id: 'dourada',  nome: 'Dourada',          preco: PRECO_SKIN, cor: '#ffb300', emissiva: '#8a5a00', intensidadeEmissiva: .35, rugosidade: .30, metalico: .50, padrao: 'gomos',    detalhe: '#fff3c4' },
  { id: 'gelo',     nome: 'Gelo',             preco: PRECO_SKIN, cor: '#00acc1', emissiva: '#006064', intensidadeEmissiva: .2,  rugosidade: .12, metalico: .05, padrao: 'xadrez',   detalhe: '#e0f7fa' }
];
