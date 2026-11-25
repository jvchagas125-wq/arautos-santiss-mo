// Painel: "Inscrever pessoa" num curso (Inscrições de cursos > Inscritos (CRM) > curso > "＋ Inscrever pessoa").
// Monta o MESMO formulário que a pessoa vê no site (nome, os dados marcados no curso e as perguntas, inclusive as
// que só aparecem depois de outra resposta e o aceite de e-mail), mais o telefone, que é o que identifica a
// inscrição (uma por pessoa e curso). Validação e documento gravado são os mesmos do site (js/cursos-comum.js).
import { aplicarMascaraTelefone, criarCampoData, hojeIso } from "./utils.js";
import { CAMPOS_PADRAO, perguntaVisivel, opcoesDaPergunta, validarInscricao, montarInscricao, mascaraCpf } from "./cursos-comum.js";

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Só os dígitos do telefone, sem o 55 do país: é assim que o site guarda (DDD + número = 10 ou 11 dígitos).
export function digitosDoTelefone(texto) {
  let d = String(texto || "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

/* opcoes: { jaInscrito(telefoneDigits) → bool, salvar(dados) → Promise, aoConcluir(), aoCancelar(), toast(texto) }
   Devolve o <form> pronto para ser colocado na janela. */
export function montarFormularioDeInscricaoNoPainel(curso, opcoes) {
  const form = criar("form", "curso-form curso-form--painel");
  form.noValidate = true;
  const respostas = {};
  const padrao = {};
  let nome = "";
  let telefone = "";
  let aceitaContato = false;
  const erroDe = new Map();

  function campo(chave, rotulo, obrigatorio, criarEntrada) {
    const caixa = criar("div", "campo");
    const label = criar("label", "", obrigatorio ? `${rotulo} *` : rotulo);
    if (!obrigatorio) {
      label.appendChild(document.createTextNode(" "));
      label.appendChild(criar("span", "campo-opcional", "(Opcional)"));
    }
    caixa.appendChild(label);
    caixa.appendChild(criarEntrada());
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

  // nome e telefone: sempre pedidos (o telefone identifica a inscrição e é o WhatsApp da pessoa)
  form.appendChild(campo("nome", "Nome completo", true, () =>
    entradaTexto("text", nome, (i) => { nome = i.value; }, { autocomplete: "off", maxlength: "120" })));
  const pedeTelefoneNoCurso = !!(curso.campos.telefone && curso.campos.telefone.ativo);
  form.appendChild(campo("telefoneId", "Telefone / WhatsApp", true, () =>
    entradaTexto("tel", telefone, (i) => { i.value = aplicarMascaraTelefone(i.value); telefone = i.value; },
      { inputmode: "numeric", placeholder: "(00) 00000-0000", autocomplete: "off" })));

  // dados pedidos no curso (o telefone já foi pedido acima: não repete)
  CAMPOS_PADRAO.forEach(({ chave, rotulo, tipo }) => {
    const cfg = curso.campos[chave];
    if (!cfg || !cfg.ativo || chave === "telefone") return;
    padrao[chave] = "";
    form.appendChild(campo(chave, rotulo, cfg.obrigatorio, () => {
      const extras = { maxlength: "120", autocomplete: "off" };
      let tipoInput = "text";
      if (tipo === "email") { tipoInput = "email"; extras.inputmode = "email"; }
      if (tipo === "cpf") { extras.inputmode = "numeric"; extras.placeholder = "000.000.000-00"; }
      if (tipo === "instagram") { extras.placeholder = "@usuario"; extras.autocapitalize = "none"; extras.autocorrect = "off"; extras.spellcheck = "false"; }
      if (tipo === "data") {
        return criarCampoData({ valorIso: padrao[chave], maxIso: hojeIso(), anoInicial: new Date().getFullYear() - 30, aoMudar: (iso) => { padrao[chave] = iso; } });
      }
      return entradaTexto(tipoInput, padrao[chave], (i) => {
        if (tipo === "cpf") i.value = mascaraCpf(i.value);
        padrao[chave] = i.value;
      }, extras);
    }));
  });

  // perguntas (as extras só aparecem depois da resposta que as abre)
  const blocosPergunta = new Map();
  function atualizarVisibilidade() {
    curso.perguntas.forEach((p) => {
      const bloco = blocosPergunta.get(p.id);
      if (bloco) bloco.classList.toggle("oculto", !perguntaVisivel(p, curso.perguntas, respostas));
    });
  }
  curso.perguntas.forEach((p) => {
    const bloco = campo("p:" + p.id, p.rotulo, p.obrigatoria, () => {
      const r = respostas[p.id];
      if (p.tipo === "texto") return entradaTexto("text", r || "", (i) => { respostas[p.id] = i.value; }, { maxlength: "300" });
      if (p.tipo === "data") return criarCampoData({ valorIso: r, aoMudar: (iso) => { respostas[p.id] = iso; }, anosAFrente: 5 });
      if (p.tipo === "textolongo") {
        const ta = document.createElement("textarea");
        ta.rows = 3; ta.maxLength = 2000; ta.value = r || "";
        ta.addEventListener("input", () => { respostas[p.id] = ta.value; });
        return ta;
      }
      const grupo = criar("div", "curso-opcoes");
      const multipla = p.tipo === "multipla";
      const nomeGrupo = `adm-${curso.id}-${p.id}`;
      opcoesDaPergunta(p).forEach((op) => {
        const rotuloOp = criar("label", "curso-opcao");
        const input = document.createElement("input");
        input.type = multipla ? "checkbox" : "radio";
        input.name = nomeGrupo;
        input.value = op;
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

  if (curso.pedirAceiteContato) {
    const caixaAceite = criar("div", "curso-aceite");
    const lbl = criar("label", "curso-aceite__rotulo");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => { aceitaContato = cb.checked; });
    lbl.append(cb, criar("span", "", "A pessoa aceita ser contactada para receber convites e informativos."));
    caixaAceite.appendChild(lbl);
    form.appendChild(caixaAceite);
  }

  const botoes = criar("div", "curso-form__botoes");
  const enviar = criar("button", "btn btn-dourado btn-full", "Inscrever pessoa");
  enviar.type = "submit";
  const cancelar = criar("button", "btn btn-contorno btn-full", "Cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", () => opcoes.aoCancelar && opcoes.aoCancelar());
  botoes.append(enviar, cancelar);
  form.appendChild(botoes);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const digitos = digitosDoTelefone(telefone);
    const dadosPadrao = { ...padrao };
    if (pedeTelefoneNoCurso) dadosPadrao.telefone = telefone;
    const { erros } = validarInscricao(curso, { nome, padrao: dadosPadrao, respostas, aceitaContato });
    if (digitos.length !== 10 && digitos.length !== 11) erros.telefoneId = "Digite um telefone válido, com DDD.";
    else if (opcoes.jaInscrito && opcoes.jaInscrito(digitos)) erros.telefoneId = "Esta pessoa já está inscrita neste curso.";
    delete erros.telefone; // o telefone é validado acima (campo único)
    erroDe.forEach(({ caixa, erro }, chave) => {
      erro.textContent = erros[chave] || "";
      caixa.classList.toggle("invalido", !!erros[chave]);
    });
    if (Object.keys(erros).length) {
      const primeiro = [...erroDe.values()].find(({ caixa }) => caixa.classList.contains("invalido"));
      if (primeiro) primeiro.caixa.scrollIntoView({ behavior: "smooth", block: "center" });
      opcoes.toast && opcoes.toast("Confira os campos marcados.");
      return;
    }
    enviar.disabled = true;
    enviar.textContent = "Inscrevendo...";
    try {
      const dados = montarInscricao(curso, { telefoneDigits: digitos }, { nome, padrao: dadosPadrao, respostas, aceitaContato });
      dados.origem = "painel"; // marca que foi o painel que inscreveu (não a própria pessoa)
      await opcoes.salvar(dados);
      opcoes.aoConcluir && opcoes.aoConcluir(dados);
    } catch (err) {
      console.error(err);
      opcoes.toast && opcoes.toast("Não foi possível inscrever agora. Verifique a conexão e tente de novo.");
      enviar.disabled = false;
      enviar.textContent = "Inscrever pessoa";
    }
  });
  return form;
}
