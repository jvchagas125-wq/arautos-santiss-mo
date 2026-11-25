// Painel administrativo: "Inscrições de cursos" — cadastro dos cursos/eventos (com formulário próprio),
// CRM dos inscritos (lista por curso, WhatsApp, e-mail, exportação) e quadro de avisos por curso.
import {
  mostrarToast, abrirModal, fecharModal, formatarDataBR, linkificarTexto, aoAbrirPaginaUmaVez
} from "./utils.js";
import {
  ouvirCursos, salvarCurso, alterarAberturaDoCurso, excluirCurso,
  ouvirTodasInscricoes, excluirInscricao, salvarInscricao, ouvirInscricoesIniciadas, excluirInscricaoIniciada, obterConfigEnvioIntencoes, salvarEmailsInscritos, ouvirTodosAvisosDosCursos, criarAvisoDoCurso, criarAvisoGeral, excluirAvisoDoCurso
} from "./dados.js";
import {
  CAMPOS_PADRAO, TIPOS_PERGUNTA, TIPOS_COM_OPCOES, perguntaTemOpcoes, opcoesDaPergunta, normalizarCurso, novoIdCurto,
  estadoInscricoes, rotuloDataHora, tabelaDeInscritos, formatarTelefone, numeroWhatsApp, emailsDosInscritos, emailsParaAvisos, emailsQueAceitaramContato, inscritosParaAvisos, emailValido, valorComoTexto, dataParaTexto
} from "./cursos-comum.js";
import { exportarInscritos } from "./exportar-inscritos.js";
import { criarSeletorDataHora } from "./seletor-data-hora.js";
import { criarEditorMensagem, mensagemParaPessoa } from "./campanhas-admin.js";
import { montarFormularioDeInscricaoNoPainel } from "./inscrever-admin.js";

const ICONE_SETA = '<svg class="quadro-intencao__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const ICONE_LAPIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>';
const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>';
const ICONE_ZAP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 0 0-8.47 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.03.8.81-2.95-.2-.31a8.2 8.2 0 1 1 6.9 3.78Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.12-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.56.67 2.17.73 2.95.61.48-.07 1.46-.6 1.67-1.17.2-.58.2-1.07.14-1.17-.06-.1-.23-.16-.48-.28Z"/></svg>';
const ICONE_EMAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}
function botaoIcone(classe, titulo, svg) {
  const b = criar("button", `quadro-intencao__${classe}`);
  b.type = "button";
  b.title = titulo;
  b.setAttribute("aria-label", titulo);
  b.innerHTML = svg;
  return b;
}
const semAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dataDoMs = (ms) => (ms ? formatarDataBR(new Date(ms).toISOString().slice(0, 10)) : "");

// painel (cabeçalho clicável + corpo oculto)
function ligarAcordeao(idCabecalho, idCorpo) {
  const cab = document.getElementById(idCabecalho);
  const corpo = document.getElementById(idCorpo);
  const alternar = () => {
    const abrir = corpo.classList.contains("oculto");
    corpo.classList.toggle("oculto", !abrir);
    cab.classList.toggle("recolhido", !abrir);
    cab.setAttribute("aria-expanded", String(abrir));
  };
  cab.addEventListener("click", alternar);
  cab.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } });
}

// quadro (lista fechada) com cabeçalho clicável; devolve { quadro, cabecalho, corpo }
function criarQuadro(titulo, abertoInicial, onAlternar) {
  const quadro = criar("div", "quadro-intencao" + (abertoInicial ? " aberto" : ""));
  const cabecalho = criar("div", "quadro-intencao__cabecalho");
  cabecalho.setAttribute("role", "button");
  cabecalho.tabIndex = 0;
  cabecalho.innerHTML = ICONE_SETA;
  const t = criar("span", "quadro-intencao__titulo");
  t.append(titulo);
  cabecalho.appendChild(t);
  const corpo = criar("div", "quadro-intencao__corpo" + (abertoInicial ? "" : " oculto"));
  const alternar = () => {
    const abrir = corpo.classList.contains("oculto");
    corpo.classList.toggle("oculto", !abrir);
    quadro.classList.toggle("aberto", abrir);
    if (onAlternar) onAlternar(abrir);
  };
  cabecalho.addEventListener("click", alternar);
  cabecalho.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === cabecalho) { e.preventDefault(); alternar(); } });
  quadro.append(cabecalho, corpo);
  return { quadro, cabecalho, corpo, titulo: t };
}

