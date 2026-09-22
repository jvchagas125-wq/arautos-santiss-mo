// Funções utilitárias compartilhadas por todas as páginas

// Corre uma promise contra um limite de tempo — se ela não responder a tempo (rede travada,
// instável etc.), rejeita com um erro em vez de deixar a tela esperando pra sempre. Usado nas
// chamadas automáticas ao Firestore (nunca nas que dependem da pessoa preencher algo).
export function comLimiteDeTempo(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("Tempo esgotado esperando resposta do servidor.")), ms))
  ]);
}

export const MESES = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];
export const DIAS_SEMANA_ABREV = ["dom","seg","ter","qua","qui","sex","sáb"];
export const DIAS_SEMANA_COMPLETO = [
  "Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"
];

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
  let d = valor.replace(/\D/g, "");
  // Celulares/autopreenchimento às vezes trazem o código do país (+55) junto,
  // ex: "+55 (11) 91234-5678" -> sem isso, os 2 dígitos finais do número eram cortados.
  if (d.length > 11 && d.startsWith("55")) {
    d = d.slice(2);
  }
  d = d.slice(0, 11);
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
export function formatarDataComDiaSemana(iso) {
  const d = isoParaData(iso);
  return `${formatarDataBR(iso)} - ${DIAS_SEMANA_COMPLETO[d.getDay()]}`;
}
export function formatarHora(hora) {
  const h = String(hora).padStart(2, "0");
  const hFim = String((hora + 1) % 24).padStart(2, "0");
  return `${h}:00h às ${hFim}:00h`;
}
export function hojeIso() {
  return dataParaIso(new Date());
}

/* ---------- Agendamento: horários disponíveis em um dia específico, já aplicando os limites
   opcionais de horário de início (no primeiro dia do período) e horário de término (no último
   dia do período). Um horário "de 08h" é considerado como começando às 08:00 — por isso um
   limite de término "08:30" ainda inclui o horário das 08h (ele começa antes das 08:30), e um
   limite de início "09:00" exclui o horário das 08h e inclui o das 09h em diante. ---------- */
export function horariosDisponiveisNoDia(diasHorarios, iso) {
  let horas = [...(diasHorarios?.horariosAtivos || [])].sort((a, b) => a - b);
  if (!diasHorarios) return horas;

  const ehPrimeiroDia = iso === diasHorarios.dataInicio;
  const ehUltimoDia = iso === diasHorarios.dataFim;

  if (ehPrimeiroDia && diasHorarios.horaInicioPrimeiroDia) {
    const [h, m] = diasHorarios.horaInicioPrimeiroDia.split(":").map(Number);
    const limiteMin = h * 60 + (m || 0);
    horas = horas.filter((hora) => hora * 60 >= limiteMin);
  }
  if (ehUltimoDia && diasHorarios.horaFimUltimoDia) {
    const [h, m] = diasHorarios.horaFimUltimoDia.split(":").map(Number);
    const limiteMin = h * 60 + (m || 0);
    horas = horas.filter((hora) => hora * 60 < limiteMin);
  }
  return horas;
}

/* ---------- Horário automático da Missa de abertura/encerramento: quando o primeiro dia do
   período tem hora de início configurada, a Missa é a hora imediatamente anterior a ela (ex.:
   adoração começa às 09:00 -> Missa às 08:00); quando o último dia tem hora de término
   configurada, a Missa é a hora imediatamente seguinte ao término (ex.: termina às 18:30 ->
   Missa às 19:00). É automático — não precisa marcar manualmente. ---------- */
export function horasDeMissaNoDia(diasHorarios, iso) {
  const horas = new Set();
  if (!diasHorarios) return horas;

  const ehPrimeiroDia = iso === diasHorarios.dataInicio;
  const ehUltimoDia = iso === diasHorarios.dataFim;
  if (!ehPrimeiroDia && !ehUltimoDia) return horas;

  const disponiveis = horariosDisponiveisNoDia(diasHorarios, iso);
  if (disponiveis.length === 0) return horas;

  if (ehPrimeiroDia && diasHorarios.horaInicioPrimeiroDia) {
    const primeiraHora = Math.min(...disponiveis);
    horas.add((primeiraHora - 1 + 24) % 24);
  }
  if (ehUltimoDia && diasHorarios.horaFimUltimoDia) {
    const ultimaHora = Math.max(...disponiveis);
    horas.add((ultimaHora + 1) % 24);
  }
  return horas;
}

