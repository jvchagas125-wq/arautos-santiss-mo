import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo } from "./utils.js";
import { obterConfiguracoesGerais } from "./dados.js";

inicializarNavegacao("index");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
  document.getElementById("fraseTexto").textContent = `"${config.fraseDoDia}"`;
  document.getElementById("fraseAutor").textContent = config.autorFrase ? `— ${config.autorFrase}` : "";
}).catch((err) => {
  console.error("Erro ao carregar configurações:", err);
  document.getElementById("fraseTexto").textContent =
    '"Não omitais nunca a visita a cada dia ao Santíssimo Sacramento, ainda que seja muito breve, mas contanto que seja constante."';
  document.getElementById("fraseAutor").textContent = "— São João Bosco";
});
