import { exigirCadastro } from "./auth.js";
import {
  inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast,
  formatarDataBR, formatarDataComDiaSemana, dataParaIso, hojeIso, criarCalendario,
  horariosDoDia, statusMissaEspecifica, textoDaIntencao, normalizarFormularioIntencoes
} from "./utils.js";
import {
  obterConfiguracoesGerais, ouvirConfigIntencoes, ouvirFormularioIntencoes,
  obterRascunho, salvarRascunho, excluirRascunho, obterIntencoesEnviadasDaPessoa,
  enviarIntencoesDaPessoa, limparRascunhosVencidos
} from "./dados.js";

inicializarNavegacao("intencoes");
// identificação padrão do site (mesmo telefone/nome usado em agendamentos etc.) — cada intenção
// guarda o nome de quem enviou (ver dados.js), pra aparecer no documento extraído pelo padre.
const usuarioPromise = exigirCadastro();

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
});

/* =========================================================
   Modais — vários podem ficar abertos ao mesmo tempo (um por cima do outro).
   O "abrirModal/fecharModal" genérico do site libera a rolagem da página ao fechar QUALQUER
   modal; aqui só libera quando não sobrar nenhum aberto.
   ========================================================= */
const el = (id) => document.getElementById(id);
function abrir(modal) {
  modal.classList.add("aberto");
  document.body.style.overflow = "hidden";
}
function fechar(modal) {
  modal.classList.remove("aberto");
  if (!document.querySelector(".modal-overlay.aberto")) document.body.style.overflow = "";
}
function fecharTodosOsModais() {
  document.querySelectorAll(".modal-overlay.aberto").forEach((m) => m.classList.remove("aberto"));
  document.body.style.overflow = "";
}

const modalEscolherLista = el("modalEscolherLista");
const modalLista = el("modalLista");
const modalCategorias = el("modalCategorias");
const modalPrevia = el("modalPrevia");
const modalEnviado = el("modalEnviado");
const modalPix = el("modalPix");

/* =========================================================
   Estado
   ========================================================= */
let configAtual = null; // horários das missas (configuracoes/intencoes)
let formulario = normalizarFormularioIntencoes(null); // categorias, tempos de falecimento, PIX (configuracoes/intencoesForm)
let diaSelecionado = null;
let usuarioAtual = null;

// Só dá pra colocar intenções para missas dos próximos 30 dias (contando a partir de hoje).
const DIAS_MAXIMOS_ANTECEDENCIA = 30;
function limiteMaximoIso() {
  const d = new Date();
  d.setDate(d.getDate() + DIAS_MAXIMOS_ANTECEDENCIA);
  return dataParaIso(d);
}
const avisoLimiteIntencoes = el("avisoLimiteIntencoes");
function atualizarAvisoLimite() {
  if (avisoLimiteIntencoes) {
    avisoLimiteIntencoes.textContent = `Você pode escolher datas até ${formatarDataBR(limiteMaximoIso())} (${DIAS_MAXIMOS_ANTECEDENCIA} dias a partir de hoje).`;
  }
}
atualizarAvisoLimite();

const formatarHoraSimples = (hora) => `${String(hora).padStart(2, "0")}:00`;

/* =========================================================
   Calendário + escolha do horário da missa
   ========================================================= */
const dataInput = el("dataIntencoesInput");
const calendarioEl = el("calendarioIntencoes");
const listaMissasDoDia = el("listaMissasDoDia");
const avisoSemMissa = el("avisoSemMissaNoDia");
const avisoSelecioneData = el("avisoSelecioneData");

const calendario = criarCalendario(calendarioEl, dataInput, {
  minIso: hojeIso(), // impede selecionar dias que já passaram
  maxIso: limiteMaximoIso(), // e dias além do limite de 30 dias
  aoSelecionar: (iso) => {
    diaSelecionado = iso;
    renderizarDia();
    if (configAtual && horariosDoDia(configAtual, iso).length > 0) abrirEscolhaDeLista();
  }
});

// Se a página ficar aberta de um dia pro outro, o intervalo permitido acompanha a data de hoje.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  calendario.definirLimites(hojeIso(), limiteMaximoIso());
  atualizarAvisoLimite();
});

function statusDaMissa(hora, agora = new Date()) {
  return statusMissaEspecifica(diaSelecionado, hora, configAtual.horasAntes, agora);
}

