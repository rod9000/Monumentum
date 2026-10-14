/* ============================================================================
   PROGRESSO SALVO NO NAVEGADOR — moedas, fases concluídas e recordes.

   Regras:
   - As moedas de uma tentativa só entram no total ao CONCLUIR a fase. Morrer
     (cair no vão), reiniciar ou sair da fase descarta as moedas da tentativa.
   - Cada fase conta suas moedas uma vez: refazer uma fase concluída não soma de novo.
   - Recorde por fase: menor número de passos (e menor tempo).
   - Estrelas (pela tentativa concluída), comparando com o PAR da fase (o menor
     número de passos para pegar todas as moedas, ver par.js):
       ⭐⭐⭐ menos que 1,25 × par (com par 20: até 24 passos);
       ⭐⭐   até 1,5 × par (com par 20: de 25 a 30 passos);
       ⭐     acima disso.
   ============================================================================ */

import { estrelasDoPar } from './par.js';
import { SKIN_PADRAO } from './skins.js';

const CHAVE = 'diorama-progresso-v2';

/** Completa um progresso lido do navegador (ou migrado): campos ausentes viram o padrão. */
function normalizar(d) {
  const skins = Array.isArray(d.skins) ? d.skins.filter(s => typeof s === 'string') : [];
  const possuidas = [...new Set([SKIN_PADRAO, ...skins])];
  return {
    total: Math.max(0, Math.floor(Number(d.total) || 0)),
    gasto: Math.max(0, Math.floor(Number(d.gasto) || 0)),
    fases: d.fases && typeof d.fases === 'object' ? d.fases : {},
    skins: possuidas,
    skinAtual: possuidas.includes(d.skinAtual) ? d.skinAtual : SKIN_PADRAO
  };
}

/** Texto de estrelas com 3 posições: ⭐⭐☆ */
export function textoEstrelas(n) {
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/** Cria o progresso. `armazenamento` pode ser trocado nos testes (qualquer objeto com getItem/setItem). */
export function criarProgresso(armazenamento = globalThis.localStorage) {
  let dados = carregar();

  function carregar() {
    let bruto = null;
    try { bruto = armazenamento?.getItem(CHAVE) ?? null; } catch { bruto = null; }
    if (bruto) {
      try {
        const d = JSON.parse(bruto);
        if (d && typeof d === 'object') return normalizar(d);
      } catch { /* dado corrompido: cai na migração */ }
    }
    return migrarVersaoAntiga();
  }

  /** Versão antiga: 'diorama-total-moedas' (total) e 'diorama-progresso' (fases 0..N-1 concluídas). */
  function migrarVersaoAntiga() {
    let total = 0, concluidasAte = 0;
    try {
      total = Number(armazenamento?.getItem('diorama-total-moedas')) || 0;
      concluidasAte = Number(armazenamento?.getItem('diorama-progresso')) || 0;
    } catch { /* sem dados antigos */ }
    const fases = {};
    // fases antigas: moedas desconhecidas, tratadas como já contadas (não rendem de novo)
    for (let i = 0; i < concluidasAte; i++) fases[i] = { moedas: 0, antigo: true, passos: null, tempo: null, estrelas: 0 };
    return normalizar({ total, fases });
  }

  function salvar() {
    try { armazenamento?.setItem(CHAVE, JSON.stringify(dados)); } catch { /* segue só nesta sessão */ }
  }

  const maiorConcluida = () => {
    const chaves = Object.keys(dados.fases).map(Number);
    return chaves.length ? Math.max(...chaves) : -1;
  };

  return {
    get total() { return dados.total; },
    /** Moedas disponíveis para gastar: o total ganho menos o que já foi usado em skins. */
    get saldo() { return Math.max(0, dados.total - dados.gasto); },
    get skinAtual() { return dados.skinAtual; },
    possui: id => dados.skins.includes(id),
    maiorConcluida,
    concluida: i => !!dados.fases[i],
    recorde: i => dados.fases[i] || null,
    /** Fase aberta: a primeira não concluída e tudo até a próxima depois da maior concluída. */
    aberta: i => i <= maiorConcluida() + 1,

    /** Conclui a fase `i` com a tentativa: devolve o que mudou. */
    concluir(i, { moedas, passos, tempo, par = null }) {
      const rec = dados.fases[i] || null;
      const moedasAntes = rec ? (rec.antigo ? Infinity : rec.moedas) : 0;
      const ganho = Number.isFinite(moedasAntes) ? Math.max(0, moedas - moedasAntes) : 0;
      dados.total += ganho;

      const recordeAnterior = rec && rec.passos !== null && rec.passos !== undefined ? rec.passos : null;
      const estrelas = estrelasDoPar(passos, par);
      const passosRecorde = recordeAnterior === null ? passos : Math.min(recordeAnterior, passos);
      const tempoRecorde = rec && rec.tempo !== null && rec.tempo !== undefined ? Math.min(rec.tempo, tempo) : tempo;

      dados.fases[i] = {
        moedas: Number.isFinite(moedasAntes) ? Math.max(moedasAntes, moedas) : moedas,
        antigo: false,
        passos: passosRecorde,
        tempo: tempoRecorde,
        estrelas: Math.max(rec ? rec.estrelas || 0 : 0, estrelas)
      };
      salvar();
      return {
        ganho,
        estrelas,
        par,
        passos,
        passosRecorde,
        recordeAnterior,
        novoRecorde: recordeAnterior !== null && passos < recordeAnterior,
        primeira: recordeAnterior === null
      };
    },

    /** Compra uma skin com o saldo e já a equipa. Devolve false se já a tem ou falta moeda. */
    comprar(id, preco) {
      if (dados.skins.includes(id) || preco > Math.max(0, dados.total - dados.gasto)) return false;
      dados.gasto += preco;
      dados.skins.push(id);
      dados.skinAtual = id;
      salvar();
      return true;
    },

    /** Equipa uma skin já comprada. */
    equipar(id) {
      if (!dados.skins.includes(id)) return false;
      dados.skinAtual = id;
      salvar();
      return true;
    }
  };
}
