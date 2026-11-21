// Registra, uma vez por visita, de onde a pessoa chegou e em qual página entrou (ver js/visitas-comum.js).
// Carregado pelas páginas públicas em segundo plano; qualquer falha é silenciosa — nunca atrapalha o site.
import { normalizarOrigem, origemDoReferrer, origemDoNavegador, diaBrasilia } from "./visitas-comum.js";

const CHAVE_VISITA = "arautos_entrada";        // sessionStorage: já contamos esta visita
const CHAVE_PESSOA = "arautos_pessoa_do_dia";   // localStorage: { dia, fontes: [...] } — para contar cada aparelho 1x por dia/origem

// O site foi aberto pelo ícone na tela inicial (aplicativo instalado / PWA) e não pelo navegador?
function abertoComoAplicativo() {
  try {
    if (navigator.standalone === true) return true; // iPhone/iPad
    return ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch { return false; }
}

export function registrarEntrada(pagina) {
  try {
    if (!pagina || pagina === "admin") return;
    if (navigator.webdriver) return; // robôs de teste
    if (localStorage.getItem("arautos_admin_sessao")) return; // quem administra o site não entra na conta
    if (sessionStorage.getItem(CHAVE_VISITA)) return; // só a primeira página de cada visita conta como "entrada"

    const params = new URLSearchParams(location.search);
    // ordem: marca do link (?origem=) → site de onde veio → ícone do aplicativo instalado → app que abriu o link
    // (Instagram, Facebook, TikTok) → direto
    const fonte = normalizarOrigem(params.get("origem")) || origemDoReferrer(document.referrer, location.hostname)
      || (abertoComoAplicativo() ? "app-instalado" : "") || origemDoNavegador(navigator.userAgent) || "direto";
    sessionStorage.setItem(CHAVE_VISITA, fonte);
    // veio por um link com "?origem=" (os links marcados do painel)? Conta à parte, também 1x por aparelho/dia
    // (precisa ser lido antes de a marca ser apagada do endereço, logo abaixo)
    const marcado = !!normalizarOrigem(params.get("origem"));

    // tira "?origem=..." do endereço: quem copiar o link da barra não leva a marca junto
    if (params.has("origem")) {
      params.delete("origem");
      const resto = params.toString();
      history.replaceState(null, "", location.pathname + (resto ? "?" + resto : "") + location.hash);
    }

    const dia = diaBrasilia();
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CHAVE_PESSOA) || "null"); } catch { /* recomeça */ }
    if (!guardado || guardado.dia !== dia) guardado = { dia, fontes: [] };
    const novaPessoa = !guardado.fontes.includes(fonte);
    if (novaPessoa) guardado.fontes.push(fonte);
    const novaPessoaMarcada = marcado && !guardado.fontes.includes(fonte + "|m");
    if (novaPessoaMarcada) guardado.fontes.push(fonte + "|m");
    try { localStorage.setItem(CHAVE_PESSOA, JSON.stringify(guardado)); } catch { /* sem armazenamento */ }

    import("./dados.js")
      .then((m) => m.registrarEntradaNoSite({ dia, fonte, pagina, novaPessoa, marcado, novaPessoaMarcada }))
      .catch((err) => console.warn("Não foi possível registrar a entrada:", err && err.code));
  } catch (err) { console.warn("Rastreio indisponível:", err); }
}