export function iniciarCursosAdmin({ enviarImagem, chamarApiEnvio, podeAvisar = () => true }) {
  ["Cursos", "Inscritos", "AvisosCursos"].forEach((n) => ligarAcordeao(`cabecalho${n}`, `corpo${n}`));

  let cursos = [];
  let inscricoes = [];
  let avisos = [];
  let iniciadas = []; // começaram a preencher a inscrição e não enviaram
  const abertosCursos = new Set();   // quadros da lista de cursos
  const abertosCrm = new Set();      // quadros do CRM
  const abertosPessoas = new Set();  // pessoas abertas no CRM
  const abertosAvisos = new Set();   // quadros de avisos
  const abertosIniciadas = new Set(); // quadros "iniciaram e não concluíram"
  const buscaCrm = new Map();        // cursoId -> texto da busca

  /* ---------- confirmação genérica ---------- */
  const modalConfirma = document.getElementById("modalConfirmaCursos");
  let aoConfirmar = null;
  function pedirConfirmacao({ titulo, texto, botao = "Apagar", acao }) {
    document.getElementById("tituloConfirmaCursos").textContent = titulo;
    document.getElementById("textoConfirmaCursos").textContent = texto;
    document.getElementById("btnOkConfirmaCursos").textContent = botao;
    aoConfirmar = acao;
    abrirModal(modalConfirma);
  }
  const fecharConfirma = () => { fecharModal(modalConfirma); aoConfirmar = null; };
  document.getElementById("fecharModalConfirmaCursos").addEventListener("click", fecharConfirma);
  document.getElementById("btnVoltarConfirmaCursos").addEventListener("click", fecharConfirma);
  document.getElementById("btnOkConfirmaCursos").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const acao = aoConfirmar;
    if (!acao) return;
    btn.disabled = true;
    try { await acao(); fecharConfirma(); } catch (err) { console.error(err); mostrarToast("Não foi possível concluir. Tente novamente."); }
    finally { btn.disabled = false; }
  });

  /* =====================================================================================
     1) Cursos e eventos — lista + editor
     ===================================================================================== */
  const modalCurso = document.getElementById("modalCurso");
  const campoNome = document.getElementById("cursoNome");
  const campoObs = document.getElementById("cursoObservacoes");
  const campoAtivo = document.getElementById("cursoAtivo");
  const previewImagem = document.getElementById("cursoImagemPreview");
  const arquivoImagem = document.getElementById("cursoImagemArquivo");
  const btnRemoverImagem = document.getElementById("btnCursoRemoverImagem");
  const caixaCamposPadrao = document.getElementById("cursoCamposPadrao");
  const caixaPerguntas = document.getElementById("cursoPerguntas");

  const campoAceite = document.getElementById("cursoPedirAceite");
  const campoAbreEm = document.getElementById("cursoAbreEm");
  const campoFechaEm = document.getElementById("cursoFechaEm");
  criarSeletorDataHora(campoAbreEm);
  criarSeletorDataHora(campoFechaEm);
  let edicao = null; // { id, ordem, imagemUrl, novaImagem: File|null, campos, perguntas, pedirAceiteContato }

  function cursoVazio() {
    return {
      id: null, ordem: 0, imagemUrl: "", novaImagem: null, pedirAceiteContato: false,
      campos: Object.fromEntries(CAMPOS_PADRAO.map(({ chave }) => [chave, { ativo: chave === "email" || chave === "telefone", obrigatorio: false }])),
      perguntas: []
    };
  }

  function mostrarImagemEditor() {
    const url = edicao.novaImagem ? URL.createObjectURL(edicao.novaImagem) : edicao.imagemUrl;
    previewImagem.classList.toggle("oculto", !url);
    if (url) previewImagem.src = url;
    btnRemoverImagem.classList.toggle("oculto", !url);
    document.getElementById("btnCursoEscolherImagem").textContent = url ? "Trocar imagem" : "Escolher imagem";
  }

  function desenharCamposPadrao() {
    caixaCamposPadrao.innerHTML = "";
    const fixo = criar("div", "curso-campo-padrao");
    fixo.innerHTML = '<span class="curso-campo-padrao__nome">Nome completo</span><span class="curso-campo-padrao__fixo">sempre pedido</span>';
    caixaCamposPadrao.appendChild(fixo);
    CAMPOS_PADRAO.forEach(({ chave, rotulo }) => {
      const cfg = edicao.campos[chave];
      // com o aceite de e-mail ligado, o campo E-mail precisa ser pedido
      const emailFixo = chave === "email" && edicao.pedirAceiteContato;
      if (emailFixo) cfg.ativo = true;
      const linha = criar("div", "curso-campo-padrao");
      const pedir = criar("label", "curso-campo-padrao__nome");
      const cbPedir = document.createElement("input");
      cbPedir.type = "checkbox";
      cbPedir.checked = cfg.ativo;
      cbPedir.disabled = emailFixo;
      pedir.append(cbPedir, document.createTextNode(" " + rotulo));
      if (emailFixo) pedir.append(criar("small", "curso-campo-padrao__fixo curso-campo-padrao__fixo--nota", "  (necessário para o aceite de e-mail)"));
      const obrig = criar("label", "curso-campo-padrao__obrig");
      const cbObrig = document.createElement("input");
      cbObrig.type = "checkbox";
      cbObrig.checked = cfg.obrigatorio;
      cbObrig.disabled = !cfg.ativo;
      obrig.append(cbObrig, document.createTextNode(" obrigatório"));
      obrig.classList.toggle("desativado", !cfg.ativo);
      cbPedir.addEventListener("change", () => {
        cfg.ativo = cbPedir.checked;
        if (!cfg.ativo) cfg.obrigatorio = false;
        cbObrig.disabled = !cfg.ativo;
        cbObrig.checked = cfg.obrigatorio;
        obrig.classList.toggle("desativado", !cfg.ativo);
      });
      cbObrig.addEventListener("change", () => { cfg.obrigatorio = cbObrig.checked; });
      linha.append(pedir, obrig);
      caixaCamposPadrao.appendChild(linha);
    });
  }

  // perguntas que dependem (direta ou indiretamente) da pergunta de índice i
  function dependentes(i) {
    const ids = new Set([edicao.perguntas[i].id]);
    const lista = [];
    edicao.perguntas.forEach((q, j) => {
      if (j > i && q.condicao && ids.has(q.condicao.perguntaId)) { ids.add(q.id); lista.push(j); }
    });
    return lista;
  }
  function profundidade(q) {
    let n = 0;
    let atual = q;
    while (atual && atual.condicao && n < 6) {
      atual = edicao.perguntas.find((x) => x.id === atual.condicao.perguntaId);
      n++;
    }
    return n;
  }

  function desenharPerguntas() {
    caixaPerguntas.innerHTML = "";
    if (!edicao.perguntas.length) {
      caixaPerguntas.appendChild(criar("p", "curso-vazio", "Nenhuma pergunta ainda — só os dados acima serão pedidos."));
    }
    edicao.perguntas.forEach((q, i) => {
      const cartao = criar("div", "curso-pergunta-adm");
      cartao.style.marginLeft = `${profundidade(q) * 16}px`;
      if (q.condicao) cartao.classList.add("curso-pergunta-adm--extra");

      const topo = criar("div", "curso-pergunta-adm__topo");
      topo.appendChild(criar("span", "curso-pergunta-adm__num", q.condicao ? "Pergunta extra" : `Pergunta ${edicao.perguntas.filter((x, j) => j <= i && !x.condicao).length}`));
      const acoes = criar("span", "curso-pergunta-adm__acoes");
      const subir = criar("button", "curso-mini-btn", "↑"); subir.type = "button"; subir.title = "Subir";
      const descer = criar("button", "curso-mini-btn", "↓"); descer.type = "button"; descer.title = "Descer";
      const apagar = criar("button", "curso-mini-btn curso-mini-btn--apagar", "Remover"); apagar.type = "button";
      subir.disabled = i === 0;
      descer.disabled = i === edicao.perguntas.length - 1;
      subir.addEventListener("click", () => {
        if (q.condicao && edicao.perguntas[i - 1].id === q.condicao.perguntaId) { mostrarToast("Esta pergunta extra precisa ficar abaixo da pergunta que a abre."); return; }
        [edicao.perguntas[i - 1], edicao.perguntas[i]] = [edicao.perguntas[i], edicao.perguntas[i - 1]];
        desenharPerguntas();
      });
      descer.addEventListener("click", () => {
        const prox = edicao.perguntas[i + 1];
        if (prox.condicao && prox.condicao.perguntaId === q.id) { mostrarToast("A pergunta extra precisa ficar abaixo desta."); return; }
        [edicao.perguntas[i + 1], edicao.perguntas[i]] = [edicao.perguntas[i], edicao.perguntas[i + 1]];
        desenharPerguntas();
      });
      apagar.addEventListener("click", () => {
        const filhos = dependentes(i);
        const fora = new Set([i, ...filhos]);
        edicao.perguntas = edicao.perguntas.filter((_, j) => !fora.has(j));
        if (filhos.length) mostrarToast("As perguntas extra ligadas a ela também foram removidas.");
        desenharPerguntas();
      });
      acoes.append(subir, descer, apagar);
      topo.appendChild(acoes);
      cartao.appendChild(topo);

      // texto da pergunta
      const campoRotulo = document.createElement("input");
      campoRotulo.type = "text";
      campoRotulo.maxLength = 300;
      campoRotulo.placeholder = "Ex.: Você é casado(a)?";
      campoRotulo.value = q.rotulo;
      campoRotulo.addEventListener("input", () => { q.rotulo = campoRotulo.value; });
      cartao.appendChild(campoRotulo);

      // tipo + obrigatória
      const linha = criar("div", "curso-pergunta-adm__linha");
      const selTipo = document.createElement("select");
      TIPOS_PERGUNTA.forEach(({ tipo, rotulo }) => {
        const o = document.createElement("option");
        o.value = tipo; o.textContent = rotulo; o.selected = q.tipo === tipo;
        selTipo.appendChild(o);
      });
      selTipo.addEventListener("change", () => {
        q.tipo = selTipo.value;
        if (!perguntaTemOpcoes(q)) {
          // deixou de ter opções fixas: as perguntas extra ligadas a ela deixam de fazer sentido
          const filhos = dependentes(i);
          if (filhos.length) {
            const fora = new Set(filhos);
            edicao.perguntas = edicao.perguntas.filter((_, j) => !fora.has(j));
            mostrarToast("As perguntas extra ligadas a ela foram removidas.");
          }
        } else if (q.tipo !== "simnao" && !q.opcoes.length) {
          q.opcoes = [];
        }
        desenharPerguntas();
      });
      const obrig = criar("label", "curso-pergunta-adm__obrig");
      const cbObrig = document.createElement("input");
      cbObrig.type = "checkbox"; cbObrig.checked = q.obrigatoria;
      cbObrig.addEventListener("change", () => { q.obrigatoria = cbObrig.checked; });
      obrig.append(cbObrig, document.createTextNode(" obrigatória"));
      linha.append(selTipo, obrig);
      cartao.appendChild(linha);

      // opções (uma por linha)
      if (TIPOS_COM_OPCOES.includes(q.tipo)) {
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = "Uma opção por linha";
        ta.value = (q.opcoes || []).join("\n");
        ta.addEventListener("input", () => { q.opcoes = ta.value.split("\n").map((o) => o.trim()).filter(Boolean); });
        // ao terminar de digitar, as perguntas extra recalculam as respostas que podem abrir
        ta.addEventListener("change", () => desenharPerguntas());
        cartao.appendChild(ta);
      }

      // "mostrar só se..." (pergunta extra)
      if (q.condicao) {
        const pai = edicao.perguntas.find((x) => x.id === q.condicao.perguntaId);
        const cond = criar("div", "curso-pergunta-adm__cond");
        cond.appendChild(criar("span", "", "Aparece quando "));
        const selPai = document.createElement("select");
        edicao.perguntas.slice(0, i).filter(perguntaTemOpcoes).forEach((x) => {
          const o = document.createElement("option");
          o.value = x.id; o.textContent = x.rotulo || "(pergunta sem texto)"; o.selected = x.id === q.condicao.perguntaId;
          selPai.appendChild(o);
        });
        const selValor = document.createElement("select");
        const povoarValores = () => {
          selValor.innerHTML = "";
          const p = edicao.perguntas.find((x) => x.id === q.condicao.perguntaId);
          opcoesDaPergunta(p).forEach((v) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = v; o.selected = v === q.condicao.valor;
            selValor.appendChild(o);
          });
          if (!opcoesDaPergunta(p).includes(q.condicao.valor)) q.condicao.valor = opcoesDaPergunta(p)[0] || "";
        };
        selPai.addEventListener("change", () => { q.condicao.perguntaId = selPai.value; povoarValores(); });
        selValor.addEventListener("change", () => { q.condicao.valor = selValor.value; });
        povoarValores();
        cond.append(selPai, criar("span", "", " for "), selValor);
        const semCond = criar("button", "curso-mini-btn", "Sempre mostrar");
        semCond.type = "button";
        semCond.addEventListener("click", () => { q.condicao = null; desenharPerguntas(); });
        cond.appendChild(semCond);
        cartao.appendChild(cond);
        void pai;
      }

      // criar pergunta extra a partir desta
      if (perguntaTemOpcoes(q)) {
        const extra = criar("button", "btn btn-contorno btn-pequeno curso-pergunta-adm__extra", "+ Pergunta extra (depende da resposta)");
        extra.type = "button";
        extra.addEventListener("click", () => {
          const ops = opcoesDaPergunta(q);
          if (!ops.length) { mostrarToast("Primeiro escreva as opções desta pergunta."); return; }
          const nova = { id: novoIdCurto(), rotulo: "", tipo: "simnao", obrigatoria: true, opcoes: [], condicao: { perguntaId: q.id, valor: ops[0] } };
          // entra depois da pergunta e de tudo que já depende dela
          const filhos = dependentes(i);
          const pos = (filhos.length ? filhos[filhos.length - 1] : i) + 1;
          edicao.perguntas.splice(pos, 0, nova);
          desenharPerguntas();
          const campos = caixaPerguntas.querySelectorAll(".curso-pergunta-adm > input[type=text]");
          campos[pos]?.focus();
        });
        cartao.appendChild(extra);
      }
      caixaPerguntas.appendChild(cartao);
    });
  }

  document.getElementById("btnCursoAddPergunta").addEventListener("click", () => {
    edicao.perguntas.push({ id: novoIdCurto(), rotulo: "", tipo: "texto", obrigatoria: false, opcoes: [], condicao: null });
    desenharPerguntas();
    const campos = caixaPerguntas.querySelectorAll(".curso-pergunta-adm > input[type=text]");
    campos[campos.length - 1]?.focus();
  });

  document.getElementById("btnCursoEscolherImagem").addEventListener("click", () => arquivoImagem.click());
  arquivoImagem.addEventListener("change", () => {
    const f = arquivoImagem.files[0];
    arquivoImagem.value = "";
    if (!f) return;
    edicao.novaImagem = f;
    mostrarImagemEditor();
  });
  btnRemoverImagem.addEventListener("click", () => { edicao.novaImagem = null; edicao.imagemUrl = ""; mostrarImagemEditor(); });

  function abrirEditor(curso) {
    edicao = curso
      ? {
        id: curso.id, ordem: curso.ordem, imagemUrl: curso.imagemUrl, novaImagem: null,
        pedirAceiteContato: curso.pedirAceiteContato, encerradoEmMs: curso.encerradoEmMs,
        campos: JSON.parse(JSON.stringify(curso.campos)), perguntas: JSON.parse(JSON.stringify(curso.perguntas))
      }
      : cursoVazio();
    document.getElementById("tituloModalCurso").textContent = curso ? "Editar curso ou evento" : "Novo curso ou evento";
    campoNome.value = curso ? curso.nome : "";
    campoObs.value = curso ? curso.observacoes : "";
    campoAtivo.checked = curso ? curso.ativo : true;
    campoAbreEm.value = curso ? curso.abreEm : "";
    campoFechaEm.value = curso ? curso.fechaEm : "";
    campoAceite.checked = !!edicao.pedirAceiteContato;
    mostrarImagemEditor();
    desenharCamposPadrao();
    desenharPerguntas();
    abrirModal(modalCurso);
    document.getElementById("cursoEditor").scrollTop = 0;
  }
  campoAceite.addEventListener("change", () => {
    if (!edicao) return;
    edicao.pedirAceiteContato = campoAceite.checked;
    desenharCamposPadrao();
  });
  const fecharEditor = () => { fecharModal(modalCurso); edicao = null; };
  document.getElementById("fecharModalCurso").addEventListener("click", fecharEditor);
  document.getElementById("btnCancelarCurso").addEventListener("click", fecharEditor);
  document.getElementById("btnNovoCurso").addEventListener("click", () => abrirEditor(null));

  document.getElementById("btnSalvarCurso").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!edicao) return;
    const nome = campoNome.value.trim();
    if (!nome) { mostrarToast("Escreva o nome do curso ou evento."); campoNome.focus(); return; }
    for (let i = 0; i < edicao.perguntas.length; i++) {
      const q = edicao.perguntas[i];
      if (!q.rotulo.trim()) { mostrarToast(`Escreva o texto da pergunta ${i + 1}.`); return; }
      if (TIPOS_COM_OPCOES.includes(q.tipo) && q.opcoes.length < 2) { mostrarToast(`A pergunta "${q.rotulo.trim()}" precisa de pelo menos 2 opções.`); return; }
      if (q.condicao && !opcoesDaPergunta(edicao.perguntas.find((x) => x.id === q.condicao.perguntaId)).includes(q.condicao.valor)) {
        mostrarToast(`Confira quando a pergunta extra "${q.rotulo.trim()}" deve aparecer.`); return;
      }
    }
    const abreEm = campoAbreEm.value, fechaEm = campoFechaEm.value;
    if (abreEm && fechaEm && fechaEm <= abreEm) { mostrarToast("O encerramento precisa ser depois do início das inscrições."); campoFechaEm.focus(); return; }
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      let imagemUrl = edicao.imagemUrl;
      if (edicao.novaImagem) imagemUrl = await enviarImagem(edicao.novaImagem);
      const dados = {
        nome, imagemUrl, observacoes: campoObs.value.trim(), ativo: campoAtivo.checked,
        pedirAceiteContato: edicao.pedirAceiteContato,
        abreEm, fechaEm,
        // encerrado na mão: guarda o momento (identifica o encerramento para o envio da lista por e-mail)
        encerradoEmMs: campoAtivo.checked ? 0 : (edicao.encerradoEmMs || Date.now()),
        campos: edicao.campos, perguntas: edicao.perguntas.map((q) => ({ ...q, rotulo: q.rotulo.trim() })), ordem: edicao.ordem
      };
      await salvarCurso(edicao.id, dados);
      mostrarToast(edicao.id ? "Curso atualizado!" : "Curso cadastrado!");
      fecharEditor();
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Verifique a internet (e o tamanho da imagem) e tente de novo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar curso";
    }
  });

  /* ---------- lista de cursos (fechada) ---------- */
  function contarInscritos(cursoId) { return inscricoes.filter((i) => i.cursoId === cursoId).length; }

  function resumoDoCurso(curso, corpo) {
    if (curso.imagemUrl) {
      const img = criar("img", "curso-resumo__imagem");
      img.src = curso.imagemUrl; img.alt = "";
      corpo.appendChild(img);
    }
    if (curso.observacoes) {
      const o = criar("p", "curso-resumo__obs");
      linkificarTexto(curso.observacoes, o);
      corpo.appendChild(o);
    }
    const pedidos = ["Nome completo", ...CAMPOS_PADRAO.filter(({ chave }) => curso.campos[chave].ativo).map(({ chave, rotulo }) => rotulo + (curso.campos[chave].obrigatorio ? " *" : ""))];
    const p1 = criar("p", "curso-resumo__linha");
    p1.append(criar("strong", "", "Dados pedidos: "), document.createTextNode(pedidos.join(", ")));
    corpo.appendChild(p1);
    if (curso.abreEm || curso.fechaEm) {
      const pp = criar("p", "curso-resumo__linha");
      pp.append(criar("strong", "", "Programação: "), document.createTextNode([
        curso.abreEm ? `começam em ${rotuloDataHora(curso.abreEm)}` : "", curso.fechaEm ? `encerram em ${rotuloDataHora(curso.fechaEm)}` : ""
      ].filter(Boolean).join(" · ")));
      corpo.appendChild(pp);
    }
    if (curso.pedirAceiteContato) {
      const pa = criar("p", "curso-resumo__linha");
      pa.append(criar("strong", "", "Aceite de contato: "), document.createTextNode("pergunta se a pessoa aceita receber convites e informativos por e-mail"));
      corpo.appendChild(pa);
    }
    if (curso.perguntas.length) {
      corpo.appendChild(criar("strong", "curso-resumo__linha", "Perguntas:"));
      const ul = criar("ul", "curso-resumo__perguntas");
      curso.perguntas.forEach((q) => {
        const li = criar("li", q.condicao ? "extra" : "");
        const pai = q.condicao && curso.perguntas.find((x) => x.id === q.condicao.perguntaId);
        li.textContent = `${q.rotulo}${q.obrigatoria ? " *" : ""}`;
        const meta = opcoesDaPergunta(q);
        const detalhe = [TIPOS_PERGUNTA.find((t) => t.tipo === q.tipo)?.rotulo, meta.length && q.tipo !== "simnao" ? meta.join(" / ") : "",
          pai ? `só se "${pai.rotulo}" = ${q.condicao.valor}` : ""].filter(Boolean).join(" — ");
        li.appendChild(criar("small", "", ` (${detalhe})`));
        ul.appendChild(li);
      });
      corpo.appendChild(ul);
    }
  }

  function desenharCursos() {
    const lista = document.getElementById("listaCursosAdmin");
    lista.innerHTML = "";
    document.getElementById("avisoSemCursosAdmin").classList.toggle("oculto", cursos.length > 0);
    cursos.forEach((curso) => {
      const n = contarInscritos(curso.id);
      const { quadro, cabecalho, corpo, titulo } = criarQuadro(`${curso.nome} — ${n} ${n === 1 ? "inscrito" : "inscritos"}`, abertosCursos.has(curso.id),
        (abriu) => { if (abriu) abertosCursos.add(curso.id); else abertosCursos.delete(curso.id); });
      const { estado } = estadoInscricoes(curso);
      const textoSelo = estado === "abertas" ? "inscrições abertas" : estado === "emBreve" ? `começam em ${rotuloDataHora(curso.abreEm)}` : "inscrições encerradas";
      titulo.after(criar("span", `quadro-intencao__selo${estado === "encerradas" ? " quadro-intencao__selo--erro" : ""}`, textoSelo));
      const btnAbrir = botaoIcone("pdf", curso.ativo ? "Encerrar inscrições agora (continua no site como \"Inscrições encerradas\")" : "Reabrir inscrições", curso.ativo ? "⏸" : "▶");
      const btnEditar = botaoIcone("pdf", "Editar curso", ICONE_LAPIS);
      const btnApagar = botaoIcone("lixeira", "Apagar curso", ICONE_LIXEIRA);
      cabecalho.append(btnAbrir, btnEditar, btnApagar);
      btnAbrir.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await alterarAberturaDoCurso(curso.id, !curso.ativo);
          if (curso.ativo) mostrarToast("Inscrições encerradas.");
          else if (estadoInscricoes({ ...curso, ativo: true }).estado === "encerradas") mostrarToast("O prazo de encerramento já passou. Para reabrir de fato, clique em Editar e mude a data.");
          else mostrarToast("Inscrições reabertas!");
        }
        catch (err) { console.error(err); mostrarToast("Não foi possível alterar. Tente novamente."); }
      });
      btnEditar.addEventListener("click", (e) => { e.stopPropagation(); abrirEditor(curso); });
      btnApagar.addEventListener("click", (e) => {
        e.stopPropagation();
        pedirConfirmacao({
          titulo: "Apagar curso ou evento",
          texto: `Deseja apagar "${curso.nome}"? Isso também apaga ${n} ${n === 1 ? "inscrição" : "inscrições"} e os avisos deste curso. Não dá para desfazer.`,
          botao: "Apagar curso",
          acao: async () => { await excluirCurso(curso.id); mostrarToast("Curso apagado."); }
        });
      });
      resumoDoCurso(curso, corpo);
      lista.appendChild(quadro);
    });
  }

  /* =====================================================================================
     2) CRM dos inscritos
     ===================================================================================== */
  // "＋ Inscrever pessoa": abre o formulário do curso (o mesmo do site) numa janela e grava a inscrição
  const modalInscrever = document.getElementById("modalInscreverPessoa");
  const fecharInscrever = () => { fecharModal(modalInscrever); document.getElementById("corpoInscreverPessoa").replaceChildren(); };
  document.getElementById("fecharModalInscreverPessoa").addEventListener("click", fecharInscrever);
  modalInscrever.addEventListener("click", (e) => { if (e.target === modalInscrever) fecharInscrever(); });
  function abrirInscreverPessoa(curso) {
    document.getElementById("subtituloInscreverPessoa").textContent = curso.nome;
    const corpoModal = document.getElementById("corpoInscreverPessoa");
    corpoModal.replaceChildren();
    if (estadoInscricoes(curso).estado !== "abertas") {
      corpoModal.appendChild(criar("p", "inscrever-pessoa__aviso", "As inscrições deste curso não estão abertas para o público no momento, mas o painel pode inscrever mesmo assim."));
    }
    corpoModal.appendChild(montarFormularioDeInscricaoNoPainel(curso, {
      jaInscrito: (telefoneDigits) => inscricoes.some((i) => i.cursoId === curso.id && i.telefoneDigits === telefoneDigits),
      salvar: (dados) => salvarInscricao(dados),
      aoConcluir: (dados) => { fecharInscrever(); mostrarToast(`${dados.nome} foi inscrito(a) em "${curso.nome}".`); },
      aoCancelar: fecharInscrever,
      toast: mostrarToast
    }));
    abrirModal(modalInscrever);
    corpoModal.scrollTop = 0;
    const primeiro = corpoModal.querySelector("input");
    if (primeiro) setTimeout(() => primeiro.focus({ preventScroll: true }), 150);
  }

  function criarCartaoPessoa(curso, insc) {
    const aberto = abertosPessoas.has(insc.id);
    const cartao = criar("div", "crm-contato" + (aberto ? " aberto" : ""));
    const topo = criar("div", "crm-contato__topo");
    topo.setAttribute("role", "button");
    topo.tabIndex = 0;
    const seta = criar("span", "crm-contato__seta");
    seta.innerHTML = ICONE_SETA.replace("quadro-intencao__seta", "");
    const info = criar("div", "crm-contato__info");
    info.appendChild(criar("strong", "crm-contato__nome", insc.nome || "(sem nome)"));
    info.appendChild(criar("span", "crm-contato__fone", formatarTelefone((insc.padrao && insc.padrao.telefone) || insc.telefoneDigits)));
    const email = (insc.padrao && insc.padrao.email) || "";
    if (email) info.appendChild(criar("span", "crm-contato__meta", email));
    topo.append(seta, info);

    const num = numeroWhatsApp(insc.telefoneDigits);
    const zap = criar(num ? "a" : "span", "crm-zap" + (num ? "" : " desativado"));
    zap.innerHTML = ICONE_ZAP;
    if (num) {
      zap.href = `https://wa.me/${num}?text=${encodeURIComponent(`Olá, ${(insc.nome || "").split(/\s+/)[0]}! Aqui é da equipe dos Arautos sobre o curso "${curso.nome}".`)}`;
      zap.target = "_blank"; zap.rel = "noopener"; zap.title = "Abrir conversa no WhatsApp";
      zap.addEventListener("click", (e) => e.stopPropagation());
    } else zap.title = "Sem número válido para WhatsApp";
    topo.appendChild(zap);
    const mail = criar(emailValido(email) ? "a" : "span", "crm-zap crm-email" + (emailValido(email) ? "" : " desativado"));
    mail.innerHTML = ICONE_EMAIL;
    if (emailValido(email)) {
      mail.href = `mailto:${email}?subject=${encodeURIComponent(curso.nome)}`;
      mail.title = "Enviar e-mail";
      mail.addEventListener("click", (e) => e.stopPropagation());
    } else mail.title = "Esta pessoa não informou e-mail";
    topo.appendChild(mail);

    const alternar = () => { if (abertosPessoas.has(insc.id)) abertosPessoas.delete(insc.id); else abertosPessoas.add(insc.id); desenharCrm(); };
    topo.addEventListener("click", alternar);
    topo.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === topo) { e.preventDefault(); alternar(); } });
    cartao.appendChild(topo);

    if (aberto) {
      const det = criar("div", "crm-detalhes");
      const dl = criar("dl", "crm-respostas");
      const linha = (r, v) => {
        if (!v) return;
        dl.appendChild(criar("dt", "", r));
        dl.appendChild(criar("dd", "", v));
      };
      CAMPOS_PADRAO.forEach(({ chave, rotulo }) => linha(rotulo, dataParaTexto(insc.padrao && insc.padrao[chave])));
      (insc.itens || []).forEach((it) => linha(it.rotulo, valorComoTexto(it.valor)));
      if (curso.pedirAceiteContato || typeof insc.aceitaContato === "boolean") {
        linha("Aceita receber convites e informativos por e-mail", insc.aceitaContato === true ? "Sim" : "Não");
      }
      linha("Inscrito em", dataDoMs(insc.criadoEmMs));
      det.appendChild(dl);
      const apagar = criar("button", "btn btn-contorno btn-pequeno btn-perigo", "Remover esta inscrição");
      apagar.type = "button";
      apagar.addEventListener("click", () => pedirConfirmacao({
        titulo: "Remover inscrição",
        texto: `Remover a inscrição de ${insc.nome || "esta pessoa"} no curso "${curso.nome}"?`,
        botao: "Remover",
        acao: async () => { await excluirInscricao(insc.id); mostrarToast("Inscrição removida."); }
      }));
      det.appendChild(apagar);
      cartao.appendChild(det);
    }
    return cartao;
  }

  /* ---------- e-mails que recebem a lista de inscritos ---------- */
  let emailsLista = [];
  const caixaEmailsLista = document.getElementById("inscritosEmailsLista");
  const campoEmailNovo = document.getElementById("inscritosEmailNovo");
  function desenharEmailsLista() {
    caixaEmailsLista.replaceChildren();
    if (!emailsLista.length) {
      caixaEmailsLista.appendChild(criar("p", "inscritos-emails__vazio", "Nenhum e-mail cadastrado ainda. Sem e-mail aqui, a lista não é enviada."));
      return;
    }
    emailsLista.forEach((email) => {
      const chip = criar("span", "inscritos-emails__chip");
      chip.appendChild(criar("span", "inscritos-emails__endereco", email));
      const x = criar("button", "inscritos-emails__remover", "×"); x.type = "button";
      x.setAttribute("aria-label", `Remover ${email}`); x.title = "Remover este e-mail";
      x.addEventListener("click", async () => {
        x.disabled = true;
        const novos = emailsLista.filter((e) => e !== email);
        try { await salvarEmailsInscritos(novos); emailsLista = novos; desenharEmailsLista(); mostrarToast("E-mail removido."); }
        catch (err) { console.error(err); x.disabled = false; mostrarToast("Não foi possível remover. Tente novamente."); }
      });
      chip.appendChild(x);
      caixaEmailsLista.appendChild(chip);
    });
  }
  const preencherEmailsLista = (cfg) => { emailsLista = [...new Set((cfg.emailsInscritos || []).map((e) => e.trim()).filter(Boolean))]; desenharEmailsLista(); };
  obterConfigEnvioIntencoes(preencherEmailsLista).then(preencherEmailsLista).catch((err) => { console.error(err); desenharEmailsLista(); });
  document.getElementById("formInscritosEmail").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = campoEmailNovo.value.trim();
    if (!email) { campoEmailNovo.focus(); return; }
    if (!emailValido(email)) { campoEmailNovo.classList.add("invalido"); mostrarToast("Esse e-mail não parece válido. Confira e tente de novo."); campoEmailNovo.focus(); return; }
    campoEmailNovo.classList.remove("invalido");
    if (emailsLista.some((x) => x.toLowerCase() === email.toLowerCase())) { mostrarToast("Esse e-mail já está na lista."); campoEmailNovo.value = ""; return; }
    const btn = document.getElementById("btnAdicionarEmailInscritos");
    btn.disabled = true;
    const novos = [...emailsLista, email];
    try { await salvarEmailsInscritos(novos); emailsLista = novos; campoEmailNovo.value = ""; desenharEmailsLista(); mostrarToast("E-mail adicionado!"); }
    catch (err) { console.error(err); mostrarToast("Não foi possível salvar. Tente novamente."); }
    finally { btn.disabled = false; }
  });
  campoEmailNovo.addEventListener("input", () => campoEmailNovo.classList.remove("invalido"));

  // Pessoas que começaram a preencher o formulário do curso e não enviaram (quem já tem inscrição no curso não entra)
  const quandoBrasilia = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " às ");
  // Mensagem de WhatsApp enviada a quem não concluiu a inscrição: uma por curso. Fica guardada neste aparelho
  // (sem gastar leituras/gravações do banco) e o mesmo editor é reaproveitado a cada redesenho da tela,
  // para não perder o que a pessoa está digitando quando chega uma atualização.
  const editoresIniciadas = new Map(); // cursoId → { editor, aoMudar }
  const chaveMensagemIniciadas = (cursoId) => `arautos_msg_iniciadas_${cursoId}`;
  const mensagemPadraoIniciadas = (curso) =>
    `Olá, {nome}! Aqui é da equipe dos Arautos do Evangelho. Vimos que você começou sua inscrição no curso "${curso.nome}", mas ainda não concluiu. Podemos ajudar com alguma dúvida? 🙏`;
  function lerMensagemIniciadas(curso) {
    try { const guardada = localStorage.getItem(chaveMensagemIniciadas(curso.id)); if (guardada !== null) return guardada; } catch (_) { /* sem armazenamento: usa a padrão */ }
    return mensagemPadraoIniciadas(curso);
  }
  function editorIniciadas(curso) {
    let item = editoresIniciadas.get(curso.id);
    if (!item) {
      item = { aoMudar: () => {} };
      item.editor = criarEditorMensagem({
        rotulo: "Mensagem para enviar pelo WhatsApp",
        mensagem: lerMensagemIniciadas(curso),
        toast: mostrarToast,
        aoMudar: (texto) => {
          try { localStorage.setItem(chaveMensagemIniciadas(curso.id), texto); } catch (_) { /* sem armazenamento */ }
          item.aoMudar(texto);
        }
      });
      editoresIniciadas.set(curso.id, item);
    }
    return item;
  }

  function criarQuadroIniciadas(curso, inscritosDoCurso) {
    const jaInscritos = new Set(inscritosDoCurso.map((i) => i.telefoneDigits));
    const pendentes = iniciadas
      .filter((i) => i.cursoId === curso.id && !jaInscritos.has(i.telefoneDigits))
      .sort((a, b) => (b.atualizadoEmMs || 0) - (a.atualizadoEmMs || 0));
    const { quadro, corpo } = criarQuadro(`Iniciaram e não concluíram — ${pendentes.length}`, abertosIniciadas.has(curso.id),
      (abriu) => { if (abriu) abertosIniciadas.add(curso.id); else abertosIniciadas.delete(curso.id); });
    quadro.classList.add("quadro-iniciadas");
    if (!pendentes.length) {
      corpo.appendChild(criar("p", "mensagem-vazia", "Ninguém começou a se inscrever e deixou de concluir."));
      return quadro;
    }
    corpo.appendChild(criar("p", "crm-iniciadas__ajuda", "Pessoas que começaram a preencher o formulário deste curso e ainda não enviaram. Quando enviam a inscrição, saem desta lista."));

    // caixa de mensagem (a mesma de Contatos > Campanhas): o botão do WhatsApp de cada pessoa abre a conversa com ela
    const item = editorIniciadas(curso);
    const caixaMsg = criar("div", "crm-iniciadas__mensagem");
    caixaMsg.appendChild(item.editor.el);
    const restaurar = criar("button", "btn btn-contorno btn-pequeno crm-iniciadas__restaurar", "Restaurar mensagem padrão");
    restaurar.type = "button";
    restaurar.addEventListener("click", () => { item.editor.definirMensagem(mensagemPadraoIniciadas(curso)); mostrarToast("Mensagem padrão restaurada."); });
    caixaMsg.appendChild(restaurar);
    corpo.appendChild(caixaMsg);
    const linksZap = []; // [{ a, nome, num }] — os links acompanham a mensagem enquanto ela é editada
    const atualizarLinksZap = (texto) => linksZap.forEach(({ a, nome, num }) => {
      const msg = mensagemParaPessoa(texto, nome);
      a.href = `https://wa.me/${num}` + (msg.trim() ? `?text=${encodeURIComponent(msg)}` : "");
    });
    item.aoMudar = atualizarLinksZap;
    corpo.appendChild(criar("h4", "crm-iniciadas__titulo-lista", `Pessoas (${pendentes.length})`));

    pendentes.forEach((p) => {
      const cartao = criar("div", "crm-contato crm-contato--iniciada");
      const topo = criar("div", "crm-contato__topo crm-contato__topo--fixo");
      const info = criar("div", "crm-contato__info");
      info.appendChild(criar("strong", "crm-contato__nome", p.nome || "(sem nome)"));
      info.appendChild(criar("span", "crm-contato__fone", formatarTelefone(p.telefoneDigits)));
      const partes = [];
      const quando = p.atualizadoEmMs || p.iniciouEmMs;
      if (quando) partes.push(`Última atividade em ${quandoBrasilia(quando)}`);
      if (p.total) partes.push(`preencheu ${p.preenchidos || 0} de ${p.total} ${p.total === 1 ? "campo" : "campos"}`);
      if (partes.length) info.appendChild(criar("span", "crm-contato__meta", partes.join(" · ")));
      topo.appendChild(info);

      const num = numeroWhatsApp(p.telefoneDigits);
      const zap = criar(num ? "a" : "span", "crm-zap" + (num ? "" : " desativado"));
      zap.innerHTML = ICONE_ZAP;
      if (num) {
        linksZap.push({ a: zap, nome: p.nome || "", num });
        zap.target = "_blank"; zap.rel = "noopener"; zap.title = "Abrir conversa no WhatsApp com a mensagem acima";
      } else zap.title = "Sem número válido para WhatsApp";
      topo.appendChild(zap);

      const apagar = criar("button", "crm-zap crm-remover");
      apagar.type = "button";
      apagar.innerHTML = ICONE_LIXEIRA;
      apagar.title = "Tirar esta pessoa da lista";
      apagar.setAttribute("aria-label", "Tirar esta pessoa da lista");
      apagar.addEventListener("click", async () => {
        apagar.disabled = true;
        try { await excluirInscricaoIniciada(p.id); } catch (err) { console.error(err); mostrarToast("Não foi possível remover agora. Tente novamente."); apagar.disabled = false; }
      });
      topo.appendChild(apagar);
      cartao.appendChild(topo);
      corpo.appendChild(cartao);
    });
    atualizarLinksZap(item.editor.obterMensagem());
    return quadro;
  }

  function desenharCrm() {
    const raiz = document.getElementById("listaInscritosAdmin");
    // não refaz a tela enquanto a pessoa digita na busca (perderia o foco)
    const foco = document.activeElement;
    const focoBusca = foco && raiz.contains(foco) && foco.classList.contains("crm-busca") ? foco.dataset.curso : null;
    // a pessoa está escrevendo a mensagem das "iniciaram e não concluíram"? guarda onde o cursor estava
    let focoMensagem = null;
    if (foco && foco.tagName === "TEXTAREA") {
      for (const [cursoId, { editor }] of editoresIniciadas) {
        if (editor.textarea === foco) { focoMensagem = { cursoId, ini: foco.selectionStart, fim: foco.selectionEnd }; break; }
      }
    }
    raiz.innerHTML = "";
    document.getElementById("avisoSemInscritos").classList.toggle("oculto", cursos.length > 0);
    cursos.forEach((curso) => {
      const dele = inscricoes.filter((i) => i.cursoId === curso.id);
      const { quadro, corpo } = criarQuadro(`${curso.nome} — ${dele.length} ${dele.length === 1 ? "inscrito" : "inscritos"}`, abertosCrm.has(curso.id),
        (abriu) => { if (abriu) abertosCrm.add(curso.id); else abertosCrm.delete(curso.id); });

      const emails = emailsDosInscritos(dele);
      const comZap = dele.filter((i) => numeroWhatsApp(i.telefoneDigits)).length;
      const resumo = criar("div", "crm-resumo");
      const itensResumo = [[dele.length, dele.length === 1 ? "inscrito" : "inscritos"], [emails.length, "com e-mail"], [comZap, "com WhatsApp"]];
      if (curso.pedirAceiteContato) itensResumo.push([emailsParaAvisos(curso, dele).length, "aceitaram receber e-mails"]);
      itensResumo.forEach(([n, t]) => {
        const s = criar("span", "crm-resumo__item");
        s.innerHTML = `<strong>${n}</strong> ${t}`;
        resumo.appendChild(s);
      });
      corpo.appendChild(resumo);
      const btnInscrever = criar("button", "btn btn-dourado btn-pequeno crm-inscrever", "＋ Inscrever pessoa");
      btnInscrever.type = "button";
      btnInscrever.title = "Inscrever alguém neste curso pelo painel";
      btnInscrever.addEventListener("click", () => abrirInscreverPessoa(curso));
      corpo.appendChild(btnInscrever);
      corpo.appendChild(criarQuadroIniciadas(curso, dele));

      const barra = criar("div", "crm-barra");
      const busca = document.createElement("input");
      busca.type = "search";
      busca.className = "crm-busca";
      busca.dataset.curso = curso.id;
      busca.placeholder = "Buscar por nome, telefone, e-mail ou resposta...";
      busca.value = buscaCrm.get(curso.id) || "";
      busca.addEventListener("input", () => { buscaCrm.set(curso.id, busca.value); desenharCrm(); });
      barra.appendChild(busca);
      const exp = criar("div", "crm-exportar");
      exp.appendChild(criar("span", "crm-exportar__rotulo", "Baixar lista:"));
      [["excel", "Excel"], ["word", "Word"], ["pdf", "PDF"]].forEach(([formato, nome]) => {
        const b = criar("button", "btn btn-contorno btn-pequeno", nome);
        b.type = "button";
        b.addEventListener("click", async () => {
          if (!dele.length) { mostrarToast("Ainda não há inscritos neste curso."); return; }
          b.disabled = true;
          try { await exportarInscritos(formato, curso, dele); mostrarToast(`Lista em ${nome} gerada.`); }
          catch (err) { console.error(err); mostrarToast(err.message || "Não foi possível gerar o arquivo."); }
          finally { b.disabled = false; }
        });
        exp.appendChild(b);
      });
      const btnEmail = criar("button", "btn btn-contorno btn-pequeno", "Enviar por e-mail");
      btnEmail.type = "button";
      btnEmail.title = "Envia agora o Excel, o Word e o PDF para os e-mails cadastrados em \"E-mails que recebem a lista de inscritos\"";
      btnEmail.addEventListener("click", () => {
        if (!dele.length) { mostrarToast("Ainda não há inscritos neste curso."); return; }
        if (!emailsLista.length) {
          mostrarToast("Cadastre antes um e-mail em \"E-mails que recebem a lista de inscritos\" (no alto desta seção).");
          document.getElementById("inscritosEmails").scrollIntoView({ behavior: "smooth", block: "center" });
          campoEmailNovo.focus({ preventScroll: true });
          return;
        }
        pedirConfirmacao({
          titulo: "Enviar lista por e-mail",
          texto: `Enviar agora a lista de "${curso.nome}" (${dele.length} ${dele.length === 1 ? "inscrito" : "inscritos"}), com Excel, Word e PDF, para ${emailsLista.length === 1 ? "o e-mail cadastrado" : `os ${emailsLista.length} e-mails cadastrados`} em "E-mails que recebem a lista de inscritos" (${emailsLista.join(", ")})?`,
          botao: "Enviar",
          acao: async () => {
            try { const r = await chamarApiEnvio({ acao: "listaCurso", cursoId: curso.id }); mostrarToast(`Lista enviada para ${r.destinatarios.length} ${r.destinatarios.length === 1 ? "e-mail" : "e-mails"}.`); }
            catch (err) { console.error(err); mostrarToast(err.message || "Não foi possível enviar o e-mail."); }
          }
        });
      });
      exp.appendChild(btnEmail);
      barra.appendChild(exp);
      corpo.appendChild(barra);

      const termo = semAcento(buscaCrm.get(curso.id) || "").trim();
      const digitos = (buscaCrm.get(curso.id) || "").replace(/\D/g, "");
      const ordenados = [...dele].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      const filtrados = ordenados.filter((i) => {
        if (!termo) return true;
        if (semAcento(i.nome).includes(termo)) return true;
        if (digitos.length >= 3 && String(i.telefoneDigits).includes(digitos)) return true;
        const texto = semAcento([...Object.values(i.padrao || {}), ...(i.itens || []).map((x) => valorComoTexto(x.valor))].join(" "));
        return texto.includes(termo);
      });
      if (!dele.length) corpo.appendChild(criar("p", "mensagem-vazia", "Ninguém se inscreveu ainda."));
      else if (!filtrados.length) corpo.appendChild(criar("p", "mensagem-vazia", "Nenhuma inscrição encontrada com essa busca."));
      filtrados.forEach((i) => corpo.appendChild(criarCartaoPessoa(curso, i)));
      raiz.appendChild(quadro);
    });
    if (focoBusca) {
      const novo = raiz.querySelector(`.crm-busca[data-curso="${focoBusca}"]`);
      if (novo) { novo.focus(); const f = novo.value.length; novo.setSelectionRange?.(f, f); }
    }
    if (focoMensagem) {
      const ed = editoresIniciadas.get(focoMensagem.cursoId);
      if (ed && ed.editor.textarea.isConnected) { ed.editor.textarea.focus({ preventScroll: true }); ed.editor.textarea.setSelectionRange(focoMensagem.ini, focoMensagem.fim); }
    }
  }

  /* =====================================================================================
     3) Avisos para inscritos (quadro por curso + envio por e-mail)
     ===================================================================================== */
  async function enviarPorEmail(aviso, botao) {
    if (botao) botao.disabled = true;
    try {
      const r = await chamarApiEnvio({ acao: aviso.global ? "avisoGeral" : "avisoCurso", avisoId: aviso.id });
      mostrarToast(`Aviso enviado por e-mail para ${r.total} ${r.total === 1 ? "pessoa" : "pessoas"}.`);
    } catch (err) {
      console.error(err);
      mostrarToast(err.message || "Não foi possível enviar o e-mail.");
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  // Primeiro quadro: aviso por e-mail para todos que marcaram o aceite de contato, em qualquer curso.
  function criarQuadroAvisoGeral() {
    const emails = emailsQueAceitaramContato(inscricoes);
    const gerais = avisos.filter((a) => a.global === true);
    const { quadro, corpo } = criarQuadro(`Todos que aceitaram contato (todos os cursos) — ${emails.length} ${emails.length === 1 ? "e-mail" : "e-mails"}`,
      abertosAvisos.has("__geral"), (abriu) => { if (abriu) abertosAvisos.add("__geral"); else abertosAvisos.delete("__geral"); });
    quadro.classList.add("quadro-aviso-geral");

    corpo.appendChild(criar("p", "crm-iniciadas__ajuda",
      emails.length
        ? `Este aviso vai só por e-mail, para ${emails.length} ${emails.length === 1 ? "pessoa" : "pessoas"} que marcaram o aceite de contato em algum curso (quem está em mais de um curso recebe uma vez só). Ele não aparece no quadro de nenhum curso.`
        : "Ainda não há ninguém que tenha marcado o aceite de contato e informado um e-mail."));

    const form = criar("form", "curso-aviso-form");
    form.noValidate = true;
    form.appendChild(criar("p", "campo-legenda", "Novo aviso por e-mail"));
    const titulo = document.createElement("input");
    titulo.type = "text"; titulo.maxLength = 120; titulo.placeholder = "Assunto do e-mail";
    const texto = document.createElement("textarea");
    texto.rows = 5; texto.maxLength = 4000; texto.placeholder = "Escreva a mensagem...";
    const enviar = criar("button", "btn btn-dourado btn-pequeno", "Enviar por e-mail");
    enviar.type = "submit";
    enviar.disabled = emails.length === 0;
    form.append(titulo, texto, enviar);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!titulo.value.trim() || !texto.value.trim()) { mostrarToast("Escreva o assunto e a mensagem."); return; }
      if (!podeAvisar()) { mostrarToast("Você não tem permissão para enviar e-mails."); return; }
      pedirConfirmacao({
        titulo: "Enviar aviso por e-mail",
        texto: `Enviar "${titulo.value.trim()}" por e-mail para ${emails.length} ${emails.length === 1 ? "pessoa" : "pessoas"} que aceitaram contato em qualquer curso?`,
        botao: "Enviar",
        acao: async () => {
          const id = await criarAvisoGeral({ titulo: titulo.value.trim(), texto: texto.value.trim() });
          titulo.value = ""; texto.value = "";
          await enviarPorEmail({ id, global: true });
        }
      });
    });
    corpo.appendChild(form);

    if (!gerais.length) corpo.appendChild(criar("p", "mensagem-vazia", "Nenhum aviso geral enviado ainda."));
    gerais.forEach((a) => {
      const item = criar("div", "curso-aviso-adm");
      const cab = criar("div", "curso-aviso-adm__cab");
      cab.appendChild(criar("strong", "", a.titulo));
      cab.appendChild(criar("span", "curso-aviso-adm__data", dataDoMs(a.criadoEmMs)));
      item.appendChild(cab);
      const t = criar("p", "curso-aviso-adm__texto");
      linkificarTexto(a.texto, t);
      item.appendChild(t);
      const rodape = criar("div", "curso-aviso-adm__rodape");
      if (a.emailEnviadoEm) {
        rodape.appendChild(criar("span", "quadro-intencao__selo", `✓ e-mail enviado para ${a.emailTotal ?? "?"} em ${formatarDataBR(String(a.emailEnviadoEm).slice(0, 10))}`));
      } else {
        rodape.appendChild(criar("span", "curso-aviso-adm__data", "Ainda não foi enviado por e-mail"));
      }
      const btnMail = criar("button", "btn btn-contorno btn-pequeno", a.emailEnviadoEm ? "Reenviar por e-mail" : "Enviar por e-mail");
      btnMail.type = "button";
      btnMail.disabled = emails.length === 0;
      btnMail.addEventListener("click", () => {
        if (!podeAvisar()) { mostrarToast("Você não tem permissão para enviar e-mails."); return; }
        pedirConfirmacao({
          titulo: a.emailEnviadoEm ? "Reenviar aviso por e-mail" : "Enviar aviso por e-mail",
          texto: `${a.emailEnviadoEm ? "Reenviar" : "Enviar"} "${a.titulo}" por e-mail para ${emails.length} ${emails.length === 1 ? "pessoa" : "pessoas"} que aceitaram contato em qualquer curso?`,
          botao: a.emailEnviadoEm ? "Reenviar" : "Enviar",
          acao: async () => { await enviarPorEmail(a); }
        });
      });
      const btnApagar = criar("button", "btn btn-contorno btn-pequeno btn-perigo", "Apagar");
      btnApagar.type = "button";
      btnApagar.addEventListener("click", () => pedirConfirmacao({
        titulo: "Apagar aviso", texto: `Apagar o aviso "${a.titulo}" do histórico? Quem já recebeu o e-mail continua com ele.`,
        acao: async () => { await excluirAvisoDoCurso(a.id); mostrarToast("Aviso apagado."); }
      }));
      rodape.append(btnMail, btnApagar);
      item.appendChild(rodape);
      corpo.appendChild(item);
    });
    return quadro;
  }

  function desenharAvisos() {
    const raiz = document.getElementById("listaAvisosCursosAdmin");
    // não refaz enquanto a pessoa escreve um aviso
    const foco = document.activeElement;
    if (foco && raiz.contains(foco) && foco.matches("input[type=text], textarea")) return;
    raiz.innerHTML = "";
    document.getElementById("avisoSemCursosAvisos").classList.toggle("oculto", cursos.length > 0);
    raiz.appendChild(criarQuadroAvisoGeral());
    cursos.forEach((curso) => {
      const dele = avisos.filter((a) => a.cursoId === curso.id && !a.global);
      const doCurso = inscricoes.filter((i) => i.cursoId === curso.id);
      const emails = emailsParaAvisos(curso, doCurso);
      const total = doCurso.length;
      const { quadro, corpo } = criarQuadro(`${curso.nome} — ${dele.length} ${dele.length === 1 ? "aviso" : "avisos"}`, abertosAvisos.has(curso.id),
        (abriu) => { if (abriu) abertosAvisos.add(curso.id); else abertosAvisos.delete(curso.id); });

      // novo aviso
      const form = criar("form", "curso-aviso-form");
      form.noValidate = true;
      form.appendChild(criar("p", "campo-legenda", "Novo aviso"));
      const titulo = document.createElement("input");
      titulo.type = "text"; titulo.maxLength = 120; titulo.placeholder = "Título do aviso";
      const texto = document.createElement("textarea");
      texto.rows = 4; texto.maxLength = 4000; texto.placeholder = "Escreva o aviso para os inscritos...";
      const lblEmail = criar("label", "curso-aviso-form__email");
      const cbEmail = document.createElement("input");
      cbEmail.type = "checkbox";
      cbEmail.checked = emails.length > 0;
      cbEmail.disabled = emails.length === 0;
      lblEmail.append(cbEmail, document.createTextNode(curso.pedirAceiteContato
        ? (emails.length
          ? ` Enviar também por e-mail agora (${emails.length} ${emails.length === 1 ? "inscrito aceitou" : "inscritos aceitaram"} receber e-mails${total > emails.length ? `; ${total - emails.length} não ${total - emails.length === 1 ? "receberá" : "receberão"}` : ""})`
          : " Enviar por e-mail (nenhum inscrito aceitou receber e-mails ainda)")
        : (emails.length
          ? ` Enviar também por e-mail agora para todos os inscritos (${emails.length} com e-mail${total > emails.length ? `, ${total - emails.length} sem e-mail` : ""})`
          : " Enviar por e-mail (nenhum inscrito informou e-mail — peça o e-mail no formulário do curso)")));
      const publicar = criar("button", "btn btn-dourado btn-pequeno", "Publicar aviso");
      publicar.type = "submit";
      form.append(titulo, texto, lblEmail, publicar);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!titulo.value.trim() || !texto.value.trim()) { mostrarToast("Escreva o título e o texto do aviso."); return; }
        if (cbEmail.checked && !podeAvisar()) { mostrarToast("Você não tem permissão para enviar e-mails."); return; }
        publicar.disabled = true;
        publicar.textContent = "Publicando...";
        try {
          const id = await criarAvisoDoCurso({ cursoId: curso.id, titulo: titulo.value.trim(), texto: texto.value.trim() });
          mostrarToast("Aviso publicado para os inscritos.");
          const quer = cbEmail.checked;
          titulo.value = ""; texto.value = "";
          if (quer) await enviarPorEmail({ id });
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível publicar. Tente novamente.");
        } finally {
          publicar.disabled = false;
          publicar.textContent = "Publicar aviso";
        }
      });
      corpo.appendChild(form);

      if (!dele.length) corpo.appendChild(criar("p", "mensagem-vazia", "Nenhum aviso neste curso ainda."));
      dele.forEach((a) => {
        const item = criar("div", "curso-aviso-adm");
        const cab = criar("div", "curso-aviso-adm__cab");
        cab.appendChild(criar("strong", "", a.titulo));
        cab.appendChild(criar("span", "curso-aviso-adm__data", dataDoMs(a.criadoEmMs)));
        item.appendChild(cab);
        const t = criar("p", "curso-aviso-adm__texto");
        linkificarTexto(a.texto, t);
        item.appendChild(t);
        const rodape = criar("div", "curso-aviso-adm__rodape");
        if (a.emailEnviadoEm) {
          rodape.appendChild(criar("span", "quadro-intencao__selo", `✓ e-mail enviado para ${a.emailTotal ?? "?"} em ${formatarDataBR(String(a.emailEnviadoEm).slice(0, 10))}`));
        }
        const btnMail = criar("button", "btn btn-contorno btn-pequeno", a.emailEnviadoEm ? "Reenviar por e-mail" : "Enviar por e-mail");
        btnMail.type = "button";
        btnMail.disabled = emails.length === 0;
        btnMail.title = emails.length ? "" : (curso.pedirAceiteContato ? "Nenhum inscrito aceitou receber e-mails" : "Nenhum inscrito informou e-mail");
        btnMail.addEventListener("click", () => {
          if (!podeAvisar()) { mostrarToast("Você não tem permissão para enviar e-mails."); return; }
          pedirConfirmacao({
            titulo: "Enviar aviso por e-mail",
            texto: `Enviar "${a.titulo}" por e-mail para ${emails.length} ${emails.length === 1 ? "inscrito" : "inscritos"} do curso "${curso.nome}"${curso.pedirAceiteContato ? " (só quem aceitou receber e-mails)" : ""}?`,
            botao: "Enviar",
            acao: async () => { await enviarPorEmail(a); }
          });
        });
        const btnApagar = criar("button", "btn btn-contorno btn-pequeno btn-perigo", "Apagar");
        btnApagar.type = "button";
        btnApagar.addEventListener("click", () => pedirConfirmacao({
          titulo: "Apagar aviso", texto: `Apagar o aviso "${a.titulo}"? Ele some do quadro de avisos do curso no site.`,
          acao: async () => { await excluirAvisoDoCurso(a.id); mostrarToast("Aviso apagado."); }
        }));
        rodape.append(btnMail, btnApagar);
        item.appendChild(rodape);
        corpo.appendChild(item);
      });
      raiz.appendChild(quadro);
    });
  }

  /* ---------- dados em tempo real ---------- */
  const redesenharTudo = () => { desenharCursos(); desenharCrm(); desenharAvisos(); };
  // cursos, inscrições e avisos só são lidos do banco na primeira vez que a página Inscrições de cursos é aberta
  aoAbrirPaginaUmaVez("inscricoes", () => {
    ouvirCursos((lista) => { cursos = lista; redesenharTudo(); });
    ouvirTodasInscricoes((lista) => { inscricoes = lista; redesenharTudo(); });
    ouvirInscricoesIniciadas((lista) => { iniciadas = lista; desenharCrm(); });
    ouvirTodosAvisosDosCursos((lista) => { avisos = lista; desenharAvisos(); desenharCursos(); });
  });

  void normalizarCurso; void tabelaDeInscritos;
}
