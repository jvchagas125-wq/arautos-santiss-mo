// Seletor de dia e horário no visual do site (no lugar do calendário padrão do navegador).
// Transforma um <input type="datetime-local"> existente: o campo continua sendo o mesmo (mesmo id, mesmo
// valor no formato "aaaa-mm-ddThh:mm"), mas fica escondido; no lugar aparece um botão
// "Clique aqui e selecione o dia e horário" que abre um calendário com a escolha da hora.
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_SEMANA = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n) => String(n).padStart(2, "0");
const TEXTO_VAZIO = "Clique aqui e selecione o dia e horário";

const ICONE_CALENDARIO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const SETA = (esq) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${esq ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;

function ler(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(valor || ""));
  if (!m) return null;
  return { ano: +m[1], mes: +m[2] - 1, dia: +m[3], hora: +m[4], minuto: +m[5] };
}
function escrever({ ano, mes, dia, hora, minuto }) {
  return `${ano}-${pad(mes + 1)}-${pad(dia)}T${pad(hora)}:${pad(minuto)}`;
}
function rotulo(v) {
  const d = ler(v);
  if (!d) return "";
  const semana = DIAS_SEMANA[new Date(Date.UTC(d.ano, d.mes, d.dia)).getUTCDay()];
  return `${semana}, ${pad(d.dia)}/${pad(d.mes + 1)}/${d.ano} às ${pad(d.hora)}:${pad(d.minuto)}`;
}
function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

