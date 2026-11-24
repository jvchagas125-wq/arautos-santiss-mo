// Texto com formatação simples (negrito, itálico e tamanhos de letra) — usado na caixa dos banners.
//
// SEGURANÇA: as regras do banco permitem escrever em "banners" sem login, então NADA do que vem do banco é colocado
// na página como HTML. Todo texto formatado passa por "limparTextoFormatado", que lê o HTML num documento inerte e
// reconstrói só o que está na lista abaixo (b, i, br, div/p e span[data-t] com tamanhos conhecidos).
// Qualquer outra coisa (scripts, links, imagens, estilos, atributos...) é descartada.

const TAMANHOS = { p: "Letra pequena", n: "Letra normal", g: "Letra grande", gg: "Letra maior" };
// <font size="N"> (o que o navegador cria ao mudar o tamanho) → nosso tamanho
const FONT_PARA_TAMANHO = { "1": "p", "2": "p", "3": "n", "4": "g", "5": "g", "6": "gg", "7": "gg" };
const BLOCOS = new Set(["DIV", "P"]);
export const LIMITE_HTML = 4000;

function copiarFilhos(origem, destino) {
  origem.childNodes.forEach((no) => {
    const novo = converterNo(no);
    if (novo) destino.appendChild(novo);
  });
}

function converterNo(no) {
  if (no.nodeType === 3) return document.createTextNode(no.nodeValue);
  if (no.nodeType !== 1) return null;
  const tag = no.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") return null;
  if (tag === "BR") return document.createElement("br");
  let novo = null;
  if (tag === "B" || tag === "STRONG") novo = document.createElement("b");
  else if (tag === "I" || tag === "EM") novo = document.createElement("i");
  else if (BLOCOS.has(tag)) novo = document.createElement("div");
  else if (tag === "SPAN" && TAMANHOS[no.getAttribute("data-t")]) {
    novo = document.createElement("span");
    novo.setAttribute("data-t", no.getAttribute("data-t"));
  } else if (tag === "FONT" && FONT_PARA_TAMANHO[no.getAttribute("size")]) {
    novo = document.createElement("span");
    novo.setAttribute("data-t", FONT_PARA_TAMANHO[no.getAttribute("size")]);
  }
  if (!novo) { // marcação desconhecida: descarta a marcação, mantém o texto dentro dela
    const frag = document.createDocumentFragment();
    copiarFilhos(no, frag);
    return frag;
  }
  copiarFilhos(no, novo);
  return novo;
}

