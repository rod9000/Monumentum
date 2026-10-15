/* ============================================================================
   PROGRESSO SALVO NO NAVEGADOR — moedas, fases concluídas, recordes, quedas,
   usos das mecânicas, conquistas, desafios do dia e tutorial.

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
import { verificarConquistas } from './conquistas.js';

const CHAVE = 'diorama-progresso-v2';

/** Completa um progresso lido do navegador (ou migrado): campos ausentes viram o padrão. */
function normalizar(d) {
  const fases = d?.fases && typeof d.fases === 'object' ? d.fases : {};
  const quedas = d?.quedas && typeof d.quedas === 'object' ? d.quedas : {};
  const usos = d?.usos && typeof d.usos === 'object' ? d.usos : {};
  const diarios = d?.diarios && typeof d.diarios === 'object' ? d.diarios : {};
  const skins = Array.isArray(d?.skins) ? d.skins.filter(s => typeof s === 'string') : [];
  const possuidas = [...new Set([SKIN_PADRAO, ...skins])];
  const total = Math.max(0, Math.floor(Number(d?.total) || 0));
  const gasto = Math.min(Math.max(0, Math.floor(Number(d?.gasto) || 0)), total);
  return {
    total,
    gasto,
    fases,
    quedas,
    usos,
    diarios,
    conquistas: Array.isArray(d?.conquistas) ? d.conquistas.filter(s => typeof s === 'string') : [],
    tutorial: d?.tutorial && typeof d.tutorial === 'object' ? d.tutorial : {},
    skins: possuidas,
    skinAtual: possuidas.includes(d?.skinAtual) ? d.skinAtual : SKIN_PADRAO
  };
}

/** Texto de estrelas com 3 posições: ⭐⭐☆ */
export function textoEstrelas(n) {
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/**
 * Cria o progresso. `armazenamento` pode ser trocado nos testes (qualquer objeto
 * com getItem/setItem) e `agora` devolve a data de hoje (String 'aaaa-mm-dd')
 * para as regras dos desafios diários.
 */
export function criarProgresso(armazenamento = globalThis.localStorage, agora = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}) {
  let dados = carregar();
  const aoConquista = [];

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

  /** Registra uma conquista nova (devolve a lista das que passaram a valer). */
  function conceder(ids) {
    const novas = [];
    for (const id of ids) {
      if (dados.conquistas.includes(id)) continue;
      dados.conquistas.push(id);
      novas.push(id);
    }
    if (novas.length) { salvar(); aoConquista.forEach(f => f(novas)); }
    return novas;
  }

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
      // uma fase concluída sem quedas contabilizadas não rende conquista "sem cair" jogada
      if (dados.quedas[i] === undefined && i >= 0) dados.quedas[i] = dados.quedas[i] ?? 0;
      salvar();

      const r = {
        ganho,
        estrelas,
        par,
        passos,
        passosRecorde,
        recordeAnterior,
        novoRecorde: recordeAnterior !== null && passos < recordeAnterior,
        primeira: recordeAnterior === null
      };
      if (i >= 0) r.novasConquistas = conceder(verificarConquistas(estadoParaConquistas(i)));
      return r;
    },

    /** Compra uma skin com o saldo e já a equipa. Devolve false se já a tem ou falta moeda. */
    comprar(id, preco) {
      if (dados.skins.includes(id) || preco > Math.max(0, dados.total - dados.gasto)) return false;
      dados.gasto += preco;
      dados.skins.push(id);
      dados.skinAtual = id;
      salvar();
      conceder(verificarConquistas(estadoParaConquistas(-1)));
      return true;
    },

    /** Equipa uma skin já comprada. */
    equipar(id) {
      if (!dados.skins.includes(id)) return false;
      dados.skinAtual = id;
      salvar();
      return true;
    },

    /* ---- quedas e usos das mecânicas (conquistas) ---- */

    /** Conta uma queda do personagem em uma fase (ou -1: desafio do dia). */
    contarQueda(indice, n = 1) {
      if (indice === null || indice === undefined || indice < 0) return;
      dados.quedas[indice] = (Number(dados.quedas[indice]) || 0) + n;
      salvar();
    },

    quedas: indice => Number(dados.quedas[indice]) || 0,

    /** Marca que a mecânica `nome` foi usada na fase `indice` ('pulo', 'elevador',
        'ponte', 'portal', 'girar'...). */
    registrarUso(indice, nome) {
      if (indice === null || indice === undefined || indice < 0) return;
      const m = dados.usos[indice] && typeof dados.usos[indice] === 'object' ? dados.usos[indice] : {};
      m[nome] = true;
      dados.usos[indice] = m;
      salvar();
    },

    usos: indice => dados.usos[indice] || {},

    /* ---- desafio do dia ---- */

    /** Registra a conclusão do desafio do dia: paga a recompensa uma única vez. */
    concluirDesafioDoDia(dataISO, recompensa) {
      dados.diarios[dataISO] = true;
      dados.total += recompensa;
      salvar();
      const novas = conceder(verificarConquistas(estadoParaConquistas(), -1));
      return { ganho: recompensa, novas };
    },

    /** Data de hoje ('aaaa-mm-dd', fuso local). */
    hoje: agora,

    /** Dias seguidos de desafio concluído (hoje entrando na conta). */
    sequenciaDoDia(dataISO) {
      const dias = Object.keys(dados.diarios).filter(Boolean);
      let seg = 0;
      const d = new Date(`${dataISO}T00:00:00`);
      for (;;) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dias.includes(k)) break;
        seg++;
        d.setDate(d.getDate() - 1);
      }
      return seg;
    },

    /* ---- conquistas ---- */

    conquistas: () => [...dados.conquistas],
    conquista: id => dados.conquistas.includes(id),

    /** Registra um "ouvinte" avisado quando uma conquista é desbloqueada. */
    aoDesbloquearConquista(f) { aoConquista.push(f); },

    /* ---- tutorial ---- */

    /** Passos do tutorial já mostrados por fase ([0,1] = em andamento). */
    tutorialVisto: indice => dados.tutorial[indice] ?? 0,
    /** Marca o tutorial da fase como visto (0 = todo). */
    marcarTutorialVisto(indice, passos) {
      dados.tutorial[indice] = passos;
      salvar();
    },

    estadoParaConquistas
  };

  /** Foto do estado usada pelas regras das conquistas. */
  function estadoParaConquistas(indiceConcluida = -1) {
    return {
      fasesConcluidas: Object.keys(dados.fases).length,
      total: dados.total,      quedas: { ...dados.quedas },
      usos: { ...dados.usos },
      tresEstrelas: Object.values(dados.fases).filter(f => (f.estrelas || 0) >= 3).length,
      sequenciaDoDia: sequenciaDoDia(),
      skinsCompradas: dados.skins.length - 1,
      conquistas: [...dados.conquistas]
    };
  }

  /** Dias seguidos de desafio concluído, contando com a data de hoje. */
  function sequenciaDoDia() {
    let seg = 0;
    const d = new Date(`${agora()}T00:00:00`);
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!dados.diarios[k]) break;
      seg++;
      d.setDate(d.getDate() - 1);
    }
    return seg;
  }
}
