import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, escolherFraseDoDia, comLimiteDeTempo } from "./utils.js";
import { obterConfiguracoesGerais, obterFrases, ouvirBanners } from "./dados.js";

inicializarNavegacao("index");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
}).catch((err) => console.error("Erro ao carregar configurações:", err));

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
}

comLimiteDeTempo(obterFrases()).then((dados) => {
  const escolhida = escolherFraseDoDia(dados.lista) || FRASE_PADRAO;
  mostrarFrase(escolhida.frase, escolhida.autor);
}).catch((err) => {
  console.error("Erro ao carregar frases:", err);
  mostrarFrase(FRASE_PADRAO.frase, FRASE_PADRAO.autor);
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

function criarSlideBanner(banner, indice) {
  const slide = document.createElement("a");
  slide.className = "carrossel-banners__slide";
  slide.href = banner.paginaDestino || "#";

  const img = document.createElement("img");
  img.className = "carrossel-banners__img";
  img.src = banner.imagemUrl;
  img.alt = banner.textoBotao || "";
  img.loading = indice === 0 ? "eager" : "lazy";
  slide.appendChild(img);

  if (banner.textoBotao) {
    const botao = document.createElement("span");
    botao.className = "btn btn-dourado carrossel-banners__botao";
    botao.textContent = banner.textoBotao;
    slide.appendChild(botao);
  }
  return slide;
}

function irParaSlide(indice) {
  if (!bannersAtuais.length) return;
  indiceAtual = ((indice % bannersAtuais.length) + bannersAtuais.length) % bannersAtuais.length;
  carrosselPista.style.transform = `translateX(-${indiceAtual * 100}%)`;
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
  requestAnimationFrame(() => { carrosselPista.style.transition = ""; });

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
