// Funções utilitárias compartilhadas por todas as páginas

export const MESES = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];
export const DIAS_SEMANA_ABREV = ["dom","seg","ter","qua","qui","sex","sáb"];

/* ---------- Nome: primeira letra maiúscula em cada palavra ---------- */
const MINUSCULAS = ["de","da","do","das","dos","e"];
export function capitalizarNome(nome) {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra, i) => {
      if (i > 0 && MINUSCULAS.includes(palavra)) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    })
    .join(" ");
}

/* ---------- Telefone: máscara (XX) XXXXX-XXXX ---------- */
export function aplicarMascaraTelefone(valor) {
  let d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
}
export function vincularMascaraTelefone(inputEl) {
  inputEl.addEventListener("input", () => {
    const posicaoFinal = inputEl.value.length;
    inputEl.value = aplicarMascaraTelefone(inputEl.value);
    if (inputEl.value.length !== posicaoFinal) {
      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
    }
  });
}
export function telefoneValido(valorFormatado) {
  return /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(valorFormatado);
}
export function telefoneParaDigits(valorFormatado) {
  return valorFormatado.replace(/\D/g, "");
}

/* ---------- Datas ---------- */
export function isoParaData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}
export function dataParaIso(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
export function formatarDataBR(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
export function formatarDataExtenso(iso) {
  const d = isoParaData(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function formatarHora(hora) {
  const h = String(hora).padStart(2, "0");
  const hFim = String((hora + 1) % 24).padStart(2, "0");
  return `${h}:00h às ${hFim}:00h`;
}
export function hojeIso() {
  return dataParaIso(new Date());
}

/* ---------- Toast ---------- */
let toastTimeout;
export function mostrarToast(mensagem) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.classList.add("mostrar");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("mostrar"), 3200);
}

/* ---------- Modais genéricos ---------- */
export function abrirModal(elModal) {
  elModal.classList.add("aberto");
  document.body.style.overflow = "hidden";
}
export function fecharModal(elModal) {
  elModal.classList.remove("aberto");
  document.body.style.overflow = "";
}

/* ---------- Sessão local (login automático) ---------- */
const CHAVE_SESSAO = "arautos_usuario";
export function obterUsuarioSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
export function salvarUsuarioSessao(usuario) {
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario));
}
export function limparUsuarioSessao() {
  localStorage.removeItem(CHAVE_SESSAO);
}

/* ---------- Menu lateral (hambúrguer) + dropdown de perfil ----------
   Espera encontrar no HTML da página os elementos com os IDs:
   #btnMenu #btnFecharMenu #menuLateral #overlay
   #btnPerfil #dropdownPerfil #perfilNome #perfilTelefone #btnSair
*/
export function inicializarNavegacao(paginaAtual) {
  const btnMenu = document.getElementById("btnMenu");
  const btnFecharMenu = document.getElementById("btnFecharMenu");
  const menuLateral = document.getElementById("menuLateral");
  const overlay = document.getElementById("overlay");
  const btnPerfil = document.getElementById("btnPerfil");
  const dropdownPerfil = document.getElementById("dropdownPerfil");

  function abrirMenu() {
    menuLateral.classList.add("aberto");
    overlay.classList.add("ativo");
    fecharDropdown();
  }
  function fecharMenu() {
    menuLateral.classList.remove("aberto");
    overlay.classList.remove("ativo");
  }
  function abrirDropdown() {
    dropdownPerfil.classList.add("aberto");
  }
  function fecharDropdown() {
    dropdownPerfil?.classList.remove("aberto");
  }

  btnMenu?.addEventListener("click", abrirMenu);
  btnFecharMenu?.addEventListener("click", fecharMenu);
  overlay?.addEventListener("click", () => { fecharMenu(); fecharDropdown(); });
  btnPerfil?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdownPerfil.classList.contains("aberto")) fecharDropdown();
    else abrirDropdown();
  });
  document.addEventListener("click", (e) => {
    if (dropdownPerfil && !dropdownPerfil.contains(e.target) && e.target !== btnPerfil) {
      fecharDropdown();
    }
  });

  // marca o item ativo do menu
  document.querySelectorAll("#menuLateral nav a[data-pagina]").forEach((a) => {
    if (a.dataset.pagina === paginaAtual) a.classList.add("ativa");
  });

  // preenche dados do usuário no dropdown
  const usuario = obterUsuarioSessao();
  const nomeEl = document.getElementById("perfilNome");
  const telEl = document.getElementById("perfilTelefone");
  if (usuario && nomeEl) nomeEl.textContent = usuario.nome;
  if (usuario && telEl) telEl.textContent = usuario.telefone;

  const btnSair = document.getElementById("btnSair");
  btnSair?.addEventListener("click", () => {
    limparUsuarioSessao();
    window.location.href = "index.html";
  });
}

/* ---------- Aplica logo e fundo dinâmicos vindos da configuração ---------- */
export function aplicarLogo(url) {
  document.querySelectorAll(".js-logo").forEach((img) => {
    if (url) img.src = url;
  });
}
export function aplicarFundo(url) {
  if (!url) return;
  document.documentElement.style.setProperty("--fundo-img", `url('${url}')`);
}
