/* ============================================================================
   SKINS DA BOLA — catálogo das aparências do personagem principal.
   Cada skin tem preço em moedas (coletadas e salvas no progresso). A primeira
   é a aparência inicial, de graça. Os olhos são iguais em todas.
   Campos do material: cor, brilho próprio (emissiva), rugosidade e metal.
   ============================================================================ */
export const SKIN_PADRAO = 'laranja';
export const PRECO_SKIN = 50;

export const SKINS = [
  { id: 'laranja',  nome: 'Laranja Clássica', preco: 0,          cor: '#ff7043', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .50, metalico: .05 },
  { id: 'oceano',   nome: 'Oceano',           preco: PRECO_SKIN, cor: '#1e88e5', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .35, metalico: .10 },
  { id: 'floresta', nome: 'Floresta',         preco: PRECO_SKIN, cor: '#43a047', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .60, metalico: .00 },
  { id: 'cosmica',  nome: 'Cósmica',          preco: PRECO_SKIN, cor: '#7e57c2', emissiva: '#5e35b1', intensidadeEmissiva: .5,  rugosidade: .35, metalico: .20 },
  { id: 'dourada',  nome: 'Dourada',          preco: PRECO_SKIN, cor: '#ffb300', emissiva: '#8a5a00', intensidadeEmissiva: .35, rugosidade: .30, metalico: .50 },
  { id: 'gelo',     nome: 'Gelo',             preco: PRECO_SKIN, cor: '#b3e5fc', emissiva: '#000000', intensidadeEmissiva: 0,   rugosidade: .12, metalico: .05 }
];
