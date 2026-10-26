// Ditado por voz: um microfone dentro de cada campo de texto do site público. A pessoa toca no
// microfone, fala, e o que foi dito aparece escrito no campo — depois ela pode editar ou apagar
// como qualquer texto. Usa o reconhecimento de voz do próprio navegador (Chrome/Edge/Safari).
// O microfone aparece sempre; onde o navegador não tem esse recurso, ao tocar a pessoa é orientada
// a usar o microfone do teclado do celular.
//
// Campos que recebem o microfone: <textarea> e <input type="text"/"search">. Ficam de fora os
// somente-leitura, desabilitados, numéricos/telefone/senha/e-mail e os marcados com data-sem-voz.

const Reconhecimento = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const ICONE_MICROFONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;

/* Junta os trechos que o reconhecedor devolveu num texto só, sem repetir palavras.
   O Chrome do Android (e alguns outros) devolve, no modo contínuo, trechos "acumulados" — cada um já
   traz tudo o que foi dito até ali ("olá" / "olá tudo" / "olá tudo bem") — ou trechos que começam
   repetindo o fim do anterior. Somar tudo gera "olá olá tudo olá tudo bem". Aqui, cada trecho novo:
   - que já contém o texto anterior inteiro → substitui o anterior;
   - que já está dentro do texto anterior → é ignorado;
   - que repete as últimas palavras do anterior → entra só com o que é novo. */
