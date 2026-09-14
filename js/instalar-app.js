/* ---------------------------------------------------------------------------------------------
   Botão flutuante "Instalar app" (PWA)
   ---------------------------------------------------------------------------------------------
   No Android/Chrome: escuta o evento "beforeinstallprompt", segura ele e só mostra o botão
   quando o navegador avisa que dá pra instalar. Ao clicar, dispara o prompt nativo de instalação.
   No iOS/Safari: esse evento não existe (o Safari nunca deixa instalar por código), então o botão
   aparece direto e, ao clicar, mostra um balão explicando o passo a passo manual (Compartilhar ->
   Adicionar à Tela de Início).
   Se o site já estiver rodando como app instalado (modo standalone), o botão nunca aparece.
------------------------------------------------------------------------------------------------*/
import { mostrarToast } from "./utils.js";

let promptDiferido = null;
let botaoInstalar = null;

function rodandoComoAppInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function criarBotao() {
  if (botaoInstalar) return botaoInstalar;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btnInstalarApp";
  btn.className = "btn-instalar-app";
  btn.setAttribute("aria-label", "Instalar App Arautos");
  btn.innerHTML = `<img src="assets/icone-app-192.png" alt="" /><span>Instalar app</span>`;
  document.body.appendChild(btn);
  botaoInstalar = btn;
  return btn;
}

function mostrarBotao() {
  if (rodandoComoAppInstalado()) return;
  const btn = criarBotao();
  requestAnimationFrame(() => btn.classList.add("visivel"));
}

function esconderBotao() {
  if (!botaoInstalar) return;
  botaoInstalar.classList.remove("visivel");
}

function alternarInstrucoesIOS() {
  const existente = document.getElementById("popoverInstalarIOS");
  if (existente) {
    existente.remove();
    return;
  }
  const popover = document.createElement("div");
  popover.id = "popoverInstalarIOS";
  popover.className = "popover-instalar-ios";
  popover.innerHTML = `
    <button type="button" class="popover-instalar-ios__fechar" aria-label="Fechar">&times;</button>
    <p>Para instalar, toque no ícone de <strong>Compartilhar</strong> (⬆️) na barra do Safari e depois em
    <strong>"Adicionar à Tela de Início"</strong>.</p>
  `;
  document.body.appendChild(popover);
  popover.querySelector(".popover-instalar-ios__fechar").addEventListener("click", () => popover.remove());
  setTimeout(() => { if (popover.isConnected) popover.remove(); }, 9000);
}

if (!rodandoComoAppInstalado()) {
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    promptDiferido = evento;
    mostrarBotao();
  });

  window.addEventListener("appinstalled", () => {
    promptDiferido = null;
    esconderBotao();
    const popover = document.getElementById("popoverInstalarIOS");
    if (popover) popover.remove();
    mostrarToast("App instalado! Já dá pra abrir direto da tela inicial.");
  });

  if (ehIOS()) {
    // Safari nunca dispara "beforeinstallprompt" — mostra o botão direto, com instruções manuais.
    mostrarBotao();
  }

  document.addEventListener("click", async (evento) => {
    const btn = evento.target.closest("#btnInstalarApp");
    if (!btn) return;

    if (promptDiferido) {
      const evt = promptDiferido;
      promptDiferido = null;
      esconderBotao();
      evt.prompt();
      await evt.userChoice;
    } else if (ehIOS()) {
      alternarInstrucoesIOS();
    }
  });
}

// Necessário pro Chrome/Android considerar o site instalável.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Falha ao registrar service worker:", err);
    });
  });
}
