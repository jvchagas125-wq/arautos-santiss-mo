// Página pública "Simpósio": informações dos cursos e eventos (banner, título, descrição e link opcional),
// cadastradas no painel administrativo em Avisos > Simpósio.
import { inicializarNavegacao, aplicarLogo, aplicarFundo, linkificarTexto, definirSrcOtimizado, normalizarLinkSimposio } from "./utils.js";
import { ouvirConfiguracoesGerais, ouvirSimposio, ouvirCursos } from "./dados.js";
import { estadoInscricoes, rotuloDataHora } from "./cursos-comum.js";

inicializarNavegacao("simposio");

ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "", config);
});

const elVazio = document.getElementById("simposioVazio");
const lista = document.getElementById("listaSimposioPublico");

const INTERVALO_AUTOMATICO_MS = 8000; // tempo parado em cada simpósio
const reduzirMovimento = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const ICONE_SETA = (lado) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${lado === "esq" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;

// cursos (para os cartões vinculados a um curso mostrarem "Inscrições encerradas")
let cursosPorId = new Map();
const situacaoDoCurso = (item) => {
  const curso = item.cursoId ? cursosPorId.get(item.cursoId) : null;
  return curso ? { curso, ...estadoInscricoes(curso) } : null;
};

function criarCartao(item, primeiro) {
  const cartao = document.createElement("article");
  cartao.className = "cartao-simposio";

  if (item.imagemUrl) {
    const img = document.createElement("img");
    img.className = "cartao-simposio__banner";
    definirSrcOtimizado(img, item.imagemUrl, 1200);
    img.alt = item.titulo || "";
    img.width = 1200;
    img.height = 600;
    img.decoding = "async";
    img.loading = "eager";           // sem espera: o banner baixa assim que a página abre
    if (primeiro) img.fetchPriority = "high";
    img.draggable = false;
    cartao.appendChild(img);
  }

  const corpo = document.createElement("div");
  corpo.className = "cartao-simposio__corpo";

  const titulo = document.createElement("h2");
  titulo.className = "cartao-simposio__titulo";
  titulo.textContent = item.titulo || "";
  corpo.appendChild(titulo);

  if (item.descricao) {
    const texto = document.createElement("p");
    texto.className = "cartao-simposio__texto";
    linkificarTexto(item.descricao, texto);
    corpo.appendChild(texto);
  }

  const situacao = situacaoDoCurso(item);
  if (situacao && situacao.estado !== "abertas") {
    // curso vinculado que ainda não começou ou já encerrou: no lugar do botão, o aviso
    const aviso = document.createElement("p");
    aviso.className = "cartao-simposio__estado" + (situacao.estado === "encerradas" ? " cartao-simposio__estado--encerrado" : "");
    aviso.textContent = situacao.estado === "encerradas"
      ? "Inscrições encerradas"
      : `Inscrições em breve — começam em ${rotuloDataHora(situacao.curso.abreEm)}`;
    corpo.appendChild(aviso);
    cartao.appendChild(corpo);
    return cartao;
  }
  // curso vinculado e aberto, sem link próprio: o botão leva para as inscrições
  const linkSeguro = normalizarLinkSimposio(item.linkUrl) || (situacao ? "/cursos" : "");
  if (linkSeguro) {
    const externo = /^https?:\/\//i.test(linkSeguro);
    const a = document.createElement("a");
    a.className = "btn btn-dourado cartao-simposio__link";
    a.href = linkSeguro;
    a.textContent = item.linkTexto || (situacao && !item.linkUrl ? "Inscreva-se" : "Saiba mais");
    if (externo) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    corpo.appendChild(a);
  }

  cartao.appendChild(corpo);
  return cartao;
}

// Carrossel (só quando há 2 ou mais simpósios): passa de um em um, devagar, sozinho; setas e bolinhas para
// o visitante escolher; arrastar com o dedo também funciona. Para quando a pessoa está interagindo, quando
// a aba fica escondida ou quando a pessoa prefere menos movimento. Devolve { el, destruir }.
function montarCarrossel(itens, indiceInicial) {
  const n = itens.length;
  const raiz = document.createElement("div");
  raiz.className = "carrossel-simposio";
  raiz.setAttribute("role", "region");
  raiz.setAttribute("aria-roledescription", "carrossel");
  raiz.setAttribute("aria-label", "Cursos e eventos do Simpósio");

  const janela = document.createElement("div");
  janela.className = "carrossel-simposio__janela";
  const trilho = document.createElement("div");
  trilho.className = "carrossel-simposio__trilho";

  // [cópia do último] [1] [2] ... [n] [cópia do primeiro]  — dá a volta infinita sem "rebobinar"
  const cartoes = itens.map((it, i) => criarCartao(it, i === 0));
  const copiaFim = criarCartao(itens[0], false);
  const copiaInicio = criarCartao(itens[n - 1], false);
  [copiaInicio, copiaFim].forEach((c) => {
    c.setAttribute("aria-hidden", "true");
    c.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1"));
  });
  const slides = [copiaInicio, ...cartoes, copiaFim];
  slides.forEach((c) => trilho.appendChild(c));
  janela.appendChild(trilho);
  raiz.appendChild(janela);

  // setas (ficam em cima do banner)
  const faixaSetas = document.createElement("div");
  faixaSetas.className = "carrossel-simposio__setas";
  const btn = (lado, rotulo) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `carrossel-simposio__seta carrossel-simposio__seta--${lado}`;
    b.setAttribute("aria-label", rotulo);
    b.innerHTML = ICONE_SETA(lado);
    return b;
  };
  const btnEsq = btn("esq", "Simpósio anterior");
  const btnDir = btn("dir", "Próximo simpósio");
  faixaSetas.append(btnEsq, btnDir);
  raiz.appendChild(faixaSetas);

  // bolinhas
  const pontos = document.createElement("div");
  pontos.className = "carrossel-simposio__pontos";
  const bolinhas = itens.map((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "carrossel-simposio__ponto";
    b.setAttribute("aria-label", `Ir para o simpósio ${i + 1} de ${n}`);
    b.addEventListener("click", () => { irPara(i + 1); reiniciarTimer(); });
    pontos.appendChild(b);
    return b;
  });
  raiz.appendChild(pontos);

  let posicao = Math.min(Math.max(indiceInicial, 0), n - 1) + 1; // posição dentro de "slides"
  let timer = null;
  let pausado = false;
  let animando = false;

  const real = () => (posicao - 1 + n) % n;
  function ajustarAltura() {
    const atual = slides[posicao];
    if (atual) janela.style.height = atual.offsetHeight + "px";
  }
  function aplicar(animar) {
    trilho.style.transition = animar && !reduzirMovimento() ? "" : "none";
    trilho.style.transform = `translateX(${-posicao * 100}%)`;
    bolinhas.forEach((b, i) => { b.classList.toggle("ativo", i === real()); b.setAttribute("aria-current", i === real() ? "true" : "false"); });
    slides.forEach((c, i) => { if (!c.hasAttribute("aria-hidden")) c.setAttribute("aria-hidden", i === posicao ? "false" : "true"); });
    cartoes.forEach((c, i) => {
      const visivel = i + 1 === posicao;
      c.setAttribute("aria-hidden", visivel ? "false" : "true");
      c.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", visivel ? "0" : "-1"));
    });
    ajustarAltura();
  }
  function irPara(nova) {
    if (animando && !reduzirMovimento()) return;
    posicao = nova;
    animando = !reduzirMovimento();
    aplicar(true);
    if (!animando) normalizar();
    else setTimeout(() => { if (animando) normalizar(); }, 1300); // garantia, caso o fim da animação não seja avisado
  }
  // ao chegar numa cópia, salta (sem animação) para o cartão verdadeiro correspondente
  function normalizar() {
    animando = false;
    if (posicao === 0) { posicao = n; aplicar(false); }
    else if (posicao === n + 1) { posicao = 1; aplicar(false); }
  }
  trilho.addEventListener("transitionend", (e) => { if (e.target === trilho && e.propertyName === "transform") normalizar(); });

  const proximo = () => irPara(posicao + 1);
  const anterior = () => irPara(posicao - 1);
  btnDir.addEventListener("click", () => { proximo(); reiniciarTimer(); });
  btnEsq.addEventListener("click", () => { anterior(); reiniciarTimer(); });
  raiz.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { proximo(); reiniciarTimer(); }
    else if (e.key === "ArrowLeft") { anterior(); reiniciarTimer(); }
  });

  // passagem automática
  function parar() { if (timer) { clearInterval(timer); timer = null; } }
  function iniciarTimer() {
    parar();
    if (reduzirMovimento() || pausado || document.hidden) return;
    timer = setInterval(proximo, INTERVALO_AUTOMATICO_MS);
  }
  function reiniciarTimer() { iniciarTimer(); }
  raiz.addEventListener("mouseenter", () => { pausado = true; parar(); });
  raiz.addEventListener("mouseleave", () => { pausado = false; iniciarTimer(); });
  raiz.addEventListener("focusin", () => { pausado = true; parar(); });
  raiz.addEventListener("focusout", () => { pausado = false; iniciarTimer(); });
  const aoMudarVisibilidade = () => { if (document.hidden) parar(); else iniciarTimer(); };
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  // só passa sozinho enquanto o carrossel está na tela
  let observador = null;
  if ("IntersectionObserver" in window) {
    observador = new IntersectionObserver((es) => { pausado = !es[0].isIntersecting; if (pausado) parar(); else iniciarTimer(); }, { threshold: 0.2 });
    observador.observe(raiz);
  }

  // arrastar com o dedo / mouse
  let inicioX = null, inicioY = null;
  janela.addEventListener("pointerdown", (e) => { inicioX = e.clientX; inicioY = e.clientY; parar(); });
  const soltar = (e) => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX, dy = e.clientY - inicioY;
    inicioX = inicioY = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx < 0) proximo(); else anterior(); }
    iniciarTimer();
  };
  janela.addEventListener("pointerup", soltar);
  janela.addEventListener("pointercancel", () => { inicioX = inicioY = null; iniciarTimer(); });

  // a altura acompanha o cartão da vez (cada um tem um texto de tamanho diferente)
  let ro = null;
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(ajustarAltura);
    slides.forEach((c) => ro.observe(c));
  }
  window.addEventListener("resize", ajustarAltura);

  aplicar(false);
  requestAnimationFrame(ajustarAltura);
  iniciarTimer();

  return {
    el: raiz,
    indice: real,
    destruir() {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("resize", ajustarAltura);
      if (observador) observador.disconnect();
      if (ro) ro.disconnect();
    }
  };
}

