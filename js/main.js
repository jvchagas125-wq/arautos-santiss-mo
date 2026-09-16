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
// Mostra a frase padrão desde já (em vez de "Carregando...") — se a frase do dia configurada
// no painel for diferente, ela substitui o texto assim que chegar, sem deixar a tela vazia.
const elFraseTexto = document.getElementById("fraseTexto");
const elFraseAutor = document.getElementById("fraseAutor");
elFraseTexto.textContent = `"${FRASE_PADRAO.frase}"`;
elFraseAutor.textContent = `— ${FRASE_PADRAO.autor}`;

obterFrases().then((dados) => {
  const escolhida = escolherFraseDoDia(dados.lista);
  if (!escolhida) return; // sem frases cadastradas — mantém a padrão que já está na tela
  elFraseTexto.textContent = `"${escolhida.frase}"`;
  elFraseAutor.textContent = escolhida.autor ? `— ${escolhida.autor}` : "";
}).catch((err) => {
  console.error("Erro ao carregar frases:", err);
  // já está mostrando a frase padrão — nada mais a fazer
});
