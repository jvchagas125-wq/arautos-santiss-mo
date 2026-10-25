// Página pública "Inscrições de cursos": cada curso/evento é uma lista fechada; ao abrir, a pessoa vê
// a imagem, as observações e o formulário de inscrição (cadastrado pelo administrador no painel).
import { exigirCadastro } from "./auth.js";
import {
  inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, linkificarTexto, definirSrcOtimizado,
  aplicarMascaraTelefone, formatarDataBR
} from "./utils.js";
import {
  obterConfiguracoesGerais, ouvirCursos, inscricoesDaPessoa, salvarInscricao, excluirInscricao, ouvirAvisosDoCurso
} from "./dados.js";
import {
  CAMPOS_PADRAO, perguntaVisivel, opcoesDaPergunta, validarInscricao, montarInscricao, mascaraCpf,
  valorComoTexto, idInscricao
} from "./cursos-comum.js";

inicializarNavegacao("cursos");

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
}).catch((err) => console.error("Erro ao carregar configurações:", err));

const lista = document.getElementById("listaCursos");
const avisoSemCursos = document.getElementById("avisoSemCursos");

let usuario = null;
const minhasInscricoes = new Map(); // cursoId -> inscrição
const abertos = new Set();           // cursos que a pessoa abriu
const cartoes = new Map();           // cursoId -> { el, assinatura, atualizar() }
let ultimosCursos = [];

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