let carrosselAtual = null;
let ultimosItens = null;
let assinaturaAnterior = "";

function desenhar() {
  if (!ultimosItens) return;
  const itens = ultimosItens;
  // se a lista mudar enquanto a pessoa está vendo, continua no mesmo simpósio
  let indiceInicial = 0;
  if (carrosselAtual) {
    indiceInicial = carrosselAtual.indice();
    carrosselAtual.destruir();
    carrosselAtual = null;
  }
  lista.innerHTML = "";
  elVazio.classList.toggle("oculto", itens.length > 0);
  lista.classList.toggle("lista-simposio--carrossel", itens.length > 1);

  if (itens.length === 1) {
    lista.appendChild(criarCartao(itens[0], true));        // um só: cartão simples, sem carrossel
  } else if (itens.length > 1) {
    carrosselAtual = montarCarrossel(itens, indiceInicial);
    lista.appendChild(carrosselAtual.el);
  }
}
// só o que muda o desenho: os itens e a situação (aberta/em breve/encerrada) dos cursos vinculados
const assinatura = () => JSON.stringify((ultimosItens || []).map((i) => [i, (situacaoDoCurso(i) || {}).estado || "", (situacaoDoCurso(i) || {}).curso?.fechaEm || "", (situacaoDoCurso(i) || {}).curso?.abreEm || ""]));
function redesenharSeMudou() {
  const nova = assinatura();
  if (nova === assinaturaAnterior) return;
  assinaturaAnterior = nova;
  desenhar();
}

ouvirSimposio((itens) => { ultimosItens = itens; assinaturaAnterior = ""; redesenharSeMudou(); });
ouvirCursos((cursos) => { cursosPorId = new Map(cursos.map((c) => [c.id, c])); redesenharSeMudou(); }, () => {});
// as inscrições abrem e encerram no horário programado: confere a cada meio minuto
setInterval(() => { if (!document.hidden) redesenharSeMudou(); }, 30000);