/* ---------- Divide o período todo (De -> Até) em blocos de 7 dias corridos, um bloco = uma
   "semana" (usado na planilha exportada em Excel pelo admin e na tabela de agendamentos do
   site público). Quando sobra um resto pequeno no final (ex.: o período termina num único
   sábado avulso depois da última semana cheia), esse resto é incorporado à última semana em
   vez de virar um bloco novo quase vazio. ---------- */
export function gerarBlocosDeSemana(dataInicio, dataFim) {
  const todosDias = [];
  let d = isoParaData(dataInicio);
  while (dataParaIso(d) <= dataFim) {
    todosDias.push(dataParaIso(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  if (todosDias.length === 0) return [];

  const numSemanasCheias = Math.floor(todosDias.length / 7);
  const resto = todosDias.length % 7;
  const semanasAntesDaUltima = resto === 0 ? numSemanasCheias : numSemanasCheias - 1;

  const blocos = [];
  let i = 0;
  for (let s = 0; s < semanasAntesDaUltima; s++) {
    blocos.push(todosDias.slice(i, i + 7));
    i += 7;
  }
  if (i < todosDias.length) {
    blocos.push(todosDias.slice(i));
  }
  return blocos;
}

/* ---------- Frase do dia: rotação cíclica de até 30 frases ----------
   Todo mundo vê a mesma frase no mesmo dia (calculado pela data local do aparelho).
   Frases vazias são ignoradas primeiro — a rotação avança um índice por dia dentro da
   lista já filtrada (só as preenchidas), então com N frases cadastradas ela sempre
   percorre as N em sequência e, ao passar da última, volta para a 1ª. */
const EPOCA_FRASES = new Date(2024, 0, 1); // ponto fixo para contar o ciclo dos dias
export function indiceFraseDoDia(agora = new Date(), total = 30) {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.floor((hoje - EPOCA_FRASES) / 86400000);
  const n = total > 0 ? total : 30;
  return ((dias % n) + n) % n;
}
export function escolherFraseDoDia(lista, agora = new Date()) {
  const l = Array.isArray(lista) ? lista : [];
  const preenchidas = l.filter((item) => item && item.frase && item.frase.trim());
  if (preenchidas.length === 0) return null;
  const indice = indiceFraseDoDia(agora, preenchidas.length);
  return preenchidas[indice];
}

/* ---------- Intenções da missa: categorias fixas ---------- */
export const CATEGORIAS_INTENCAO = [
  { chave: "gracas", rotulo: "Agradecem graças" },
  { chave: "alma", rotulo: "Por alma" },
  { chave: "aniversarios", rotulo: "Aniversários" }
];

/* ---------- Intenções da missa: horários de missa de um dia específico ----------
   config: { horariosPorDia: [ [domingo], [segunda], [terça], [quarta], [quinta], [sexta], [sábado] ], horasAntes: 3 }
   (índice de horariosPorDia = Date.getDay(): 0=domingo ... 6=sábado; um dia sem horários fica com array vazio)
   Retorna as horas de missa (números, em ordem) configuradas para o dia da semana de "iso". */
export function horariosDoDia(config, iso) {
  const horariosPorDia = Array.isArray(config.horariosPorDia) ? config.horariosPorDia : [];
  const diaSemana = isoParaData(iso).getDay();
  return [...(horariosPorDia[diaSemana] || [])].sort((a, b) => a - b);
}

// Decide o status da lista de intenções de UMA missa específica (data + hora): se ainda está
// aberta para preenchimento, se já fechou (dentro da janela de "horasAntes" antes da missa) ou
// se a missa já aconteceu.
export function statusMissaEspecifica(iso, hora, horasAntes, agora = new Date()) {
  const d = isoParaData(iso);
  const missa = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0, 0);
  const horas = Number(horasAntes) > 0 ? Number(horasAntes) : 3;
  const fechamento = new Date(missa.getTime() - horas * 3600000);
  return {
    missa,
    fechamento,
    jaAconteceu: agora >= missa,
    aberta: agora < fechamento
  };
}

/* ---------- Avisos: transforma links (http://, https:// ou www.) dentro do texto em
   elementos <a> clicáveis, preservando o resto do texto como texto puro (sem risco de HTML
   injetado). Zera e reconstrói o conteúdo do elemento recebido. ---------- */
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[a-z]{2,}[^\s<>"']*)/gi;
export function linkificarTexto(texto, elemento) {
  elemento.textContent = "";
  const partes = String(texto || "").split(URL_REGEX);
  partes.forEach((parte) => {
    if (!parte) return;
    if (/^(https?:\/\/|www\.)/i.test(parte)) {
      // separa pontuação de fim de frase (. , ! ? ; : ) ]) que não faz parte do link
      const m = parte.match(/^(.*?)([.,!?;:)\]]*)$/s);
      const url = m ? m[1] : parte;
      const sobra = m ? m[2] : "";
      const a = document.createElement("a");
      a.href = url.startsWith("http") ? url : `https://${url}`;
      a.textContent = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "link-aviso";
      elemento.appendChild(a);
      if (sobra) elemento.appendChild(document.createTextNode(sobra));
    } else {
      elemento.appendChild(document.createTextNode(parte));
    }
  });
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
/* ---------- Ordem das páginas do site público (usada nos botões "Anterior / Próxima") ---------- */
const ORDEM_PAGINAS = [
  { chave: "index", label: "Início", href: "/" },
  { chave: "agendamento", label: "Agendar horário", href: "agendamento" },
  { chave: "meus-agendamentos", label: "Meus agendamentos", href: "meus-agendamentos" },
  { chave: "intencoes", label: "Intenções da missa", href: "intencoes" },
  { chave: "avisos", label: "Avisos", href: "avisos" },
  { chave: "contatos", label: "Contatos", href: "contatos" },
  { chave: "sobre", label: "Sobre", href: "sobre" }
];

// Insere, no fim do conteúdo principal (antes do rodapé), os botões "‹ Anterior" e "Próxima ›"
// que levam para a página vizinha nesse ciclo. Páginas fora da lista (ex.: admin) não recebem nada.
function inserirNavegacaoEntrePaginas(paginaAtual) {
  if (paginaAtual === "index") return; // página inicial não mostra "Anterior / Próxima"
  const indice = ORDEM_PAGINAS.findIndex((p) => p.chave === paginaAtual);
  if (indice === -1) return;

  const main = document.querySelector("main.conteudo");
  if (!main || main.querySelector(".navegacao-paginas")) return;

  const anterior = ORDEM_PAGINAS[(indice - 1 + ORDEM_PAGINAS.length) % ORDEM_PAGINAS.length];
  const proxima = ORDEM_PAGINAS[(indice + 1) % ORDEM_PAGINAS.length];

  const seta = (direcao) => `
    <svg class="navegacao-paginas__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="${direcao === "esquerda" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}"/>
    </svg>`;

  const nav = document.createElement("div");
  nav.className = "navegacao-paginas";
  nav.innerHTML = `
    <a class="navegacao-paginas__item navegacao-paginas__item--anterior" href="${anterior.href}" aria-label="Página anterior: ${anterior.label}">
      ${seta("esquerda")}
      <span class="navegacao-paginas__textos">
        <span class="navegacao-paginas__rotulo">Anterior</span>
        <span class="navegacao-paginas__nome">${anterior.label}</span>
      </span>
    </a>
    <a class="navegacao-paginas__item navegacao-paginas__item--proxima" href="${proxima.href}" aria-label="Próxima página: ${proxima.label}">
      <span class="navegacao-paginas__textos">
        <span class="navegacao-paginas__rotulo">Próxima</span>
        <span class="navegacao-paginas__nome">${proxima.label}</span>
      </span>
      ${seta("direita")}
    </a>
  `;

  const rodape = main.querySelector(".rodape-simples");
  if (rodape) {
    main.insertBefore(nav, rodape);
  } else {
    main.appendChild(nav);
  }
}

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
    window.location.href = "/";
  });

  inserirNavegacaoEntrePaginas(paginaAtual);
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