/* ---------- janela do calendário (uma só, compartilhada pelos campos) ---------- */
let janela = null;
function criarJanela() {
  const overlay = el("div", "sdh-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const caixa = el("div", "sdh");
  const fechar = el("button", "sdh__fechar", "×"); fechar.type = "button"; fechar.setAttribute("aria-label", "Fechar");
  const titulo = el("h3", "sdh__titulo");
  const resumo = el("p", "sdh__resumo");

  const navegacao = el("div", "sdh__nav");
  const anterior = el("button", "sdh__seta"); anterior.type = "button"; anterior.innerHTML = SETA(true); anterior.setAttribute("aria-label", "Mês anterior");
  const mesAno = el("strong", "sdh__mes");
  const proximo = el("button", "sdh__seta"); proximo.type = "button"; proximo.innerHTML = SETA(false); proximo.setAttribute("aria-label", "Próximo mês");
  navegacao.append(anterior, mesAno, proximo);

  const semana = el("div", "sdh__semana");
  INICIAIS.forEach((i) => semana.appendChild(el("span", "", i)));
  const grade = el("div", "sdh__dias");

  const rotuloHora = el("p", "sdh__rotulo", "Horário");
  const horas = el("div", "sdh__horas");
  const rotuloMin = el("p", "sdh__rotulo sdh__rotulo--min", "Minutos");
  const minutos = el("div", "sdh__minutos");

  // digitar o horário (para minutos fora do passo de 5 em 5)
  const digitar = el("div", "sdh__digitar");
  const rotuloDigitar = el("span", "sdh__digitar-rotulo", "Ou digite o horário");
  const campos = el("div", "sdh__digitar-campos");
  const mkCampo = (rot, max) => {
    const i = el("input", "sdh__digitar-campo"); i.type = "text"; i.inputMode = "numeric"; i.maxLength = 2; i.autocomplete = "off";
    i.placeholder = max === 23 ? "hh" : "mm"; i.setAttribute("aria-label", rot);
    return i;
  };
  const campoHora = mkCampo("Hora (0 a 23)", 23), campoMin = mkCampo("Minutos (0 a 59)", 59);
  campos.append(campoHora, el("span", "sdh__digitar-sep", ":"), campoMin);
  digitar.append(rotuloDigitar, campos);

  const acoes = el("div", "sdh__acoes");
  const limpar = el("button", "btn btn-contorno", "Limpar"); limpar.type = "button";
  const confirmar = el("button", "btn btn-dourado", "Confirmar"); confirmar.type = "button";
  acoes.append(limpar, confirmar);

  caixa.append(fechar, titulo, resumo, navegacao, semana, grade, rotuloHora, horas, rotuloMin, minutos, digitar, acoes);
  overlay.appendChild(caixa);
  document.body.appendChild(overlay);
  return { overlay, caixa, fechar, titulo, resumo, anterior, proximo, mesAno, grade, horas, minutos, campoHora, campoMin, limpar, confirmar };
}

function abrirJanela({ tituloTexto, valorAtual, aoConfirmar, aoLimpar }) {
  if (!janela) janela = criarJanela();
  const j = janela;
  const hoje = new Date();
  const atual = ler(valorAtual);
  const estado = {
    ano: atual ? atual.ano : hoje.getFullYear(),
    mes: atual ? atual.mes : hoje.getMonth(),
    dia: atual ? atual.dia : 0, diaMes: atual ? atual.mes : -1, diaAno: atual ? atual.ano : 0,
    hora: atual ? atual.hora : 8,
    minuto: atual ? atual.minuto : 0
  };
  const focoAnterior = document.activeElement;

  const fechar = () => {
    j.overlay.classList.remove("aberto");
    document.removeEventListener("keydown", aoTeclar, true);
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  };
  const aoTeclar = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); fechar(); } };

  function desenhar() {
    j.titulo.textContent = tituloTexto;
    j.mesAno.textContent = `${MESES[estado.mes][0].toUpperCase()}${MESES[estado.mes].slice(1)} de ${estado.ano}`;
    j.grade.replaceChildren();
    const primeiro = new Date(Date.UTC(estado.ano, estado.mes, 1)).getUTCDay();
    const total = new Date(Date.UTC(estado.ano, estado.mes + 1, 0)).getUTCDate();
    for (let i = 0; i < primeiro; i++) j.grade.appendChild(el("span", "sdh__vazio"));
    for (let d = 1; d <= total; d++) {
      const b = el("button", "sdh__dia", String(d)); b.type = "button";
      const ehHoje = d === hoje.getDate() && estado.mes === hoje.getMonth() && estado.ano === hoje.getFullYear();
      const sel = d === estado.dia && estado.mes === estado.diaMes && estado.ano === estado.diaAno;
      if (ehHoje) b.classList.add("sdh__dia--hoje");
      if (sel) { b.classList.add("sdh__dia--sel"); b.setAttribute("aria-pressed", "true"); }
      b.setAttribute("aria-label", `${d} de ${MESES[estado.mes]} de ${estado.ano}`);
      b.addEventListener("click", () => { estado.dia = d; estado.diaMes = estado.mes; estado.diaAno = estado.ano; desenhar(); });
      j.grade.appendChild(b);
    }
    j.horas.replaceChildren();
    for (let h = 0; h < 24; h++) {
      const b = el("button", "sdh__chip" + (h === estado.hora ? " sdh__chip--sel" : ""), pad(h)); b.type = "button";
      b.setAttribute("aria-label", `${h} horas`);
      b.addEventListener("click", () => { estado.hora = h; desenhar(); });
      j.horas.appendChild(b);
    }
    j.minutos.replaceChildren();
    const opcoes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    if (!opcoes.includes(estado.minuto)) opcoes.push(estado.minuto), opcoes.sort((a, b) => a - b);
    opcoes.forEach((m) => {
      const b = el("button", "sdh__chip" + (m === estado.minuto ? " sdh__chip--sel" : ""), pad(m)); b.type = "button";
      b.setAttribute("aria-label", `${m} minutos`);
      b.addEventListener("click", () => { estado.minuto = m; desenhar(); });
      j.minutos.appendChild(b);
    });
    // os campos de digitar só são reescritos quando a pessoa não está digitando neles
    if (document.activeElement !== j.campoHora) j.campoHora.value = pad(estado.hora);
    if (document.activeElement !== j.campoMin) j.campoMin.value = pad(estado.minuto);
    const pronto = estado.dia > 0;
    j.confirmar.disabled = !pronto;
    j.resumo.textContent = pronto
      ? `Escolhido: ${rotulo(escrever({ ano: estado.diaAno, mes: estado.diaMes, dia: estado.dia, hora: estado.hora, minuto: estado.minuto }))}`
      : "Toque no dia e depois escolha o horário.";
    j.resumo.classList.toggle("sdh__resumo--ok", pronto);
  }

  // os botões são reaproveitados entre aberturas: troca os ouvintes pelos desta abertura
  const trocar = (botao, fn) => { const novo = botao.cloneNode(true); botao.replaceWith(novo); novo.addEventListener("click", fn); return novo; };
  j.anterior = trocar(j.anterior, () => { estado.mes--; if (estado.mes < 0) { estado.mes = 11; estado.ano--; } desenhar(); });
  j.proximo = trocar(j.proximo, () => { estado.mes++; if (estado.mes > 11) { estado.mes = 0; estado.ano++; } desenhar(); });
  j.fechar = trocar(j.fechar, fechar);
  j.limpar = trocar(j.limpar, () => { aoLimpar(); fechar(); });
  j.confirmar = trocar(j.confirmar, () => {
    if (!(estado.dia > 0)) return;
    aoConfirmar(escrever({ ano: estado.diaAno, mes: estado.diaMes, dia: estado.dia, hora: estado.hora, minuto: estado.minuto }));
    fechar();
  });
  const ligarCampo = (campo, chave, max) => {
    campo.oninput = () => {
      let t = campo.value.replace(/\D/g, "").slice(0, 2);
      if (t !== "" && +t > max) t = String(max);
      campo.value = t;
      if (t !== "") { estado[chave] = +t; desenhar(); }
    };
    campo.onfocus = () => campo.select();
    campo.onblur = () => { campo.value = pad(estado[chave]); };
    campo.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); campo.blur(); if (estado.dia > 0) j.confirmar.click(); }
    };
  };
  ligarCampo(j.campoHora, "hora", 23);
  ligarCampo(j.campoMin, "minuto", 59);
  j.overlay.onclick = (e) => { if (e.target === j.overlay) fechar(); };
  document.addEventListener("keydown", aoTeclar, true);

  desenhar();
  j.overlay.classList.add("aberto");
  j.confirmar.focus({ preventScroll: true });
}