function textoStatusFechado(status) {
  if (status.jaAconteceu) return "Esta missa já aconteceu — a lista de intenções está encerrada.";
  return `As intenções para esta missa já fecharam. O preenchimento encerrou às ` +
    `${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.`;
}

// Cartões na própria página (um por horário de missa do dia): servem pra reabrir a lista depois
// de fechar a janelinha de escolha.
function renderizarDia() {
  listaMissasDoDia.innerHTML = "";
  if (!configAtual) return;
  if (!diaSelecionado) {
    avisoSemMissa.classList.add("oculto");
    avisoSelecioneData.classList.remove("oculto");
    return;
  }
  avisoSelecioneData.classList.add("oculto");
  const horas = horariosDoDia(configAtual, diaSelecionado);
  avisoSemMissa.classList.toggle("oculto", horas.length > 0);
  if (horas.length === 0) return;

  const agora = new Date();
  const card = document.createElement("div");
  card.className = "painel";
  card.innerHTML = `<div class="painel__titulo"><span class="emoji">🙏</span> Listas do dia ${formatarDataBR(diaSelecionado)}</div>`;
  horas.forEach((hora) => {
    const status = statusDaMissa(hora, agora);
    const linha = document.createElement("div");
    linha.className = "linha-missa-dia";
    linha.innerHTML = `
      <div class="linha-missa-dia__info">
        <strong>Missa das ${formatarHoraSimples(hora)}</strong>
        <small></small>
      </div>
    `;
    linha.querySelector("small").textContent = status.aberta
      ? `Preenchimento aberto até ${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.`
      : textoStatusFechado(status);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = status.aberta ? "btn btn-dourado btn-pequeno" : "btn btn-contorno btn-pequeno";
    btn.textContent = status.aberta ? "Preencher lista" : "Encerrada";
    btn.disabled = !status.aberta;
    if (status.aberta) btn.addEventListener("click", () => abrirLista(hora));
    linha.appendChild(btn);
    card.appendChild(linha);
  });
  listaMissasDoDia.appendChild(card);
}

