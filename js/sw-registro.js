// Registra o service worker (js/sw.js) — usado tanto pelo site público (via instalar-app.js)
// quanto pelo painel administrativo, para que os arquivos do site fiquem em cache e abram mais
// rápido no celular, principalmente quando instalado como app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Falha ao registrar service worker:", err);
    });
  });
}