/* ---------- Formulário de inscrição ---------- */
function montarFormulario(curso, existente, aoConcluir) {
  const form = criar("form", "curso-form");
  form.noValidate = true;
  const respostas = {};
  const padrao = {};
  if (existente) {
    Object.assign(padrao, existente.padrao || {});
    (existente.itens || []).forEach((it) => { respostas[it.id] = it.valor; });
  }
  let nome = existente ? existente.nome : usuario.nome || "";

  const erroDe = new Map(); // chave -> elemento de erro
  function campo(chave, rotulo, obrigatorio, criarEntrada) {
    const caixa = criar("div", "campo");
    const label = criar("label", "", obrigatorio ? `${rotulo} *` : rotulo);
    caixa.appendChild(label);
    caixa.appendChild(criarEntrada(label));
    const erro = criar("span", "campo-erro");
    caixa.appendChild(erro);
    erroDe.set(chave, { caixa, erro });
    return caixa;
  }
  function entradaTexto(tipo, valor, aoMudar, extra = {}) {
    const input = document.createElement("input");
    input.type = tipo;
    input.value = valor || "";
    Object.entries(extra).forEach(([k, v]) => input.setAttribute(k, v));
    input.addEventListener("input", () => aoMudar(input));
    return input;
  }

  // nome completo (sempre)
  form.appendChild(campo("nome", "Nome completo", true, () =>
    entradaTexto("text", nome, (i) => { nome = i.value; }, { autocomplete: "name", maxlength: "120" })));

  // dados pedidos pelo administrador
  CAMPOS_PADRAO.forEach(({ chave, rotulo, tipo }) => {
    const cfg = curso.campos[chave];
    if (!cfg || !cfg.ativo) return;
    if (padrao[chave] === undefined) padrao[chave] = chave === "telefone" ? (usuario.telefone || "") : "";
    form.appendChild(campo(chave, rotulo, cfg.obrigatorio, () => {
      const extras = { maxlength: "120" };
      let tipoInput = "text";
      if (tipo === "email") { tipoInput = "email"; extras.autocomplete = "email"; extras.inputmode = "email"; }
      if (tipo === "telefone") { tipoInput = "tel"; extras.inputmode = "numeric"; extras.placeholder = "(00) 00000-0000"; extras.autocomplete = "tel"; }
      if (tipo === "cpf") { extras.inputmode = "numeric"; extras.placeholder = "000.000.000-00"; }
      if (tipo === "data") tipoInput = "date";
      return entradaTexto(tipoInput, padrao[chave], (i) => {
        if (tipo === "cpf") i.value = mascaraCpf(i.value);
        if (tipo === "telefone") i.value = aplicarMascaraTelefone(i.value);
        padrao[chave] = i.value;
      }, extras);
    }));
  });

  // perguntas (com as que só aparecem depois de outra resposta)
  const blocosPergunta = new Map();
  function atualizarVisibilidade() {
    curso.perguntas.forEach((p) => {
      const bloco = blocosPergunta.get(p.id);
      if (bloco) bloco.classList.toggle("oculto", !perguntaVisivel(p, curso.perguntas, respostas));
    });
  }
  curso.perguntas.forEach((p) => {
    const obrigatoria = p.obrigatoria;
    const bloco = campo("p:" + p.id, p.rotulo, obrigatoria, () => {
      const r = respostas[p.id];
      if (p.tipo === "texto") return entradaTexto("text", r || "", (i) => { respostas[p.id] = i.value; }, { maxlength: "300" });
      if (p.tipo === "data") return entradaTexto("date", r || "", (i) => { respostas[p.id] = i.value; });
      if (p.tipo === "textolongo") {
        const ta = document.createElement("textarea");
        ta.rows = 3; ta.maxLength = 2000; ta.value = r || "";
        ta.addEventListener("input", () => { respostas[p.id] = ta.value; });
        return ta;
      }
      const grupo = criar("div", "curso-opcoes");
      const multipla = p.tipo === "multipla";
      const nomeGrupo = `${curso.id}-${p.id}`;
      opcoesDaPergunta(p).forEach((op) => {
        const rotuloOp = criar("label", "curso-opcao");
        const input = document.createElement("input");
        input.type = multipla ? "checkbox" : "radio";
        input.name = nomeGrupo;
        input.value = op;
        input.checked = multipla ? Array.isArray(r) && r.includes(op) : r === op;
        input.addEventListener("change", () => {
          if (multipla) {
            const atual = Array.isArray(respostas[p.id]) ? [...respostas[p.id]] : [];
            respostas[p.id] = input.checked ? [...atual, op] : atual.filter((x) => x !== op);
          } else {
            respostas[p.id] = op;
          }
          atualizarVisibilidade();
        });
        rotuloOp.appendChild(input);
        rotuloOp.appendChild(criar("span", "", op));
        grupo.appendChild(rotuloOp);
      });
      return grupo;
    });
    if (p.condicao) bloco.classList.add("curso-pergunta--extra");
    blocosPergunta.set(p.id, bloco);
    form.appendChild(bloco);
  });
  atualizarVisibilidade();

  const nota = criar("p", "curso-form__nota", "Seus dados serão usados somente para a organização deste curso ou evento.");
  form.appendChild(nota);
  const botoes = criar("div", "curso-form__botoes");
  const enviar = criar("button", "btn btn-dourado btn-full", existente ? "Salvar alterações" : "Enviar inscrição");
  enviar.type = "submit";
  botoes.appendChild(enviar);
  if (existente) {
    const voltar = criar("button", "btn btn-contorno btn-full", "Cancelar edição");
    voltar.type = "button";
    voltar.addEventListener("click", () => aoConcluir(existente));
    botoes.appendChild(voltar);
  }
  form.appendChild(botoes);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { erros, ok } = validarInscricao(curso, { nome, padrao, respostas });
    erroDe.forEach(({ caixa, erro }, chave) => {
      erro.textContent = erros[chave] || "";
      caixa.classList.toggle("invalido", !!erros[chave]);
    });
    if (!ok) {
      const primeiro = [...erroDe.values()].find(({ caixa }) => caixa.classList.contains("invalido"));
      if (primeiro) primeiro.caixa.scrollIntoView({ behavior: "smooth", block: "center" });
      mostrarToast("Confira os campos marcados.");
      return;
    }
    enviar.disabled = true;
    enviar.textContent = "Enviando...";
    try {
      const dados = montarInscricao(curso, usuario, { nome, padrao, respostas });
      await salvarInscricao(dados);
      const salva = { id: idInscricao(curso.id, usuario.telefoneDigits), ...dados };
      minhasInscricoes.set(curso.id, salva);
      mostrarToast(existente ? "Inscrição atualizada!" : "Inscrição enviada! Que Deus abençoe sua caminhada.");
      aoConcluir(salva);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível enviar agora. Verifique a internet e tente de novo.");
      enviar.disabled = false;
      enviar.textContent = existente ? "Salvar alterações" : "Enviar inscrição";
    }
  });
  return form;
}

