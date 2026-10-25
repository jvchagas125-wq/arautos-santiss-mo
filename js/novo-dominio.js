// Aviso de mudança de endereço: o site agora tem domínio próprio (arautoscampos.org.br).
// - Nos endereços antigos (…vercel.app e qualquer outro que não seja o novo): mostra um pop-up convidando a
//   acessar o endereço novo; ao tocar, leva a pessoa para lá.
// - No endereço novo: o pop-up NUNCA aparece. Quem chegou pelo pop-up vê só um lembrete curto para
//   instalar o app com o endereço novo (um app instalado fica preso ao endereço em que foi instalado, então
//   o navegador exige instalar de novo — o botão "Instalar app" do site faz isso).
import { mostrarToast, abrirModal, fecharModal } from "./utils.js";

const DOMINIO_NOVO = "arautoscampos.org.br";
const ORIGEM_NOVA = `https://www.${DOMINIO_NOVO}`;
const CHAVE_ADIADO = "arautos-aviso-dominio-adiado";
const PARAM = "migrado";

function noEnderecoNovo() {
  const h = location.hostname.toLowerCase();
  return h === DOMINIO_NOVO || h === `www.${DOMINIO_NOVO}`;
}
function comoAppInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function enderecoNovoDestino() {
  const params = new URLSearchParams(location.search);
  params.set(PARAM, comoAppInstalado() ? "app" : "1");
  const caminho = location.pathname === "/index.html" ? "/" : location.pathname;
  return `${ORIGEM_NOVA}${caminho}?${params.toString()}${location.hash}`;
}

function lembreteNoEnderecoNovo() {
  const params = new URLSearchParams(location.search);
  if (!params.has(PARAM)) return;
  const veioDoApp = params.get(PARAM) === "app";
  params.delete(PARAM);
  const resto = params.toString();
  history.replaceState(null, "", location.pathname + (resto ? `?${resto}` : "") + location.hash);
  if (comoAppInstalado()) return; // já está no app com o endereço novo: nada a lembrar
  setTimeout(() => mostrarToast(
    veioDoApp
      ? "Você já está no endereço novo! Toque em \"Instalar app\" para ter o app atualizado — e pode apagar o ícone antigo."
      : "Você já está no endereço novo! Se quiser o app no celular, toque em \"Instalar app\"."
  ), 1200);
}

function mostrarAviso() {
  try { if (sessionStorage.getItem(CHAVE_ADIADO) === "1") return; } catch (e) { /* sem armazenamento: mostra sempre */ }
  if (document.getElementById("modalNovoDominio")) return;
  const instalado = comoAppInstalado();
  const destino = enderecoNovoDestino();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modalNovoDominio";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tituloNovoDominio");
  overlay.innerHTML = `
    <div class="modal modal--novo-dominio">
      <div class="modal__icone"><img src="assets/logo.png" alt="Arautos do Evangelho" /></div>
      <h3 id="tituloNovoDominio">Nosso endereço mudou!</h3>
      <p class="novo-dominio__texto">
        Agora os Arautos do Evangelho Campos têm um domínio próprio:
        <strong>${DOMINIO_NOVO}</strong>.
        Você está acessando pelo link antigo — <a href="${destino}" class="novo-dominio__link">acesse agora clicando aqui</a>.
      </p>
      ${instalado ? `<p class="novo-dominio__nota">Você usa o app instalado: ao abrir o endereço novo, toque em
        <strong>"Instalar app"</strong> para deixá-lo atualizado e depois pode apagar o ícone antigo.</p>` : ""}
      <a href="${destino}" class="btn btn-dourado btn-full novo-dominio__botao">Acessar o endereço novo</a>
      <button type="button" class="novo-dominio__depois">Agora não</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => abrirModal(overlay));
  overlay.querySelector(".novo-dominio__depois").addEventListener("click", () => {
    try { sessionStorage.setItem(CHAVE_ADIADO, "1"); } catch (e) { /* ok */ }
    fecharModal(overlay);
  });
}

export function iniciarAvisoNovoDominio() {
  if (noEnderecoNovo()) { lembreteNoEnderecoNovo(); return; }
  if (!document.body) return;
  // um pouco depois de a página carregar, pra não atrapalhar a abertura
  setTimeout(mostrarAviso, 900);
}
