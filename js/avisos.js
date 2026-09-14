import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, linkificarTexto } from "./utils.js";
import { obterConfiguracoesGerais, ouvirAvisos } from "./dados.js";

inicializarNavegacao("avisos");
exigirCadastro();

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
});

const elCarregando = document.getElementById("avisosCarregando");
const elVazio = document.getElementById("avisosVazio");
const lista = document.getElementById("listaAvisosPublico");

ouvirAvisos((avisos) => {
  elCarregando.classList.add("oculto");
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
});
