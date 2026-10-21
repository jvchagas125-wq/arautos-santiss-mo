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
  let finais = "";
  let houveFala = false;

  const montar = (provisorio) => {
    let texto = (finais + provisorio).replace(/\s+/g, " ").trimStart();
    // começo do campo (ou de uma frase): primeira letra maiúscula, bom para nomes e frases
    if (!antes.trim() || /[.!?]\s*$/.test(antes)) texto = texto.charAt(0).toUpperCase() + texto.slice(1);
    return texto;
  };

  rec.onresult = (e) => {
    let provisorio = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const parte = e.results[i][0].transcript;
      if (e.results[i].isFinal) { finais += (finais && !/\s$/.test(finais) ? " " : "") + parte.trim(); }
      else provisorio += parte;
    }
    houveFala = true;
    escrever(campo, antes, depois, montar(provisorio));
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
    if (houveFala) escrever(campo, antes, depois, montar("")); // deixa só o texto final (sem o provisório)
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