/* ---------- o campo ---------- */
export function criarSeletorDataHora(input, { titulo = "Escolha o dia e o horário" } = {}) {
  if (!input || input.dataset.seletorDh) return;
  input.dataset.seletorDh = "1";
  const descritor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  input.type = "hidden";

  const caixa = el("div", "seletor-dh");
  const botao = el("button", "seletor-dh__botao"); botao.type = "button";
  const icone = el("span", "seletor-dh__icone"); icone.innerHTML = ICONE_CALENDARIO;
  const texto = el("span", "seletor-dh__texto");
  botao.append(icone, texto);
  const limpar = el("button", "seletor-dh__limpar", "Limpar"); limpar.type = "button";
  limpar.setAttribute("aria-label", "Limpar a data");
  caixa.append(botao, limpar);
  input.after(caixa);

  const rotuloCampo = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
  if (rotuloCampo) { botao.setAttribute("aria-label", `${rotuloCampo.textContent.trim()}: escolher dia e horário`); rotuloCampo.removeAttribute("for"); }

  function atualizar() {
    const v = descritor.get.call(input);
    const preenchido = !!ler(v);
    texto.textContent = preenchido ? rotulo(v) : TEXTO_VAZIO;
    botao.classList.toggle("seletor-dh__botao--vazio", !preenchido);
    limpar.hidden = !preenchido;
  }
  // quem muda o valor por código (ao abrir o editor do curso) também atualiza o botão
  Object.defineProperty(input, "value", {
    configurable: true,
    get() { return descritor.get.call(this); },
    set(v) { descritor.set.call(this, v); atualizar(); }
  });
  input.focus = () => { botao.focus(); botao.scrollIntoView({ block: "center", behavior: "smooth" }); };

  const definir = (v) => { descritor.set.call(input, v); atualizar(); input.dispatchEvent(new Event("change", { bubbles: true })); };
  botao.addEventListener("click", () => abrirJanela({
    tituloTexto: (rotuloCampo && rotuloCampo.textContent.trim()) || titulo,
    valorAtual: descritor.get.call(input),
    aoConfirmar: definir,
    aoLimpar: () => definir("")
  }));
  limpar.addEventListener("click", () => definir(""));
  atualizar();
}
