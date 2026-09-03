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

/* ---------- Botão "olho" para mostrar/ocultar senha ----------
   Espera um botão com dois SVGs filhos: .olho-aberto e .olho-fechado */
export function vincularOlhoSenha(botao, input) {
  if (!botao || !input) return;
  const aberto = botao.querySelector(".olho-aberto");
  const fechado = botao.querySelector(".olho-fechado");
  botao.addEventListener("click", () => {
    const vaiMostrar = input.type === "password";
    input.type = vaiMostrar ? "text" : "password";
    aberto?.classList.toggle("oculto", vaiMostrar);
    fechado?.classList.toggle("oculto", !vaiMostrar);
    botao.setAttribute("aria-label", vaiMostrar ? "Ocultar senha" : "Mostrar senha");
    input.focus({ preventScroll: true });
  });
}

/* ---------- Calendário personalizado reutilizável ----------
   container: elemento .calendario (com [data-mes-ano], [data-dias], [data-nav-anterior], [data-nav-proximo])
   input: campo de texto (readonly) onde a data formatada é exibida
   opts: { valorInicial, minIso, maxIso, aoSelecionar(iso) }
   Retorna { definirValor(iso), obterValor() } */
export function criarCalendario(container, input, opts = {}) {
  const elMesAno = container.querySelector("[data-mes-ano]");
  const elDias = container.querySelector("[data-dias]");
  const btnAnterior = container.querySelector("[data-nav-anterior]");
  const btnProximo = container.querySelector("[data-nav-proximo]");
  const aoSelecionar = opts.aoSelecionar || (() => {});
  let minIso = opts.minIso || null;
  let maxIso = opts.maxIso || null;

  let dataSelecionada = opts.valorInicial || null;
  let mesAtual = dataSelecionada
    ? new Date(isoParaData(dataSelecionada).getFullYear(), isoParaData(dataSelecionada).getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function podeSelecionar(iso) {
    if (minIso && iso < minIso) return false;
    if (maxIso && iso > maxIso) return false;
    return true;
  }

  function render() {
    const nomeMes = MESES[mesAtual.getMonth()];
    elMesAno.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mesAtual.getFullYear()}`;
    elDias.innerHTML = "";

    const primeiroDiaSemana = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).getDay();
    const totalDias = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaSemana; i++) {
      const vazio = document.createElement("span");
      vazio.className = "calendario__vazio";
      elDias.appendChild(vazio);
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const d = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), dia);
      const iso = dataParaIso(d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendario__dia";
      btn.textContent = dia;

      if (podeSelecionar(iso)) {
        btn.classList.add("disponivel");
        if (iso === dataSelecionada) btn.classList.add("selecionado");
        btn.addEventListener("click", () => {
          dataSelecionada = iso;
          input.value = formatarDataBR(iso);
          container.classList.remove("aberto");
          render();
          aoSelecionar(iso);
        });
      }
      elDias.appendChild(btn);
    }
  }

  btnAnterior?.addEventListener("click", () => {
    mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1);
    render();
  });
  btnProximo?.addEventListener("click", () => {
    mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1);
    render();
  });

  input.addEventListener("click", () => {
    document.querySelectorAll(".calendario.aberto").forEach((c) => {
      if (c !== container) c.classList.remove("aberto");
    });
    container.classList.toggle("aberto");
  });
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target) && e.target !== input) {
      container.classList.remove("aberto");
    }
  });

  if (dataSelecionada) input.value = formatarDataBR(dataSelecionada);
  render();

  return {
    definirValor(iso) {
      dataSelecionada = iso || null;
      input.value = iso ? formatarDataBR(iso) : "";
      if (iso) mesAtual = new Date(isoParaData(iso).getFullYear(), isoParaData(iso).getMonth(), 1);
      render();
    },
    obterValor() {
      return dataSelecionada;
    },
    definirLimites(novoMinIso, novoMaxIso) {
      minIso = novoMinIso ?? minIso;
      maxIso = novoMaxIso ?? maxIso;
      render();
    }
  };
}