function abrirEscolhaDeLista() {
  if (!configAtual || !diaSelecionado) return;
  const horas = horariosDoDia(configAtual, diaSelecionado);
  const agora = new Date();
  el("escolherListaData").textContent = formatarDataComDiaSemana(diaSelecionado);
  const caixa = el("escolherListaOpcoes");
  caixa.innerHTML = "";
  horas.forEach((hora) => {
    const status = statusDaMissa(hora, agora);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${status.aberta ? "btn-dourado" : "btn-contorno"} btn-full opcao-lista`;
    btn.disabled = !status.aberta;
    btn.innerHTML = `<span class="opcao-lista__hora">${status.aberta ? "🙏" : "🔒"} Missa das ${formatarHoraSimples(hora)}</span><small></small>`;
    btn.querySelector("small").textContent = status.aberta
      ? `Aberta até ${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}`
      : status.jaAconteceu ? "Esta missa já aconteceu" : "Lista encerrada";
    if (status.aberta) btn.addEventListener("click", () => abrirLista(hora));
    caixa.appendChild(btn);
  });
  abrir(modalEscolherLista);
}
el("btnVoltarEscolherLista").addEventListener("click", () => fechar(modalEscolherLista));

/* =========================================================
   A lista (modal principal)
   ========================================================= */
// Um item = uma intenção que a pessoa colocou: { id, categoria, nome, tempo, texto, destaque }.
// "tempo" só existe em categorias de falecimento (chave de formulario.temposFalecimento).
let lista = null; // { iso, hora, itens: [], assinaturaEnviada, editor: {...}, editando: id|null, temporizador }

let contadorId = 0;
const novoId = () => `i${Date.now().toString(36)}${(contadorId++).toString(36)}`;

function categoriaPorChave(chave) {
  return formulario.categorias.find((c) => c.chave === chave) || null;
}
function tempoPorChave(chave) {
  return formulario.temposFalecimento.find((t) => t.chave === chave) || null;
}

// Monta um item novo já com o texto final (ex.: "Maria (7 dias)") e o destaque (negrito no Word).
function criarItem(categoria, nome, tempo = "") {
  const limpo = nome.trim();
  const t = tempo ? tempoPorChave(tempo) : null;
  return {
    id: novoId(), categoria, nome: limpo, tempo: tempo || "",
    texto: textoDaIntencao(limpo, tempo, formulario.temposFalecimento),
    destaque: !!(t && t.sufixo)
  };
}
function recalcularItem(item) {
  const t = item.tempo ? tempoPorChave(item.tempo) : null;
  item.texto = textoDaIntencao(item.nome, item.tempo, formulario.temposFalecimento);
  item.destaque = !!(t && t.sufixo);
}

// "Assinatura" do conteúdo: serve pra saber se o que está na tela já foi enviado ou não.
function assinaturaDe(itens) {
  return itens.length ? JSON.stringify(itens.map((i) => [i.categoria, i.nome, i.tempo])) : "";
}

// Reconstrói itens a partir das intenções já enviadas (quando não existe rascunho — por exemplo,
// as enviadas antes de existir rascunho).
function itensDeEnviadas(enviadas) {
  return enviadas.map((it) => {
    let nome = (it.texto || "").trim();
    const t = it.tempo ? tempoPorChave(it.tempo) : null;
    if (t && t.sufixo && nome.endsWith(` (${t.sufixo})`)) nome = nome.slice(0, -(t.sufixo.length + 3)).trim();
    return {
      id: novoId(), categoria: it.categoria, nome, tempo: it.tempo || "",
      texto: it.texto || nome, destaque: it.destaque === true
    };
  });
}

async function abrirLista(hora) {
  const status = statusDaMissa(hora);
  if (!status.aberta) { mostrarToast("Esta lista já está encerrada."); return; }
  const iso = diaSelecionado;
  usuarioAtual = await usuarioPromise;

  lista = {
    iso, hora, itens: [], assinaturaEnviada: "", editor: editorVazio(), editando: null,
    temporizador: null, salvando: Promise.resolve()
  };
  el("listaTitulo").textContent = `Missa das ${formatarHoraSimples(hora)}`;
  el("listaSubtitulo").textContent = formatarDataComDiaSemana(iso);
  el("listaEntradas").innerHTML = "";
  el("editorIntencao").innerHTML = `<p class="categoria-intencao__vazio">Carregando suas intenções...</p>`;
  fechar(modalEscolherLista);
  abrir(modalLista);

  try {
    const [rascunho, enviadas] = await Promise.all([
      obterRascunho(iso, hora, usuarioAtual.telefoneDigits),
      obterIntencoesEnviadasDaPessoa(iso, hora, usuarioAtual.telefoneDigits)
    ]);
    if (!lista || lista.iso !== iso || lista.hora !== hora) return; // trocou de lista enquanto carregava
    if (rascunho && Array.isArray(rascunho.itens)) {
      lista.itens = rascunho.itens
        .filter((i) => i && typeof i === "object")
        .map((i) => ({
          id: i.id || novoId(), categoria: i.categoria, nome: String(i.nome || i.texto || ""), tempo: i.tempo || "",
          texto: String(i.texto || i.nome || ""), destaque: i.destaque === true
        }));
      lista.assinaturaEnviada = rascunho.assinaturaEnviada || "";
    } else {
      lista.itens = itensDeEnviadas(enviadas);
      lista.assinaturaEnviada = assinaturaDe(lista.itens);
    }
  } catch (err) {
    console.error(err);
    mostrarToast("Não foi possível carregar suas intenções. Verifique sua conexão.");
  }
  renderizarLista();
}

function editorVazio() {
  return { categoria: null, tempo: null, valor: "" };
}

/* ---------- Rascunho: salva sozinho a cada mudança ---------- */
function agendarSalvamento() {
  if (!lista) return;
  clearTimeout(lista.temporizador);
  lista.temporizador = setTimeout(persistirRascunho, 700);
}
function persistirRascunho() {
  if (!lista || !usuarioAtual) return Promise.resolve();
  clearTimeout(lista.temporizador);
  const { iso, hora, itens, assinaturaEnviada } = lista;
  const tel = usuarioAtual.telefoneDigits;
  const copia = itens.map((i) => ({ id: i.id, categoria: i.categoria, nome: i.nome, tempo: i.tempo, texto: i.texto, destaque: i.destaque }));
  const tarefa = (copia.length === 0 && !assinaturaEnviada)
    ? excluirRascunho(iso, hora, tel)
    : salvarRascunho({ dataMissa: iso, horaMissa: hora, telefoneDigits: tel, nome: usuarioAtual.nome, itens: copia, assinaturaEnviada });
  lista.salvando = tarefa.catch((err) => { console.error(err); });
  return lista.salvando;
}

/* ---------- Desenho da lista ---------- */
const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>`;
const ICONE_LIXEIRA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;

function atualizarSelo() {
  const selo = el("seloRascunho");
  const atual = assinaturaDe(lista.itens);
  selo.classList.remove("selo-rascunho--ok", "selo-rascunho--pendente");
  if (!atual && !lista.assinaturaEnviada) { selo.classList.add("oculto"); return; }
  selo.classList.remove("oculto");
  if (atual === lista.assinaturaEnviada) {
    selo.textContent = "✓ Lista enviada";
    selo.classList.add("selo-rascunho--ok");
  } else if (lista.assinaturaEnviada) {
    selo.textContent = "Alterações ainda não enviadas";
    selo.classList.add("selo-rascunho--pendente");
  } else {
    selo.textContent = "Rascunho salvo";
  }
}

// Intenções já adicionadas, agrupadas por categoria (na ordem das categorias do painel).
function renderizarEntradas() {
  const caixa = el("listaEntradas");
  caixa.innerHTML = "";
  const categoriasComItens = formulario.categorias.filter((c) => lista.itens.some((i) => i.categoria === c.chave));
  const orfas = lista.itens.filter((i) => !categoriaPorChave(i.categoria));
  const grupos = categoriasComItens.map((c) => ({ rotulo: c.rotulo, itens: lista.itens.filter((i) => i.categoria === c.chave) }));
  if (orfas.length) grupos.push({ rotulo: "Outras intenções", itens: orfas });

  if (grupos.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "categoria-intencao__vazio entradas-vazio";
    vazio.textContent = "Você ainda não adicionou nenhuma intenção. Escolha uma categoria abaixo para começar.";
    caixa.appendChild(vazio);
    return;
  }

  grupos.forEach((grupo) => {
    const bloco = document.createElement("div");
    bloco.className = "categoria-intencao entradas-grupo";
    const h = document.createElement("h3");
    h.className = "categoria-intencao__titulo";
    h.textContent = grupo.rotulo;
    bloco.appendChild(h);
    const listaEl = document.createElement("div");
    listaEl.className = "categoria-intencao__lista";
    grupo.itens.forEach((item) => listaEl.appendChild(criarLinhaItem(item)));
    bloco.appendChild(listaEl);
    caixa.appendChild(bloco);
  });
}

function criarLinhaItem(item) {
  const linha = document.createElement("div");
  linha.className = "intencao-item";

  if (lista.editando === item.id) {
    linha.classList.add("intencao-item--editando");
    linha.innerHTML = `
      <form class="intencao-item__editar-form">
        <input type="text" required />
        <span class="intencao-item__editar-acoes">
          <button type="submit" class="btn btn-dourado btn-pequeno">Salvar</button>
          <button type="button" class="btn btn-contorno btn-pequeno" data-cancelar>Cancelar</button>
        </span>
      </form>`;
    const campo = linha.querySelector("input");
    campo.value = item.nome; // via propriedade (não interpolado) — nomes com aspas/& nunca quebram o HTML
    linha.querySelector("[data-cancelar]").addEventListener("click", () => { lista.editando = null; renderizarEntradas(); });
    linha.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const novo = campo.value.trim();
      if (!novo) return;
      item.nome = novo;
      recalcularItem(item);
      lista.editando = null;
      alterouLista();
    });
    setTimeout(() => campo.focus(), 0);
    return linha;
  }

  linha.innerHTML = `
    <span class="intencao-item__texto"></span>
    <span class="intencao-item__acoes">
      <button type="button" class="intencao-item__btn intencao-item__btn--editar" title="Editar" aria-label="Editar esta intenção">${ICONE_LAPIS}</button>
      <button type="button" class="intencao-item__btn intencao-item__btn--apagar" title="Apagar" aria-label="Apagar esta intenção">${ICONE_LIXEIRA}</button>
    </span>`;
  const texto = linha.querySelector(".intencao-item__texto");
  texto.textContent = item.texto;
  if (item.destaque) texto.classList.add("intencao-item__texto--destaque");
  linha.querySelector(".intencao-item__btn--editar").addEventListener("click", () => { lista.editando = item.id; renderizarEntradas(); });
  linha.querySelector(".intencao-item__btn--apagar").addEventListener("click", () => {
    lista.itens = lista.itens.filter((i) => i.id !== item.id);
    alterouLista();
  });
  return linha;
}

function alterouLista() {
  renderizarEntradas();
  atualizarSelo();
  agendarSalvamento();
}

/* ---------- Editor: categoria → campos → "+ Adicionar mais intenções" ---------- */
function renderizarEditor({ rolar = false } = {}) {
  const caixa = el("editorIntencao");
  const ed = lista.editor;
  caixa.innerHTML = "";

  // Campo "Categoria" (sempre aparece; ao tocar abre a janelinha com as opções)
  const campoCategoria = document.createElement("div");
  campoCategoria.className = "campo";
  campoCategoria.innerHTML = `<label>Categoria</label>`;
  const seletor = document.createElement("button");
  seletor.type = "button";
  seletor.className = "seletor-categoria";
  const cat = ed.categoria ? categoriaPorChave(ed.categoria) : null;
  seletor.innerHTML = `<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
  seletor.querySelector("span").textContent = cat ? cat.rotulo : "Selecione a categoria";
  if (!cat) seletor.classList.add("seletor-categoria--vazio");
  seletor.addEventListener("click", abrirCategorias);
  campoCategoria.appendChild(seletor);
  caixa.appendChild(campoCategoria);

  if (cat) {
    if (cat.tipo === "falecimento") montarEditorFalecimento(caixa, cat);
    else montarEditorNome(caixa, cat);
  }

  if (rolar) {
    // rola, de forma animada, até o campo de categoria (começo do editor)
    requestAnimationFrame(() => {
      const corpo = el("listaCorpo");
      corpo.scrollTo({ top: caixa.offsetTop - 12, behavior: "smooth" });
    });
  }
}

function criarCampoNome(cat, aoDigitar, aoEnter) {
  const campo = document.createElement("div");
  campo.className = "campo";
  campo.innerHTML = `<label>Adicionar Nome</label><textarea rows="3"></textarea>`;
  const area = campo.querySelector("textarea");
  area.placeholder = cat.placeholder;
  area.value = lista.editor.valor;
  area.addEventListener("input", () => { lista.editor.valor = area.value; aoDigitar?.(); });
  // Enter (sem Shift) adiciona, como o campo de uma linha fazia; Shift+Enter quebra a linha
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aoEnter?.(); }
  });
  return { campo, area };
}

function montarEditorNome(caixa, cat) {
  const { campo, area } = criarCampoNome(cat, null, () => btn.click());
  caixa.appendChild(campo);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-dourado btn-full btn-mais";
  btn.textContent = "+ Adicionar mais intenções";
  btn.addEventListener("click", () => {
    if (!commitarEditor()) { mostrarToast("Digite o nome antes de continuar."); area.focus(); return; }
    lista.editor = editorVazio();
    alterouLista();
    renderizarEditor({ rolar: true });
  });
  caixa.appendChild(btn);
  setTimeout(() => area.focus({ preventScroll: true }), 50);
}

function montarEditorFalecimento(caixa, cat) {
  const ed = lista.editor;
  const rotulo = document.createElement("p");
  rotulo.className = "campo-legenda";
  rotulo.textContent = "Há quanto tempo a pessoa faleceu?";
  caixa.appendChild(rotulo);

  const opcoes = document.createElement("div");
  opcoes.className = "opcoes-tempo";
  formulario.temposFalecimento.forEach((t) => {
    const rotuloOpcao = document.createElement("label");
    rotuloOpcao.className = "opcao-tempo";
    rotuloOpcao.classList.toggle("marcada", ed.tempo === t.chave);
    rotuloOpcao.innerHTML = `<input type="checkbox" /><span class="opcao-tempo__texto"></span>`;
    rotuloOpcao.querySelector(".opcao-tempo__texto").textContent = t.rotulo;
    const marca = rotuloOpcao.querySelector("input");
    marca.checked = ed.tempo === t.chave;
    marca.addEventListener("change", () => {
      // escolher outro tempo guarda o que já tinha sido digitado (se havia nome) como intenção
      if (ed.tempo && ed.tempo !== t.chave) commitarEditor();
      ed.tempo = marca.checked ? t.chave : null;
      if (!marca.checked) ed.valor = "";
      alterouLista();
      renderizarEditor();
      // o campo do nome acabou de aparecer: leva a tela até ele, de forma suave
      el("editorIntencao").querySelector("textarea")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    opcoes.appendChild(rotuloOpcao);
    if (t.dica) {
      const dica = document.createElement("span");
      dica.className = "opcao-tempo__dica";
      dica.textContent = `(${t.dica.replace(/^\(|\)$/g, "")})`;
      rotuloOpcao.appendChild(dica);
    }
  });
  caixa.appendChild(opcoes);

  if (ed.tempo) {
    const { campo, area } = criarCampoNome(cat, null, () => btnAdicionar.click());
    caixa.appendChild(campo);
    const btnAdicionar = document.createElement("button");
    btnAdicionar.type = "button";
    btnAdicionar.className = "btn btn-contorno btn-full btn-adicionar-nome";
    btnAdicionar.textContent = "Adicionar";
    btnAdicionar.addEventListener("click", () => {
      if (!commitarEditor()) { mostrarToast("Digite o nome antes de adicionar."); area.focus(); return; }
      ed.tempo = null; // o campo fecha; escolhendo uma opção de novo, ele reabre
      alterouLista();
      renderizarEditor();
    });
    caixa.appendChild(btnAdicionar);
    setTimeout(() => area.focus({ preventScroll: true }), 50);
  }

  const btnMais = document.createElement("button");
  btnMais.type = "button";
  btnMais.className = "btn btn-dourado btn-full btn-mais";
  btnMais.textContent = "+ Adicionar mais intenções";
  btnMais.addEventListener("click", () => {
    commitarEditor(); // se havia um nome digitado, entra na lista
    lista.editor = editorVazio();
    alterouLista();
    renderizarEditor({ rolar: true });
  });
  caixa.appendChild(btnMais);
}

// Se o campo tem um nome digitado, vira uma intenção da lista. Retorna true quando adicionou algo.
function commitarEditor() {
  const ed = lista.editor;
  const nome = (ed.valor || "").trim();
  if (!ed.categoria || !nome) return false;
  const cat = categoriaPorChave(ed.categoria);
  if (!cat) return false;
  const tempo = cat.tipo === "falecimento" ? ed.tempo : "";
  if (cat.tipo === "falecimento" && !tempo) return false;
  lista.itens.push(criarItem(ed.categoria, nome, tempo || ""));
  ed.valor = "";
  return true;
}

function renderizarLista() {
  renderizarEntradas();
  renderizarEditor();
  atualizarSelo();
}

/* ---------- Janelinha de categorias ---------- */
function abrirCategorias() {
  const caixa = el("categoriasOpcoes");
  caixa.innerHTML = "";
  formulario.categorias.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-dourado btn-full";
    btn.textContent = cat.rotulo;
    btn.addEventListener("click", () => {
      // trocar de categoria guarda o que já estava digitado
      commitarEditor();
      lista.editor = { categoria: cat.chave, tempo: null, valor: "" };
      fechar(modalCategorias);
      alterouLista();
      renderizarEditor();
    });
    caixa.appendChild(btn);
  });
  abrir(modalCategorias);
}
el("btnVoltarCategorias").addEventListener("click", () => fechar(modalCategorias));

/* ---------- Rodapé: Voltar / Visualizar rascunho / Enviar ---------- */
async function voltarParaHorarios() {
  if (!lista) return;
  if (commitarEditor()) { lista.editor = editorVazio(); alterouLista(); }
  await persistirRascunho(); // o que já foi digitado fica salvo como rascunho
  fechar(modalLista);
  lista = null;
  abrirEscolhaDeLista();
}
el("btnListaVoltar").addEventListener("click", voltarParaHorarios);

el("btnListaVisualizar").addEventListener("click", () => {
  if (commitarEditor()) { lista.editor = editorVazio(); alterouLista(); renderizarEditor(); }
  const conteudo = el("previaConteudo");
  conteudo.innerHTML = "";
  const grupos = formulario.categorias
    .map((c) => ({ rotulo: c.rotulo, itens: lista.itens.filter((i) => i.categoria === c.chave) }))
    .filter((g) => g.itens.length > 0);
  const orfas = lista.itens.filter((i) => !categoriaPorChave(i.categoria));
  if (orfas.length) grupos.push({ rotulo: "Outras intenções", itens: orfas });
  if (grupos.length === 0) {
    conteudo.innerHTML = `<p class="categoria-intencao__vazio">Nenhuma intenção adicionada ainda.</p>`;
  }
  grupos.forEach((g) => {
    const bloco = document.createElement("div");
    bloco.className = "previa-grupo";
    const h = document.createElement("h4");
    h.textContent = g.rotulo;
    bloco.appendChild(h);
    const nomes = document.createElement("ul");
    g.itens.forEach((i) => {
      const li = document.createElement("li");
      li.textContent = i.texto;
      if (i.destaque) li.classList.add("previa-destaque");
      nomes.appendChild(li);
    });
    bloco.appendChild(nomes);
    conteudo.appendChild(bloco);
  });
  el("previaSubtitulo").textContent =
    `Missa das ${formatarHoraSimples(lista.hora)} — ${formatarDataComDiaSemana(lista.iso)}. É assim que as suas intenções vão aparecer na lista.`;
  abrir(modalPrevia);
});
el("btnVoltarPrevia").addEventListener("click", () => fechar(modalPrevia));

el("btnListaEnviar").addEventListener("click", async () => {
  if (!lista) return;
  const btn = el("btnListaEnviar");
  const sessao = lista;
  if (commitarEditor()) { sessao.editor = editorVazio(); alterouLista(); renderizarEditor(); }

  const status = statusMissaEspecifica(sessao.iso, sessao.hora, configAtual.horasAntes);
  if (!status.aberta) { mostrarToast("O prazo desta lista terminou."); encerrarListaAberta(); return; }
  if (sessao.itens.length === 0 && !sessao.assinaturaEnviada) {
    mostrarToast("Adicione pelo menos uma intenção antes de enviar.");
    return;
  }
  const assinatura = assinaturaDe(sessao.itens);
  if (assinatura === sessao.assinaturaEnviada) {
    mostrarToast("Esta lista já foi enviada. Faça uma alteração para enviar de novo.");
    return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Enviando...";
  try {
    clearTimeout(sessao.temporizador);
    await enviarIntencoesDaPessoa({
      dataMissa: sessao.iso, horaMissa: sessao.hora, nome: usuarioAtual.nome,
      telefoneDigits: usuarioAtual.telefoneDigits, assinatura,
      itens: sessao.itens.map((i) => ({ id: i.id, categoria: i.categoria, nome: i.nome, tempo: i.tempo, texto: i.texto, destaque: i.destaque }))
    });
    sessao.assinaturaEnviada = assinatura;
    atualizarSelo();
    if (sessao.itens.length === 0) { mostrarToast("Suas intenções foram retiradas da lista."); return; }
    mostrarPopupEnviado();
  } catch (err) {
    console.error(err);
    mostrarToast("Não foi possível enviar. Verifique sua conexão e tente de novo.");
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

/* ---------- Depois de enviar: contribuição (PIX) ---------- */
function pixConfigurado() {
  const p = formulario.pix;
  return p.ativo && (p.qrCodeUrl || p.chave);
}

function mostrarPopupEnviado() {
  el("enviadoTitulo").textContent = formulario.textos.enviado;
  const pergunta = el("enviadoPergunta");
  const acoes = el("enviadoAcoes");
  if (pixConfigurado()) {
    pergunta.textContent = formulario.textos.pergunta;
    pergunta.classList.remove("oculto");
    acoes.innerHTML = `
      <button type="button" class="btn btn-contorno" id="btnContribuirNao">Não</button>
      <button type="button" class="btn btn-dourado" id="btnContribuirSim">Sim</button>`;
    el("btnContribuirNao").addEventListener("click", () => fechar(modalEnviado)); // fecha com a animação do modal
    el("btnContribuirSim").addEventListener("click", () => { fechar(modalEnviado); abrirPix(); });
  } else {
    pergunta.textContent = "Sua lista continua salva — você pode voltar e editar enquanto ela estiver aberta.";
    acoes.innerHTML = `<button type="button" class="btn btn-dourado" id="btnEnviadoOk">Ok</button>`;
    el("btnEnviadoOk").addEventListener("click", () => fechar(modalEnviado));
  }
  abrir(modalEnviado);
}

function abrirPix() {
  const p = formulario.pix;
  // cada frase da mensagem vai numa linha própria (ex.: "Sua contribuição ajuda a manter a nossa obra." /
  // "Nossa Senhora lhe pague!"); quebras de linha escritas no painel também são respeitadas
  el("pixMensagem").textContent = String(p.mensagem || "").replace(/([.!?])[ \t]+(?=\S)/g, "$1\n");
  const img = el("pixQrCode");
  if (p.qrCodeUrl) { img.src = p.qrCodeUrl; img.classList.remove("oculto"); } else { img.removeAttribute("src"); img.classList.add("oculto"); }
  const ben = el("pixBeneficiario");
  ben.textContent = p.beneficiario ? `Favorecido: ${p.beneficiario}` : "";
  ben.classList.toggle("oculto", !p.beneficiario);
  el("pixChave").textContent = p.chave;
  el("pixChave").classList.add("oculto");
  el("btnCopiarPix").textContent = "Copiar PIX copia e cola";
  el("btnCopiarPix").classList.remove("btn-copiado");
  el("pixChaveCaixa").classList.toggle("oculto", !p.chave);
  abrir(modalPix);
}
el("btnFecharPix").addEventListener("click", () => fechar(modalPix));
let temporizadorCopiado = null;
function marcarPixCopiado() {
  const btn = el("btnCopiarPix");
  btn.textContent = "✓ Código copiado!";
  btn.classList.add("btn-copiado");
  mostrarToast("Código PIX copiado! Cole no seu aplicativo do banco.");
  clearTimeout(temporizadorCopiado);
  temporizadorCopiado = setTimeout(() => {
    btn.textContent = "Copiar PIX copia e cola";
    btn.classList.remove("btn-copiado");
  }, 3000);
}
// toque no botão = código copiado na hora. Se o aparelho bloquear a cópia automática, o código
// aparece na tela já selecionado, pra pessoa só copiar.
el("btnCopiarPix").addEventListener("click", async () => {
  const texto = formulario.pix.chave;
  try {
    await navigator.clipboard.writeText(texto);
    marcarPixCopiado();
    return;
  } catch { /* tenta o jeito antigo abaixo */ }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, texto.length);
    const copiou = document.execCommand("copy");
    campo.remove();
    if (copiou) { marcarPixCopiado(); return; }
  } catch { /* cai no último recurso */ }
  const caixa = el("pixChave");
  caixa.classList.remove("oculto");
  const range = document.createRange();
  range.selectNodeContents(caixa);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  mostrarToast("Não consegui copiar sozinho — o código está selecionado, é só copiar.");
});

/* ---------- Lista que fecha enquanto a pessoa ainda está nela ---------- */
function encerrarListaAberta() {
  fecharTodosOsModais();
  const sessao = lista;
  lista = null;
  if (sessao) clearTimeout(sessao.temporizador);
  renderizarDia();
}

function conferirPrazoDaListaAberta() {
  if (!lista || !configAtual) return;
  const status = statusMissaEspecifica(lista.iso, lista.hora, configAtual.horasAntes);
  if (!status.aberta) {
    mostrarToast("O prazo desta lista terminou — ela foi encerrada.");
    encerrarListaAberta();
  }
}

/* ---------- Dados em tempo real ---------- */
let limpezaFeita = false;
ouvirConfigIntencoes((config) => {
  configAtual = config;
  renderizarDia();
  conferirPrazoDaListaAberta();
  // apaga os rascunhos das listas que já fecharam (uma vez por abertura da página)
  if (!limpezaFeita) {
    limpezaFeita = true;
    limparRascunhosVencidos(config.horasAntes).catch((err) => console.error(err));
  }
});
ouvirFormularioIntencoes((form) => {
  formulario = form;
  // se mudaram as categorias no painel enquanto a lista está aberta, redesenha sem perder o que já foi adicionado
  if (lista) {
    if (lista.editor.categoria && !categoriaPorChave(lista.editor.categoria)) lista.editor = editorVazio();
    lista.itens.forEach((i) => { if (categoriaPorChave(i.categoria)) recalcularItem(i); });
    renderizarLista();
  }
});

// reavalia periodicamente: fecha/abre listas sozinho, sem precisar recarregar a página
setInterval(() => { renderizarDia(); conferirPrazoDaListaAberta(); }, 30000);
