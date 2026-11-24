import { inicializarNavegacao, aplicarLogo, aplicarFundo, escolherFraseDoDia, comLimiteDeTempo, definirSrcOtimizado, otimizarImagemUrl } from "./utils.js";
import { ouvirConfiguracoesGerais, obterFrases, ouvirBanners } from "./dados.js";
import { mostrarTextoFormatado } from "./texto-formatado.js";

inicializarNavegacao("index");

// logo e fundo: aparecem na hora (do último acesso) e acompanham o painel em tempo real
ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "", config);
});

const FRASE_PADRAO = {
  frase: "Não omitais nunca a visita a cada dia ao Santíssimo Sacramento, ainda que seja muito breve, mas contanto que seja constante.",
  autor: "São João Bosco"
};
// Enquanto a frase real não chega, mostra um "esqueleto" (sem texto nenhum) em vez de
// "Carregando..." OU de já cravar a frase padrão na tela — assim ninguém vê uma frase errada
// piscando por uma fração de segundo antes da frase certa aparecer.
const elFraseSkeleton = document.getElementById("fraseSkeleton");
const elFraseTexto = document.getElementById("fraseTexto");
const elFraseAutor = document.getElementById("fraseAutor");

function mostrarFrase(frase, autor) {
  elFraseTexto.textContent = `"${frase}"`;
  elFraseAutor.textContent = autor ? `— ${autor}` : "";
  elFraseSkeleton.classList.add("oculto");
  elFraseTexto.classList.remove("oculto");
  elFraseAutor.classList.remove("oculto");
  try { ajustarHomeNaTela(); } catch { /* ainda não inicializado: o ajuste roda depois */ } // a frase mudou de tamanho: confere se a tela inicial ainda cabe
}

// A lista de frases fica guardada neste aparelho: a partir da segunda visita a frase do dia aparece
// NA HORA (sem "esqueleto" de carregamento), e a leitura do banco só confirma/atualiza em seguida.
const CHAVE_CACHE_FRASES = "arautos_frases_cache";
function lerFrasesCache() {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_FRASES);
    const lista = bruto ? JSON.parse(bruto) : null;
    return Array.isArray(lista) ? lista : null;
  } catch { return null; }
}
let fraseMostrada = "";
function mostrarFraseDoDia(lista) {
  const escolhida = escolherFraseDoDia(lista) || FRASE_PADRAO;
  const assinatura = `${escolhida.frase}|${escolhida.autor}`;
  if (assinatura === fraseMostrada) return; // já está na tela, não pisca
  fraseMostrada = assinatura;
  mostrarFrase(escolhida.frase, escolhida.autor);
}

const frasesCache = lerFrasesCache();
if (frasesCache) mostrarFraseDoDia(frasesCache);

comLimiteDeTempo(obterFrases()).then((dados) => {
  try { localStorage.setItem(CHAVE_CACHE_FRASES, JSON.stringify(dados.lista)); } catch {}
  mostrarFraseDoDia(dados.lista);
}).catch((err) => {
  console.error("Erro ao carregar frases:", err);
  if (!fraseMostrada) mostrarFraseDoDia([]); // sem cache e sem rede: frase padrão
});

/* ---------- Carrossel de banners da Home ----------
   Só aparece quando existe ao menos um banner cadastrado (Configurações > Banners no painel
   admin) — antigamente, enquanto não havia nenhum banner, a página mostrava uma logo/título
   fixos ("Adoração ao Santíssimo Sacramento"); isso foi removido a pedido, então agora, sem
   banner cadastrado, essa área simplesmente fica vazia. */
const carrosselBanners = document.getElementById("carrosselBanners");
const carrosselPista = document.getElementById("carrosselPista");
const carrosselPontos = document.getElementById("carrosselPontos");
const btnCarrosselAnterior = document.getElementById("carrosselAnterior");
const btnCarrosselProximo = document.getElementById("carrosselProximo");

// Enquanto a lista de banners ainda não chegou do Firestore (ouvirBanners é assíncrono, e o
// site não usa cache local do Firestore — cada recarregada de página pede tudo de novo pela
// rede), guardamos a última lista de banners vista neste aparelho e já a exibimos de cara,
// antes mesmo da primeira resposta do banco — assim ninguém vê a logo/título antigos piscarem
// por um instante a cada load. Assim que a resposta real chega, o carrossel é atualizado (troca
// suave, sem voltar pro estado vazio no meio do caminho).
const CHAVE_CACHE_BANNERS = "arautos_banners_cache";
function lerBannersCache() {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_BANNERS);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
function salvarBannersCache(lista) {
  try { localStorage.setItem(CHAVE_CACHE_BANNERS, JSON.stringify(lista)); } catch {}
}

const INTERVALO_AUTOPLAY_MS = 6000;
let bannersAtuais = [];
let indiceAtual = 0;
let temporizadorAutoplay = null;
let ultimaAssinaturaBanners = null;

