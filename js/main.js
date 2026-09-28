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
   Enquanto não há nenhum banner cadastrado (Configurações > Banners), mantém a logo e o
   título de sempre (#heroEstatico). Assim que existe ao menos um banner, esconde o
   cabeçalho estático e mostra o carrossel no lugar dele. */
const heroEstatico = document.getElementById("heroEstatico");
const carrosselBanners = document.getElementById("carrosselBanners");
const carrosselPista = document.getElementById("carrosselPista");
const carrosselPontos = document.getElementById("carrosselPontos");
const btnCarrosselAnterior = document.getElementById("carrosselAnterior");
const btnCarrosselProximo = document.getElementById("carrosselProximo");

// Enquanto a lista de banners ainda não chegou do Firestore (ouvirBanners é assíncrono),
// evita mostrar por uma fração de segundo a logo/título estáticos (#heroEstatico) pra quem
// já tinha banners na última visita — guardamos essa informação num cache local e já
// deixamos a tela no estado certo antes mesmo da primeira resposta do banco.
const CHAVE_CACHE_TEM_BANNERS = "arautos_tem_banners_cache";
try {
  if (localStorage.getItem(CHAVE_CACHE_TEM_BANNERS) === "1") {
    heroEstatico.classList.add("oculto");
    carrosselBanners.classList.remove("oculto");
  }
} catch {
  // sem localStorage disponível — sem problema, só perde a otimização
}

const INTERVALO_AUTOPLAY_MS = 6000;
let bannersAtuais = [];
let indiceAtual = 0;
let temporizadorAutoplay = null;

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

function renderizarCarrossel(lista) {
  bannersAtuais = lista;
  try { localStorage.setItem(CHAVE_CACHE_TEM_BANNERS, lista.length ? "1" : "0"); } catch {}

  if (!lista.length) {
    heroEstatico.classList.remove("oculto");
    carrosselBanners.classList.add("oculto");
    pararAutoplay();
    return;
  }

  heroEstatico.classList.add("oculto");
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

ouvirBanners(renderizarCarrossel);
