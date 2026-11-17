import { inicializarNavegacao, aplicarLogo, aplicarFundo } from "./utils.js";
import { ouvirConfiguracoesGerais } from "./dados.js";

inicializarNavegacao("sobre");

ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "", config);
});