// Devolve um <div> novo e seguro com o conteúdo permitido do HTML recebido.
function construirSeguro(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html || "")}</body>`, "text/html");
  const raiz = document.createElement("div");
  copiarFilhos(doc.body, raiz);
  return raiz;
}

// Texto simples (com quebras de linha) do que há num elemento já seguro.
function extrairTexto(raiz) {
  let saida = "";
  const andar = (no) => {
    no.childNodes.forEach((f) => {
      if (f.nodeType === 3) saida += f.nodeValue;
      else if (f.tagName === "BR") saida += "\n";
      else if (f.nodeType === 1) {
        const bloco = BLOCOS.has(f.tagName) || f.tagName === "DIV";
        if (bloco && saida && !saida.endsWith("\n")) saida += "\n";
        andar(f);
        if (bloco && saida && !saida.endsWith("\n")) saida += "\n";
      }
    });
  };
  andar(raiz);
  return saida.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function limparTextoFormatado(html) {
  const raiz = construirSeguro(html);
  const limpo = raiz.innerHTML.trim();
  return extrairTexto(raiz) ? limpo : "";
}
export const textoSimplesDoFormatado = (html) => extrairTexto(construirSeguro(html));

// Coloca o texto formatado dentro de "destino" (sem usar innerHTML com o texto do banco).
export function mostrarTextoFormatado(destino, html) {
  destino.textContent = "";
  copiarFilhos(construirSeguro(html), destino);
}

// Texto simples antigo (com quebras de linha) → HTML equivalente, para abrir no editor.
export function textoSimplesParaHtml(texto) {
  const div = document.createElement("div");
  String(texto || "").split("\n").forEach((linha, i) => {
    if (i > 0) div.appendChild(document.createElement("br"));
    div.appendChild(document.createTextNode(linha));
  });
  return div.innerHTML;
}

/* ---------------- Editor (painel) ---------------- */
// Devolve { el, obter() -> { texto, html }, definir(html), limpar(), contagem() }.
export function criarEditorTextoFormatado({ valorHtml = "", placeholder = "", maxCaracteres = 600 } = {}) {
  const el = document.createElement("div");
  el.className = "editor-formatado";

  const barra = document.createElement("div");
  barra.className = "editor-formatado__barra";
  const area = document.createElement("div");
  area.className = "editor-formatado__area";
  area.contentEditable = "true";
  area.setAttribute("role", "textbox");
  area.setAttribute("aria-multiline", "true");
  area.dataset.placeholder = placeholder;
  const rodape = document.createElement("div");
  rodape.className = "editor-formatado__rodape";
  const contador = document.createElement("span");
  rodape.appendChild(contador);

  const botao = (rotulo, titulo, classe, aoClicar) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "editor-formatado__botao " + (classe || "");
    b.title = titulo;
    b.setAttribute("aria-label", titulo);
    b.innerHTML = rotulo;
    // mousedown/touchstart com preventDefault: o clique não tira a seleção do texto
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    b.addEventListener("click", () => { area.focus(); aoClicar(); depoisDeMudar(); });
    barra.appendChild(b);
    return b;
  };

  function depoisDeMudar() {
    // o navegador cria <font size="N"> ao mudar o tamanho: troca por <span data-t="..."> (que o site entende)
    area.querySelectorAll("font").forEach((f) => {
      const t = FONT_PARA_TAMANHO[f.getAttribute("size")];
      const span = document.createElement("span");
      if (t) span.setAttribute("data-t", t);
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    atualizarContador();
  }
  function texto() { return extrairTexto(construirSeguro(area.innerHTML)); }
  function atualizarContador() {
    const n = texto().length;
    contador.textContent = `${n}/${maxCaracteres}`;
    contador.classList.toggle("editor-formatado__contador--estourou", n > maxCaracteres);
  }

  botao("<strong>N</strong>", "Negrito", "", () => document.execCommand("bold"));
  botao("<em>I</em>", "Itálico", "", () => document.execCommand("italic"));
  const sep = document.createElement("span"); sep.className = "editor-formatado__sep"; barra.appendChild(sep);
  const fontes = { p: "2", n: "3", g: "5", gg: "6" };
  Object.entries(TAMANHOS).forEach(([chave, nome]) => {
    botao("A", nome, `editor-formatado__botao--tam-${chave}`, () => document.execCommand("fontSize", false, fontes[chave]));
  });
  const sep2 = document.createElement("span"); sep2.className = "editor-formatado__sep"; barra.appendChild(sep2);
  botao("✕", "Tirar a formatação do trecho selecionado", "editor-formatado__botao--limpar", () => document.execCommand("removeFormat"));

  // colar sempre como texto simples (não traz fontes e cores de outros lugares)
  area.addEventListener("paste", (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, t);
  });
  area.addEventListener("input", depoisDeMudar);
  area.addEventListener("focus", () => {
    try { document.execCommand("styleWithCSS", false, false); document.execCommand("defaultParagraphSeparator", false, "div"); } catch { /* ok */ }
  });

  function definir(html) {
    area.textContent = "";
    copiarFilhos(construirSeguro(html), area);
    atualizarContador();
  }
  definir(valorHtml);

  el.append(barra, area, rodape);
  return {
    el,
    definir,
    limpar: () => definir(""),
    obter() {
      depoisDeMudar();
      return { texto: texto(), html: limparTextoFormatado(area.innerHTML) };
    },
    estourou: () => texto().length > maxCaracteres,
    maxCaracteres
  };
}