// destino do banner: página do próprio site (mesma aba) ou link externo (WhatsApp, Instagram, outro site: nova aba)
function aplicarDestinoBanner(a, destino) {
  a.href = destino || "#";
  if (/^https?:\/\//i.test(destino || "")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}

// o banner tem "caixa" (título e/ou texto escritos no painel) logo abaixo da imagem?
const bannerTemCaixa = (banner) => !!(String(banner.titulo || "").trim() || String(banner.texto || "").trim());

// Imagem do banner. Se o painel tem uma imagem própria para computador, entra um <picture> que a usa só em tela de
// computador (a mesma regra do fundo do site); no celular, e quando não há imagem do computador, vale a imagem normal.
const MEDIA_COMPUTADOR = "(min-width: 1000px) and (hover: hover) and (pointer: fine)";
function criarImagemBanner(banner, indice) {
  const img = document.createElement("img");
  img.className = "carrossel-banners__img";
  definirSrcOtimizado(img, banner.imagemUrl, 1000);
  img.alt = banner.titulo || banner.textoBotao || "";
  img.loading = indice === 0 ? "eager" : "lazy";
  img.decoding = "async";
  if (indice === 0) img.fetchPriority = "high";
  const urlPc = String(banner.imagemPcUrl || "").trim();
  if (!/^https:\/\//i.test(urlPc)) return img;
  const figura = document.createElement("picture");
  figura.className = "carrossel-banners__picture";
  const fonte = document.createElement("source");
  fonte.media = MEDIA_COMPUTADOR;
  fonte.srcset = otimizarImagemUrl(urlPc, 1600);
  figura.append(fonte, img);
  return figura;
}

function criarSlideBanner(banner, indice) {
  if (bannerTemCaixa(banner)) return criarSlideBannerComCaixa(banner, indice);

  const slide = document.createElement("a");
  slide.className = "carrossel-banners__slide";
  aplicarDestinoBanner(slide, banner.paginaDestino);
  slide.appendChild(criarImagemBanner(banner, indice));

  if (banner.textoBotao) {
    const botao = document.createElement("span");
    botao.className = "btn btn-dourado carrossel-banners__botao";
    botao.textContent = banner.textoBotao;
    slide.appendChild(botao);
  }
  return slide;
}

// Banner com caixa: a imagem fica inteira à mostra e, logo abaixo, vem uma caixa retangular com título, texto e
// (se o painel tiver um texto de botão) o botão no canto inferior direito, que leva ao mesmo destino do banner.
function criarSlideBannerComCaixa(banner, indice) {
  const slide = document.createElement("div");
  slide.className = "carrossel-banners__slide carrossel-banners__slide--com-caixa";

  const linkImagem = document.createElement("a");
  linkImagem.className = "carrossel-banners__imagem-link";
  aplicarDestinoBanner(linkImagem, banner.paginaDestino);
  linkImagem.appendChild(criarImagemBanner(banner, indice));
  slide.appendChild(linkImagem);

  const caixa = document.createElement("div");
  caixa.className = "carrossel-banners__caixa";
  const titulo = String(banner.titulo || "").trim();
  const texto = String(banner.texto || "").trim();
  if (titulo) {
    const h = document.createElement("h3");
    h.className = "carrossel-banners__caixa-titulo";
    h.textContent = titulo;
    caixa.appendChild(h);
  }
  if (texto) {
    const p = document.createElement("div");
    p.className = "carrossel-banners__caixa-texto";
    if (String(banner.textoHtml || "").trim()) {
      p.classList.add("carrossel-banners__caixa-texto--rico");
      mostrarTextoFormatado(p, banner.textoHtml); // só b, i, br, div e tamanhos conhecidos (ver js/texto-formatado.js)
    } else {
      p.textContent = texto; // banners antigos: texto simples, com as quebras de linha
    }
    caixa.appendChild(p);
  }
  if (banner.textoBotao) {
    const rodape = document.createElement("div");
    rodape.className = "carrossel-banners__caixa-rodape";
    const botao = document.createElement("a");
    botao.className = "btn btn-dourado carrossel-banners__caixa-botao";
    botao.textContent = banner.textoBotao;
    aplicarDestinoBanner(botao, banner.paginaDestino);
    rodape.appendChild(botao);
    caixa.appendChild(rodape);
  }
  slide.appendChild(caixa);
  return slide;
}

// Com caixas, os slides têm alturas diferentes: a janela do carrossel acompanha a altura do banner que está aparecendo.
const carrosselJanela = carrosselPista.parentElement;
function ajustarAlturaCarrossel() {
  const comCaixas = bannersAtuais.some(bannerTemCaixa);
  carrosselBanners.classList.toggle("carrossel-banners--com-caixas", comCaixas);
  if (!comCaixas) carrosselJanela.style.height = "";
  else {
    const slide = carrosselPista.children[indiceAtual];
    if (slide) carrosselJanela.style.height = slide.offsetHeight + "px";
  }
  ajustarHomeNaTela();
}

// ---- Tela inicial no celular: cabe inteira na tela (sem cortar o rodapé) ----
// Com a caixa de texto abaixo do banner a página fica mais alta que a tela. Em vez de cortar o rodapé, a tela se
// ajusta sozinha, só o necessário e nesta ordem: 1) modo compacto (home-c2: caixa, frase e atalhos menores;
// home-c3: atalhos em uma fileira); 2) a imagem do banner perde um pedaço em cima e embaixo; 3) por último,
// a "Frase do dia" some (home-c4). Se a tela já cabe com folga, nada muda.
const ehHome = document.body.classList.contains("pagina-home");
const mqCelular = window.matchMedia("(max-width: 600px)");
const rodapeHome = document.querySelector(".rodape-vermelho");
let ajustandoHome = false;
function ajustarHomeNaTela() {
  if (!ehHome || ajustandoHome || !rodapeHome) return;
  ajustandoHome = true;
  const corpo = document.body;
  const slide = carrosselPista.children[indiceAtual];
  const comCaixas = bannersAtuais.some(bannerTemCaixa);
  const alturaAntes = carrosselJanela.offsetHeight;
  try {
    corpo.classList.remove("home-c2", "home-c3", "home-c4");
    carrosselBanners.classList.remove("home-img-ajustada");
    carrosselBanners.style.removeProperty("--altura-img-banner");
    // altura realmente visível: a página tem exatamente essa altura (em alguns celulares 100dvh passa da área visível e cortava o rodapé)
    const alturaVisivel = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
    if (mqCelular.matches) document.documentElement.style.setProperty("--altura-tela", alturaVisivel + "px");
    else document.documentElement.style.removeProperty("--altura-tela");
    if (!mqCelular.matches || carrosselBanners.classList.contains("oculto")) return;

    carrosselJanela.style.transition = "none"; // mede já com a altura final do banner, sem esperar a animação
    const aplicarAltura = () => { if (comCaixas && slide) carrosselJanela.style.height = slide.offsetHeight + "px"; };
    aplicarAltura();
    // medida pelo layout (offsetTop), que não é afetado pelas animações de entrada
    const sobra = () => rodapeHome.offsetTop + rodapeHome.offsetHeight - alturaVisivel;
    const link = comCaixas && slide ? slide.querySelector(".carrossel-banners__imagem-link") : null;
    const encolherImagem = (proporcaoMinima) => {
      if (!link) return;
      const s = sobra();
      if (s <= 0) return;
      const atual = link.offsetHeight;
      const minimo = Math.round(link.offsetWidth * proporcaoMinima);
      if (atual <= minimo) return;
      carrosselBanners.classList.add("home-img-ajustada");
      carrosselBanners.style.setProperty("--altura-img-banner", Math.max(minimo, atual - s) + "px");
      aplicarAltura();
    };
    // Ordem: primeiro os textos e atalhos ficam menores (c2, c3); só se ainda não couber a imagem perde um pedaço
    // (nas bordas de cima e de baixo); por último some a "Frase do dia" (c4).
    const etapas = [[null, 0], ["home-c2", 0], ["home-c3", 0], ["home-c3", 0.36], ["home-c4", 0.3]];
    for (const [classe, proporcao] of etapas) {
      if (sobra() <= 0) break;
      if (classe) corpo.classList.add(classe);
      carrosselBanners.classList.remove("home-img-ajustada");
      carrosselBanners.style.removeProperty("--altura-img-banner");
      aplicarAltura();
      if (proporcao) encolherImagem(proporcao);
    }
  } finally {
    // devolve a animação de altura do carrossel (parte da altura anterior até a nova)
    if (comCaixas && carrosselJanela.style.height) {
      const final = carrosselJanela.style.height;
      carrosselJanela.style.height = alturaAntes + "px";
      void carrosselJanela.offsetHeight;
      carrosselJanela.style.transition = "";
      carrosselJanela.style.height = final;
    } else {
      carrosselJanela.style.transition = "";
    }
    ajustandoHome = false;
  }
}
window.addEventListener("load", ajustarHomeNaTela);
// as fontes do site chegam depois do primeiro desenho e mudam o tamanho dos textos: confere de novo quando terminam
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => ajustarHomeNaTela());
// qualquer mudança de tamanho do conteúdo (texto novo, frase, barra do navegador sumindo...) refaz a conta, com um pequeno atraso
let temporizadorHome = null;
if (ehHome && "ResizeObserver" in window) {
  new ResizeObserver(() => { clearTimeout(temporizadorHome); temporizadorHome = setTimeout(() => ajustarHomeNaTela(), 120); })
    .observe(document.querySelector("main.conteudo") || document.body);
}

window.addEventListener("resize", ajustarAlturaCarrossel);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarAlturaCarrossel);

function irParaSlide(indice) {
  if (!bannersAtuais.length) return;
  indiceAtual = ((indice % bannersAtuais.length) + bannersAtuais.length) % bannersAtuais.length;
  carrosselPista.style.transform = `translateX(-${indiceAtual * 100}%)`;
  ajustarAlturaCarrossel();
  carrosselPontos.querySelectorAll(".carrossel-banners__ponto").forEach((ponto, i) => {
    ponto.classList.toggle("ativo", i === indiceAtual);
  });
}

function pararAutoplay() {
  clearInterval(temporizadorAutoplay);
  temporizadorAutoplay = null;
}

function reiniciarAutoplay() {
  pararAutoplay();
  if (bannersAtuais.length > 1) {
    temporizadorAutoplay = setInterval(() => irParaSlide(indiceAtual + 1), INTERVALO_AUTOPLAY_MS);
  }
}

function irParaSlideManual(indice) {
  irParaSlide(indice);
  reiniciarAutoplay();
}

function renderizarCarrossel(lista, opts = {}) {
  // evita reconstruir tudo (e reiniciar a transição/autoplay) quando a lista chegou do
  // Firestore mas é idêntica à que já estava em tela (ex.: a que acabamos de mostrar do cache)
  const assinatura = JSON.stringify(lista);
  if (assinatura === ultimaAssinaturaBanners) return;
  ultimaAssinaturaBanners = assinatura;

  bannersAtuais = lista;
  if (!opts.doCache) salvarBannersCache(lista); // não reescreve o cache com os dados que vieram dele mesmo

  if (!lista.length) {
    carrosselBanners.classList.add("oculto");
    pararAutoplay();
    return;
  }

  carrosselBanners.classList.remove("oculto");
  carrosselBanners.classList.toggle("carrossel-banners--unico", lista.length === 1);

  const fragmentoSlides = document.createDocumentFragment();
  const fragmentoPontos = document.createDocumentFragment();
  lista.forEach((banner, i) => {
    fragmentoSlides.appendChild(criarSlideBanner(banner, i));

    const ponto = document.createElement("button");
    ponto.type = "button";
    ponto.className = "carrossel-banners__ponto" + (i === 0 ? " ativo" : "");
    ponto.setAttribute("aria-label", `Ir para o banner ${i + 1}`);
    ponto.addEventListener("click", () => irParaSlideManual(i));
    fragmentoPontos.appendChild(ponto);
  });
  carrosselPista.replaceChildren(fragmentoSlides);
  carrosselPontos.replaceChildren(fragmentoPontos);

  carrosselPista.style.transition = "none";
  indiceAtual = 0;
  carrosselPista.style.transform = "translateX(0%)";
  // força o navegador a aplicar o "transition: none" antes de devolver a transição normal,
  // senão o primeiro slide entraria deslizando em vez de já aparecer no lugar
  requestAnimationFrame(() => { carrosselPista.style.transition = ""; ajustarAlturaCarrossel(); });
  ajustarAlturaCarrossel();

  reiniciarAutoplay();
}

btnCarrosselAnterior.addEventListener("click", () => irParaSlideManual(indiceAtual - 1));
btnCarrosselProximo.addEventListener("click", () => irParaSlideManual(indiceAtual + 1));

// pausa o autoplay enquanto o mouse está sobre o carrossel (desktop)
carrosselBanners.addEventListener("mouseenter", pararAutoplay);
carrosselBanners.addEventListener("mouseleave", reiniciarAutoplay);

// arrastar/deslizar com o dedo no celular
let toqueInicioX = null;
carrosselBanners.addEventListener("touchstart", (e) => {
  toqueInicioX = e.touches[0].clientX;
  pararAutoplay();
}, { passive: true });
carrosselBanners.addEventListener("touchend", (e) => {
  if (toqueInicioX === null) return;
  const deltaX = e.changedTouches[0].clientX - toqueInicioX;
  toqueInicioX = null;
  if (Math.abs(deltaX) > 40) {
    irParaSlideManual(indiceAtual + (deltaX < 0 ? 1 : -1));
  } else {
    reiniciarAutoplay();
  }
}, { passive: true });

// aplica a lista salva deste aparelho ANTES de qualquer resposta do Firestore chegar — é isso
// que faz o carrossel (com imagens de verdade, não uma caixa vazia) já aparecer de cara ao
// recarregar a página, sem esperar a rede
const bannersCache = lerBannersCache();
if (bannersCache && bannersCache.length) {
  renderizarCarrossel(bannersCache, { doCache: true });
}
ouvirBanners(renderizarCarrossel);