/* ---------- Quadro de avisos do curso (só para inscritos) ---------- */
function montarAvisos(curso) {
  const caixa = criar("div", "curso-avisos");
  caixa.appendChild(criar("h4", "curso-avisos__titulo", "Avisos do curso"));
  const corpo = criar("div", "curso-avisos__lista");
  corpo.appendChild(criar("p", "curso-avisos__vazio", "Nenhum aviso por enquanto."));
  caixa.appendChild(corpo);
  const parar = ouvirAvisosDoCurso(curso.id, (avisos) => {
    corpo.innerHTML = "";
    if (!avisos.length) { corpo.appendChild(criar("p", "curso-avisos__vazio", "Nenhum aviso por enquanto.")); return; }
    avisos.forEach((a) => {
      const item = criar("div", "curso-aviso");
      item.appendChild(criar("strong", "curso-aviso__titulo", a.titulo));
      if (a.criadoEmMs) item.appendChild(criar("span", "curso-aviso__data", formatarDataBR(new Date(a.criadoEmMs).toISOString().slice(0, 10))));
      const txt = criar("p", "curso-aviso__texto");
      linkificarTexto(a.texto, txt);
      item.appendChild(txt);
      corpo.appendChild(item);
    });
  });
  caixa._parar = parar;
  return caixa;
}

