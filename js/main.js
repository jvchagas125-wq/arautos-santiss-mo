import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, escolherFraseDoDia } from "./utils.js";
import { obterConfiguracoesGerais, obterFrases } from "./dados.js";

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
obterFrases().then((dados) => {
  const escolhida = escolherFraseDoDia(dados.lista) || FRASE_PADRAO;
  document.getElementById("fraseTexto").textContent = `"${escolhida.frase}"`;
  document.getElementById("fraseAutor").textContent = escolhida.autor ? `— ${escolhida.autor}` : "";
}).catch((err) => {
  console.error("Erro ao carregar frases:", err);
  document.getElementById("fraseTexto").textContent = `"${FRASE_PADRAO.frase}"`;
  document.getElementById("fraseAutor").textContent = `— ${FRASE_PADRAO.autor}`;
});
