import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo } from "./utils.js";
import { ouvirConfiguracoesGerais } from "./dados.js";

inicializarNavegacao("sobre");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "");
});