/* ---------- Seletor de hora personalizado reutilizável ----------
   container: elemento .seletor-hora (com [data-coluna-horas], [data-coluna-minutos], [data-limpar], [data-confirmar])
   input: campo de texto (readonly) onde o valor "HH:MM" é exibido
   opts: { valorInicial: "HH:MM" ou "", aoSelecionar(valorOuVazio) }
   Retorna { definirValor(hhmm), obterValor() } */
export function criarSeletorHora(container, input, opts = {}) {
  const colHoras = container.querySelector("[data-coluna-horas]");
  const colMinutos = container.querySelector("[data-coluna-minutos]");
  const btnLimpar = container.querySelector("[data-limpar]");
  const btnConfirmar = container.querySelector("[data-confirmar]");
  const aoSelecionar = opts.aoSelecionar || (() => {});
  const MINUTOS_OPCOES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  let horaSel = null;
  let minutoSel = null;

  function centralizarNaColuna(coluna, item) {
    if (!item) return;
    coluna.scrollTop = item.offsetTop - coluna.clientHeight / 2 + item.offsetHeight / 2;
  }

  function aplicarValorInicial(hhmm) {
    if (hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      horaSel = h;
      minutoSel = MINUTOS_OPCOES.includes(m)
        ? m
        : MINUTOS_OPCOES.reduce((maisProximo, v) => (Math.abs(v - m) < Math.abs(maisProximo - m) ? v : maisProximo), 0);
    } else {
      horaSel = null;
      minutoSel = null;
    }
  }
  aplicarValorInicial(opts.valorInicial || "");

  function textoValor() {
    if (horaSel === null || minutoSel === null) return "";
    return `${String(horaSel).padStart(2, "0")}:${String(minutoSel).padStart(2, "0")}`;
  }

  function render() {
    colHoras.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seletor-hora__item";
      btn.textContent = String(h).padStart(2, "0");
      if (h === horaSel) btn.classList.add("selecionado");
      btn.addEventListener("click", () => { horaSel = h; render(); });
      colHoras.appendChild(btn);
    }
    colMinutos.innerHTML = "";
    MINUTOS_OPCOES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seletor-hora__item";
      btn.textContent = String(m).padStart(2, "0");
      if (m === minutoSel) btn.classList.add("selecionado");
      btn.addEventListener("click", () => { minutoSel = m; render(); });
      colMinutos.appendChild(btn);
    });
    if (btnConfirmar) btnConfirmar.disabled = horaSel === null || minutoSel === null;
  }

  input.addEventListener("click", () => {
    document.querySelectorAll(".seletor-hora.aberto").forEach((c) => {
      if (c !== container) c.classList.remove("aberto");
    });
    container.classList.toggle("aberto");
    if (container.classList.contains("aberto")) {
      // centraliza o item selecionado dentro da própria coluna, sem rolar a página
      // (scrollIntoView rolaria a janela inteira, não só a coluna)
      requestAnimationFrame(() => {
        centralizarNaColuna(colHoras, colHoras.querySelector(".selecionado"));
        centralizarNaColuna(colMinutos, colMinutos.querySelector(".selecionado"));
      });
    }
  });
  document.addEventListener("click", (e) => {
    // usa composedPath() em vez de container.contains(e.target): ao clicar numa hora/minuto,
    // o próprio clique dispara render() (que recria os botões), então quando esse listener no
    // document roda (na fase de propagação), o botão clicado já foi removido do DOM e
    // "contains" daria falso positivo de "clique fora", fechando o seletor sem querer.
    // composedPath() reflete a árvore no momento do clique, antes dessa recriação.
    const caminho = typeof e.composedPath === "function" ? e.composedPath() : [];
    const cliqueDentro = caminho.includes(container) || container.contains(e.target);
    if (!cliqueDentro && e.target !== input) {
      container.classList.remove("aberto");
    }
  });

  btnLimpar?.addEventListener("click", () => {
    horaSel = null;
    minutoSel = null;
    input.value = "";
    render();
    container.classList.remove("aberto");
    aoSelecionar("");
  });
  btnConfirmar?.addEventListener("click", () => {
    if (horaSel === null || minutoSel === null) return;
    const valor = textoValor();
    input.value = valor;
    container.classList.remove("aberto");
    aoSelecionar(valor);
  });

  input.value = textoValor();
  render();

  return {
    definirValor(hhmm) {
      aplicarValorInicial(hhmm || "");
      input.value = textoValor();
      render();
    },
    obterValor() {
      return textoValor();
    }
  };
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