/* ---------- Cartão (lista fechada) de um curso ---------- */
function criarCartao(curso) {
  const cartao = criar("div", "curso-card");
  const cab = criar("button", "curso-card__cab");
  cab.type = "button";
  cab.setAttribute("aria-expanded", "false");
  if (curso.imagemUrl) {
    const mini = criar("img", "curso-card__mini");
    mini.alt = "";
    mini.loading = "lazy";
    definirSrcOtimizado(mini, curso.imagemUrl, 120);
    cab.appendChild(mini);
  }
  const titulos = criar("span", "curso-card__titulos");
  titulos.appendChild(criar("span", "curso-card__nome", curso.nome));
  const selo = criar("span", "curso-card__selo");
  titulos.appendChild(selo);
  cab.appendChild(titulos);
  cab.insertAdjacentHTML("beforeend", '<svg class="curso-card__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>');
  cartao.appendChild(cab);

  const corpo = criar("div", "curso-card__corpo oculto");
  cartao.appendChild(corpo);
  let pararAvisos = null;

  function desenharCorpo() {
    if (pararAvisos) { pararAvisos(); pararAvisos = null; }
    corpo.innerHTML = "";
    const minha = minhasInscricoes.get(curso.id);
    selo.textContent = minha ? "✓ Você está inscrito(a)" : "Inscrições abertas";
    selo.classList.toggle("curso-card__selo--ok", !!minha);
    if (curso.imagemUrl) {
      const img = criar("img", "curso-card__imagem");
      img.alt = curso.nome;
      img.loading = "lazy";
      definirSrcOtimizado(img, curso.imagemUrl, 900);
      corpo.appendChild(img);
    }
    if (curso.observacoes) {
      const obs = criar("div", "curso-card__obs");
      linkificarTexto(curso.observacoes, obs);
      corpo.appendChild(obs);
    }
    const area = criar("div", "curso-card__area");
    corpo.appendChild(area);

    const mostrarForm = (existente) => {
      area.innerHTML = "";
      area.appendChild(montarFormulario(curso, existente, () => desenharCorpo()));
    };

    if (!minha) {
      mostrarForm(null);
      return;
    }
    // já inscrito: resumo, editar/cancelar e quadro de avisos
    const ok = criar("div", "curso-inscrito");
    ok.appendChild(criar("p", "curso-inscrito__titulo", "Sua inscrição está confirmada."));
    const resumo = criar("ul", "curso-inscrito__resumo");
    const addLinha = (rot, val) => {
      if (!val) return;
      const li = criar("li");
      li.appendChild(criar("strong", "", rot + ": "));
      li.appendChild(document.createTextNode(val));
      resumo.appendChild(li);
    };
    addLinha("Nome", minha.nome);
    CAMPOS_PADRAO.forEach(({ chave, rotulo }) => addLinha(rotulo, (minha.padrao || {})[chave]));
    (minha.itens || []).forEach((it) => addLinha(it.rotulo, valorComoTexto(it.valor)));
    ok.appendChild(resumo);
    const acoes = criar("div", "curso-form__botoes");
    const editar = criar("button", "btn btn-contorno btn-full", "Editar minha inscrição");
    editar.type = "button";
    editar.addEventListener("click", () => mostrarForm(minha));
    const cancelar = criar("button", "btn btn-contorno btn-full curso-cancelar", "Cancelar minha inscrição");
    cancelar.type = "button";
    cancelar.addEventListener("click", () => {
      acoes.innerHTML = "";
      acoes.appendChild(criar("p", "curso-confirma__texto", "Tem certeza de que deseja cancelar a sua inscrição?"));
      const sim = criar("button", "btn btn-vermelho btn-full", "Sim, cancelar inscrição");
      sim.type = "button";
      const nao = criar("button", "btn btn-contorno btn-full", "Voltar");
      nao.type = "button";
      nao.addEventListener("click", () => desenharCorpo());
      sim.addEventListener("click", async () => {
        sim.disabled = true;
        try {
          await excluirInscricao(minha.id || idInscricao(curso.id, usuario.telefoneDigits));
          minhasInscricoes.delete(curso.id);
          mostrarToast("Inscrição cancelada.");
          desenharCorpo();
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível cancelar agora. Tente de novo.");
          sim.disabled = false;
        }
      });
      acoes.append(sim, nao);
    });
    acoes.append(editar, cancelar);
    ok.appendChild(acoes);
    area.appendChild(ok);
    const avisos = montarAvisos(curso);
    pararAvisos = avisos._parar;
    area.appendChild(avisos);
  }

  function alternar() {
    const abrir = corpo.classList.contains("oculto");
    corpo.classList.toggle("oculto", !abrir);
    cartao.classList.toggle("aberto", abrir);
    cab.setAttribute("aria-expanded", String(abrir));
    if (abrir) { abertos.add(curso.id); desenharCorpo(); }
    else { abertos.delete(curso.id); if (pararAvisos) { pararAvisos(); pararAvisos = null; } corpo.innerHTML = ""; }
  }
  cab.addEventListener("click", alternar);

  // estado inicial (cartão fechado: só o selo; reabre sozinho se já estava aberto antes de uma atualização)
  const minhaInicial = minhasInscricoes.get(curso.id);
  selo.textContent = minhaInicial ? "✓ Você está inscrito(a)" : "Inscrições abertas";
  selo.classList.toggle("curso-card__selo--ok", !!minhaInicial);
  if (abertos.has(curso.id)) { corpo.classList.remove("oculto"); cartao.classList.add("aberto"); cab.setAttribute("aria-expanded", "true"); desenharCorpo(); }
  return cartao;
}

function renderizar() {
  const ativos = ultimosCursos.filter((c) => c.ativo && c.nome);
  avisoSemCursos.classList.toggle("oculto", ativos.length > 0);
  const vivos = new Set();
  ativos.forEach((curso) => {
    vivos.add(curso.id);
    const assinatura = JSON.stringify(curso);
    let c = cartoes.get(curso.id);
    if (c && c.assinatura === assinatura) return;
    const el = criarCartao(curso);
    if (c) c.el.replaceWith(el);
    cartoes.set(curso.id, { el, assinatura });
  });
  cartoes.forEach((c, id) => { if (!vivos.has(id)) { c.el.remove(); cartoes.delete(id); abertos.delete(id); } });
  // mantém a ordem do painel
  lista.querySelector(".spinner")?.remove();
  ativos.forEach((curso) => lista.appendChild(cartoes.get(curso.id).el));
}

(async () => {
  usuario = await exigirCadastro();
  try {
    (await inscricoesDaPessoa(usuario.telefoneDigits)).forEach((i) => minhasInscricoes.set(i.cursoId, i));
  } catch (err) { console.error(err); }
  ouvirCursos((cursos) => { ultimosCursos = cursos; renderizar(); });
})();
