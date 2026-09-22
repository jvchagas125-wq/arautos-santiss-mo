import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo } from "./utils.js";
import { obterConfiguracoesGerais } from "./dados.js";

inicializarNavegacao("contatos");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
  aplicarInformacoesDeContato(config);
}).catch((err) => {
  console.error("Erro ao carregar configurações:", err);
});

function aplicarInformacoesDeContato(config) {
  const elEnderecoTexto = document.getElementById("contatoEnderecoTexto");
  const elEnderecoObs = document.getElementById("contatoEnderecoObs");
  const linkEndereco = document.getElementById("linkEndereco");
  const elTelefoneTexto = document.getElementById("contatoTelefoneTexto");
  const linkLigar = document.getElementById("linkLigar");
  const linkWhatsapp = document.getElementById("linkWhatsapp");
  const elInstagramTexto = document.getElementById("contatoInstagramTexto");
  const linkInstagram = document.getElementById("linkInstagram");

  if (elEnderecoTexto) elEnderecoTexto.textContent = config.contatoEnderecoTexto || "";
  if (elEnderecoObs) elEnderecoObs.textContent = config.contatoEnderecoObs || "";
  if (linkEndereco) linkEndereco.href = config.contatoEnderecoLink || "#";

  if (elTelefoneTexto) elTelefoneTexto.textContent = config.contatoTelefoneTexto || "";
  const digitos = (config.contatoTelefoneDigits || "").replace(/\D/g, "");
  if (linkLigar) linkLigar.href = digitos ? `tel:+${digitos}` : "#";
  if (linkWhatsapp) linkWhatsapp.href = digitos ? `https://wa.me/${digitos}` : "#";

  if (elInstagramTexto) elInstagramTexto.textContent = config.contatoInstagramTexto || "";
  if (linkInstagram) linkInstagram.href = config.contatoInstagramLink || "#";
}
