import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo } from "./utils.js";
import { obterConfiguracoesGerais } from "./dados.js";

inicializarNavegacao("sobre");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
}).catch((err) => {
  console.error("Erro ao carregar configurações:", err);
});
