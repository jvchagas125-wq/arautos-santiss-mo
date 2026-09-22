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

// Guarda quais avisos a pessoa já abriu nesta visita (por id), para o card não fechar
// sozinho sempre que a lista for atualizada em tempo real (ex.: outro aviso publicado).
const abertosNestaVisita = new Set();

ouvirAvisos((avisos) => {
  lista.innerHTML = "";
  elVazio.classList.toggle("oculto", avisos.length > 0);

  avisos.forEach((aviso) => {
    const card = document.createElement("div");
    card.className = "cartao-aviso";

    const cabecalho = document.createElement("button");
    cabecalho.type = "button";
    cabecalho.className = "cartao-aviso__cabecalho";

    const cabecalhoTexto = document.createElement("span");
    cabecalhoTexto.className = "cartao-aviso__cabecalho-texto";

    const titulo = document.createElement("span");
    titulo.className = "cartao-aviso__titulo";
    titulo.textContent = aviso.titulo || "";
    cabecalhoTexto.appendChild(titulo);

    const dica = document.createElement("span");
    dica.className = "cartao-aviso__dica";
    dica.textContent = "Toque aqui para ver o aviso";
    cabecalhoTexto.appendChild(dica);

    cabecalho.appendChild(cabecalhoTexto);
    cabecalho.insertAdjacentHTML("beforeend",
      `<svg class="cartao-aviso__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`
    );

    const corpo = document.createElement("div");
    corpo.className = "cartao-aviso__corpo oculto";

    if (aviso.imagemUrl) {
      const img = document.createElement("img");
      img.className = "cartao-aviso__img";
      img.src = aviso.imagemUrl;
      img.alt = aviso.titulo || "";
      corpo.appendChild(img);
    }

    const texto = document.createElement("p");
    texto.className = "cartao-aviso__texto";
    linkificarTexto(aviso.texto || "", texto);
    corpo.appendChild(texto);

    const jaAberto = abertosNestaVisita.has(aviso.id);
    card.classList.toggle("aberto", jaAberto);
    corpo.classList.toggle("oculto", !jaAberto);

    cabecalho.addEventListener("click", () => {
      const vaiAbrir = !card.classList.contains("aberto");
      card.classList.toggle("aberto", vaiAbrir);
      corpo.classList.toggle("oculto", !vaiAbrir);
      dica.textContent = vaiAbrir ? "Toque aqui para esconder o aviso" : "Toque aqui para ver o aviso";
      if (vaiAbrir) abertosNestaVisita.add(aviso.id);
      else abertosNestaVisita.delete(aviso.id);
    });
    if (jaAberto) dica.textContent = "Toque aqui para esconder o aviso";

    card.appendChild(cabecalho);
    card.appendChild(corpo);
    lista.appendChild(card);
  });

  requestAnimationFrame(ajustarTitulosParaCaber);
});
