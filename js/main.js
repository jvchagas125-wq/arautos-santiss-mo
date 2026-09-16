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

obterFrases().then((dados) => {
  const escolhida = escolherFraseDoDia(dados.lista) || FRASE_PADRAO;
  mostrarFrase(escolhida.frase, escolhida.autor);
}).catch((err) => {
  console.error("Erro ao carregar frases:", err);
  mostrarFrase(FRASE_PADRAO.frase, FRASE_PADRAO.autor);
});
