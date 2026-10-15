/* ============================================================================
   MENUS — menu de fases (com o desafio do dia), loja de skins, conquistas e
   revisão do tutorial. Só monta as telas; as regras ficam em fase/regras.
   ============================================================================ */
import { montarMenu } from './menu.js';
import { montarLoja } from './loja.js';
import { textoEstrelas } from './progresso.js';
import { SKINS } from './skins.js';
import { miniaturaDaSkin } from './aparencia.js';
import { CONFIG } from './config.js';
import { progresso, ultimaTentativa, informarIndice } from './sessao.js';
import { dataAtual } from './fase.js';
import { avisar } from './hud.js';
import { NIVEIS } from './dados/niveis.js';
import { nomeCurto, indiceNivel, carregarNivel, carregarPorDados, faixaDaFase, completarFaixasDoMenu } from './fase.js';
import { RECOMPENSA_DIARIA, desafioDoDia } from './diario.js';
import { CONQUISTAS } from './conquistas.js';
import { aplicarSkin } from './personagem.js';

const el = id => document.getElementById(id);
let painelAberto = null;                 // id do diálogo aberto (fecha os outros)

function abrirDialogo(id) {
  for (const p of ['menu-fases', 'painel-skins', 'painel-conquistas']) if (p !== id) el(p)?.classList.remove('visivel');
  painelAberto = id;
}

const menu = montarMenu({ onEscolher: item => { if (item.extra) jogarDesafioDoDia(); else carregarNivel(item.indice); } });
const loja = montarLoja({ onEscolher: escolherSkin });

/** Exibe um aviso na interface (usado pelas conquistas). */
const notificar = avisar;

/** Gancho do tutorial: preenchido pelo main.js (que possui a máquina de passos). */
let painelTutorial = null;
export function definirPainelTutorial(painel) { painelTutorial = painel; }

/* ---- loja ----------------------------------------------------------------- */
function itensLoja() {
  const saldo = progresso.saldo;
  return SKINS.map(s => {
    let estadoSkin = 'sem-saldo';
    if (progresso.possui(s.id)) estadoSkin = progresso.skinAtual === s.id ? 'equipada' : 'possui';
    else if (saldo >= s.preco) estadoSkin = 'comprar';
    return {
      id: s.id, nome: s.nome, cor: s.cor, miniatura: miniaturaDaSkin(s),
      preco: s.preco, estado: estadoSkin, faltam: Math.max(0, s.preco - saldo)
    };
  });
}

function escolherSkin(id) {
  const s = SKINS.find(x => x.id === id);
  if (progresso.possui(id)) {
    progresso.equipar(id);
    notificar(`Skin ${s.nome} equipada`);
  } else if (progresso.comprar(id, s.preco)) {
    notificar(`🎨 Skin ${s.nome} comprada e equipada!`);
  } else {
    notificar(`Faltam ${s.preco - progresso.saldo} 🪙 para ${s.nome}`);
  }
  aplicarSkin(progresso.skinAtual);
  loja.abrir(itensLoja(), progresso.saldo);
}

/* ---- conquistas ----------------------------------------------------------- */
function itensConquistas() {
  return CONQUISTAS.map(c => ({
    id: c.id,
    nome: c.nome,
    quanto: c.quanto,
    tem: progresso.conquista(c.id)
  }));
}

function mostrarConquistas() {
  abrirDialogo('painel-conquistas');
  const painel = el('painel-conquistas');
  let gradeEl = el('grade-conquistas');
  if (!gradeEl) {
    gradeEl = document.createElement('div');
    gradeEl.id = 'grade-conquistas';
    painel.querySelector('div')?.appendChild(gradeEl);
  }
  gradeEl.textContent = '';
  for (const c of itensConquistas()) {
    const b = document.createElement('div');
    b.className = c.tem ? 'conquista-feita' : 'conquista-falta';
    b.textContent = c.tem ? '🏆 ' : '🔒 ';
    const forte = document.createElement('strong');
    forte.textContent = c.nome;
    b.appendChild(forte);
    const p = document.createElement('small');
    p.textContent = c.quanto;
    b.appendChild(p);
    gradeEl.appendChild(b);
  }
  el('painel-conquistas')?.classList.add('visivel');
  setTimeout(() => {
    const feitas = el('grade-conquistas');
    if (feitas) feitas.firstElementChild?.focus?.();
  }, 0);
}

/* ---- desafio do dia ------------------------------------------------------- */
function itemDoDia() {
  return {
    extra: true,
    indice: -1,
    nome: 'Desafio do dia',
    estado: 'desafio',
    recompensa: progresso.recompensaDoDia(dataAtual()) ? 'recompensa coletada' : `+${RECOMPENSA_DIARIA} 🪙`
  };
}

/** Começa o desafio do dia (gera a fase da data e carrega os dados). */
export function jogarDesafioDoDia() {
  const dados = desafioDoDia(dataAtual());
  if (!dados) { notificar('Não foi possível gerar o desafio de hoje 😕'); return; }
  informarIndice(-1, dados);
  carregarPorDados(dados);
  notificar(`📅 Desafio do dia — ${dataAtual()}`);
}

/** Itens do menu: as fases abertas/concluídas e o desafio do dia. */
export function itensDoMenu() {
  const maior = progresso.maiorConcluida();
  const fim = Math.max(indiceNivel, maior + 1) + 2;
  const itens = [itemDoDia()];
  for (let i = 0; i <= fim; i++) {
    const rec = progresso.recorde(i);
    let estadoFase = 'travada';
    if (progresso.concluida(i)) estadoFase = 'concluida';
    else if (i === indiceNivel) estadoFase = 'atual';
    else if (progresso.aberta(i)) estadoFase = 'aberta';
    itens.push({
      indice: i,
      nome: nomeCurto(i),
      estado: estadoFase,
      estrelas: rec ? rec.estrelas : 0,
      dificuldade: faixaDaFase(i)
    });
  }
  return itens;
}

function abrirMenu() {
  abrirDialogo('menu-fases');
  const itens = itensDoMenu();
  menu.abrir(itens, item => {
    if (item.extra) jogarDesafioDoDia();
    else carregarNivel(item.indice);
  });
  completarFaixasDoMenu(itens.filter(i => !i.extra).map(i => i.indice), (i, faixa) => menu.atualizarDificuldade(i, faixa));
}

/** Liga os botões do HUD/menu (chamado uma vez, pelo main.js). */
export function ligarBotoes() {
  el('btn-menu')?.addEventListener('click', abrirMenu);
  el('btn-skins')?.addEventListener('click', () => {
    abrirDialogo('painel-skins');
    loja.abrir(itensLoja(), progresso.saldo);
  });
  el('btn-conquistas')?.addEventListener('click', mostrarConquistas);
  el('btn-diario')?.addEventListener('click', jogarDesafioDoDia);
  el('btn-tutorial')?.addEventListener('click', () => reiniciarTutorial(progresso));
  el('btn-reiniciar-hud')?.addEventListener('click', () => import('./regras.js').then(m => m.reiniciar()));
  el('btn-proxima')?.addEventListener('click', () => import('./regras.js').then(m => m.proximaFase()));
}

/** Painel do tutorial: criado pelo main.js e guardado para as fases. */
export function criarPainelTutorial() {
  return criarTutorial({
    aoEvento: () => {},
    aoConcluirPassos: passos => progresso.marcarTutorialVisto(indiceNivel, passos)
  });
}

export { itemDoDia, itensConquistas };
