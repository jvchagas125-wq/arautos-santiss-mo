// Página pública "Simpósio": informações dos cursos e eventos (banner, título, descrição e link opcional),
// cadastradas no painel administrativo em Avisos > Simpósio.
import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, linkificarTexto, definirSrcOtimizado, normalizarLinkSimposio } from "./utils.js";
import { ouvirConfiguracoesGerais, ouvirSimposio } from "./dados.js";

inicializarNavegacao("simposio");
exigirCadastro();

ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "");
});

const elVazio = document.getElementById("simposioVazio");
const lista = document.getElementById("listaSimposioPublico");

ouvirSimposio((itens) => {
  lista.innerHTML = "";
  elVazio.classList.toggle("oculto", itens.length > 0);

  itens.forEach((item) => {
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

    const linkSeguro = normalizarLinkSimposio(item.linkUrl);
    if (linkSeguro) {
      const externo = /^https?:\/\//i.test(linkSeguro);
      const a = document.createElement("a");
      a.className = "btn btn-dourado cartao-simposio__link";
      a.href = linkSeguro;
      a.textContent = item.linkTexto || "Saiba mais";
      if (externo) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      corpo.appendChild(a);
    }

    cartao.appendChild(corpo);
    lista.appendChild(cartao);
  });
});