const semMarcas = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,;:!?¿¡"“”]/g, "");
export function juntarTrechos(trechos) {
  let acc = "";
  for (const bruto of trechos) {
    const t = String(bruto || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (!acc) { acc = t; continue; }
    const a = semMarcas(acc).replace(/\s+/g, " ").trim();
    const n = semMarcas(t).replace(/\s+/g, " ").trim();
    if (!n) continue;
    if (n === a || a.endsWith(" " + n) || a.endsWith(n) && n.includes(" ")) continue; // já dito
    if (n.startsWith(a + " ") || n.startsWith(a)) { acc = t; continue; }               // acumulado: troca
    if (a.includes(n) && n.split(" ").length >= 2) continue;                          // repetição do meio
    const pa = acc.split(" "), pn = t.split(" ");
    const na = a.split(" "), nn = n.split(" ");
    let k = Math.min(na.length, nn.length - 1);
    while (k > 0 && na.slice(na.length - k).join(" ") !== nn.slice(0, k).join(" ")) k--;
    acc = (k > 0 ? [...pa, ...pn.slice(k)] : [...pa, ...pn]).join(" ");
  }
  return acc;
}

let ativo = null; // { campo, botao, reconhecimento }
let aviso = () => {};

function elegivel(campo) {
  if (campo.dataset.semVoz !== undefined || campo.dataset.voz === "1") return false;
  if (campo.readOnly || campo.disabled) return false;
  if (campo.closest(".campo-voz")) return false;
  if (campo.tagName === "TEXTAREA") return true;
  if (campo.tagName !== "INPUT") return false;
  const tipo = (campo.getAttribute("type") || "text").toLowerCase();
  if (tipo !== "text" && tipo !== "search") return false;
  const modo = (campo.getAttribute("inputmode") || "").toLowerCase();
  if (modo === "numeric" || modo === "tel" || modo === "decimal") return false;
  return true;
}

function pararAtivo() {
  if (!ativo) return;
  const { botao, reconhecimento } = ativo;
  ativo = null;
  botao.classList.remove("ouvindo");
  botao.setAttribute("aria-pressed", "false");
  botao.title = "Falar para escrever";
  try { reconhecimento.stop(); } catch { /* já parado */ }
}

function escrever(campo, antes, depois, texto) {
  let valor = antes + texto + depois;
  const max = campo.maxLength > 0 ? campo.maxLength : 0;
  if (max && valor.length > max) valor = valor.slice(0, max);
  campo.value = valor;
  const pos = Math.min(valor.length, (antes + texto).length);
  try { campo.setSelectionRange(pos, pos); } catch { /* alguns tipos não permitem */ }
  campo.dispatchEvent(new Event("input", { bubbles: true })); // avisa o resto do site que o texto mudou
}

function iniciar(campo, botao) {
  if (!Reconhecimento) {
    aviso("Este aparelho não permite ditado aqui. Use o microfone do teclado do celular para falar.");
    return;
  }
  if (ativo && ativo.campo === campo) { pararAtivo(); return; } // tocar de novo = parar
  pararAtivo();

  const rec = new Reconhecimento();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  // o que já estava escrito antes e depois do cursor fica; a fala entra no meio
  const valorAtual = campo.value;
  const inicio = typeof campo.selectionStart === "number" && document.activeElement === campo ? campo.selectionStart : valorAtual.length;
  const fim = typeof campo.selectionEnd === "number" && document.activeElement === campo ? campo.selectionEnd : valorAtual.length;
  let antes = valorAtual.slice(0, inicio);
  const depois = valorAtual.slice(fim);
  if (antes && !/\s$/.test(antes)) antes += " ";
  let houveFala = false;
  let textoAtual = "";

  const montar = (texto) => {
    texto = texto.replace(/\s+/g, " ").trimStart();
    // começo do campo (ou de uma frase): primeira letra maiúscula, bom para nomes e frases
    if (!antes.trim() || /[.!?]\s*$/.test(antes)) texto = texto.charAt(0).toUpperCase() + texto.slice(1);
    return texto;
  };

  // A cada evento reconstrói o texto a partir de TODOS os trechos da sessão (em vez de ir somando),
  // e o junta sem repetições — assim nunca aparecem palavras que não foram ditas.
  rec.onresult = (e) => {
    const trechos = [];
    for (let i = 0; i < e.results.length; i++) trechos.push(e.results[i][0].transcript);
    textoAtual = juntarTrechos(trechos);
    houveFala = true;
    escrever(campo, antes, depois, montar(textoAtual));
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") aviso("Permita o uso do microfone no navegador para poder falar.");
    else if (e.error === "no-speech") aviso("Não ouvi nada. Toque no microfone e fale de novo.");
    else if (e.error === "network") aviso("O ditado por voz precisa de internet.");
    else if (e.error === "audio-capture") aviso("Não encontrei um microfone neste aparelho.");
    else if (e.error !== "aborted") aviso("Não foi possível usar o microfone agora.");
  };
  rec.onend = () => {
    if (ativo && ativo.reconhecimento === rec) pararAtivo();
    if (houveFala) escrever(campo, antes, depois, montar(textoAtual)); // texto final
  };

  try {
    rec.start();
  } catch {
    aviso("Não foi possível usar o microfone agora.");
    return;
  }
  ativo = { campo, botao, reconhecimento: rec };
  botao.classList.add("ouvindo");
  botao.setAttribute("aria-pressed", "true");
  botao.title = "Toque para parar";
  aviso("Pode falar… toque no microfone para parar.");
}

function adicionarMicrofone(campo) {
  if (!elegivel(campo) || !campo.parentNode) return;
  campo.dataset.voz = "1";
  const caixa = document.createElement("span");
  caixa.className = "campo-voz" + (campo.tagName === "TEXTAREA" ? " campo-voz--area" : "");
  campo.parentNode.insertBefore(caixa, campo);
  caixa.appendChild(campo); // o mesmo campo, só que agora dentro da caixa (os eventos continuam funcionando)

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "campo-voz__botao";
  botao.setAttribute("aria-label", "Falar para escrever neste campo");
  botao.setAttribute("aria-pressed", "false");
  botao.title = "Falar para escrever";
  botao.innerHTML = ICONE_MICROFONE;
  // não tira o foco do campo ao tocar (mantém o cursor no lugar onde a fala vai entrar)
  botao.addEventListener("mousedown", (e) => e.preventDefault());
  botao.addEventListener("click", () => iniciar(campo, botao));
  caixa.appendChild(botao);
}

function varrer(raiz) {
  if (raiz.nodeType !== 1) return;
  if (raiz.matches?.("textarea, input")) adicionarMicrofone(raiz);
  raiz.querySelectorAll?.("textarea, input").forEach(adicionarMicrofone);
}

export function iniciarVoz({ aviso: funcaoAviso } = {}) {
  if (funcaoAviso) aviso = funcaoAviso;
  varrer(document.body);
  // campos criados depois (janelas, editor de intenções, cadastro...) também ganham o microfone
  new MutationObserver((mudancas) => {
    mudancas.forEach((m) => m.addedNodes.forEach(varrer));
    // se a tela refez o campo enquanto a pessoa falava, encerra a escuta do campo antigo
    if (ativo && !ativo.campo.isConnected) pararAtivo();
  }).observe(document.body, { childList: true, subtree: true });
  // ao sair da página ou fechar uma janela, não deixa o microfone ligado
  window.addEventListener("pagehide", pararAtivo);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pararAtivo(); });
}
