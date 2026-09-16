import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, linkificarTexto } from "./utils.js";
import { obterConfiguracoesGerais, ouvirAvisos } from "./dados.js";

inicializarNavegacao("avisos");
exigirCadastro();

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
});

const elVazio = document.getElementById("avisosVazio");
const lista = document.getElementById("listaAvisosPublico");

// Reduz a fonte do título só o quanto for necessário pra caber numa linha só, sem cortar o
// texto — até um tamanho mínimo legível; se o título for tão comprido que nem no mínimo
// coubesse inteiro, o CSS corta o final com "..." em vez de deixar a letra ilegível.
const TAMANHO_MINIMO_TITULO_PX = 8;
function ajustarTitulosParaCaber() {
  document.querySelectorAll(".cartao-aviso__titulo").forEach((el) => {
    el.style.fontSize = ""; // volta ao tamanho padrão do CSS antes de medir de novo
    if (el.scrollWidth > el.clientWidth) {
      const tamanhoAtual = parseFloat(getComputedStyle(el).fontSize);
      const escala = el.clientWidth / el.scrollWidth;
      const novoTamanho = Math.max(TAMANHO_MINIMO_TITULO_PX, tamanhoAtual * escala * 0.97);
      el.style.fontSize = `${novoTamanho.toFixed(2)}px`;
    }
  });
}
let atrasoRedimensionar = null;
window.addEventListener("resize", () => {
  clearTimeout(atrasoRedimensionar);
  atrasoRedimensionar = setTimeout(ajustarTitulosParaCaber, 150);
});

ouvirAvisos((avisos) => {
  lista.innerHTML = "";
  elVazio.classList.toggle("oculto", avisos.length > 0);

  avisos.forEach((aviso) => {
    const card = document.createElement("div");
    card.className = "cartao-aviso";

    if (aviso.imagemUrl) {
      const img = document.createElement("img");
      img.className = "cartao-aviso__img";
      img.src = aviso.imagemUrl;
      img.alt = aviso.titulo || "";
      card.appendChild(img);
    }

    const corpo = document.createElement("div");
    corpo.className = "cartao-aviso__corpo";

    const titulo = document.createElement("div");
    titulo.className = "cartao-aviso__titulo";
    titulo.textContent = aviso.titulo || "";
    corpo.appendChild(titulo);

    const texto = document.createElement("p");
    texto.className = "cartao-aviso__texto";
    linkificarTexto(aviso.texto || "", texto);
    corpo.appendChild(texto);

    card.appendChild(corpo);
    lista.appendChild(card);
  });

  requestAnimationFrame(ajustarTitulosParaCaber);
});
