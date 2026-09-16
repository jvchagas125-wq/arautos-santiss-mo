// Service worker: guarda em cache os arquivos do próprio site (HTML, CSS, JS, ícones) para que,
// depois da primeira visita, as páginas abram na hora — sem esperar a rede — tanto no site
// público quanto no painel administrativo. Os DADOS (horários, agendamentos, avisos, frases...)
// nunca passam por aqui: eles vêm do Firestore, que tem seu próprio cache em tempo real
// (veja js/firebase-init.js) e por isso continuam sempre atualizados.
const CACHE_NAME = "arautos-shell-v2";

const ARQUIVOS_APP_SHELL = [
  "./",
  "./index.html",
  "./agendamento.html",
  "./intencoes.html",
  "./avisos.html",
  "./meus-agendamentos.html",
  "./sobre.html",
  "./admin.html",
  "./manifest.json",
  "./css/style.css",
  "./js/main.js",
  "./js/utils.js",
  "./js/dados.js",
  "./js/auth.js",
  "./js/firebase-init.js",
  "./js/firebase-config.js",
  "./js/agendamento.js",
  "./js/intencoes.js",
  "./js/avisos.js",
  "./js/meus-agendamentos.js",
  "./js/sobre.js",
  "./js/admin.js",
  "./js/instalar-app.js",
  "./js/sw-registro.js",
  "./assets/logo.png",
  "./assets/favicon.png",
  "./assets/selo-adoracao.png",
  "./assets/cruz-ornamento.png",
  "./assets/icone-app-192.png",
  "./assets/icone-app-512.png",
  "./assets/icone-app-180.png"
];

self.addEventListener("install", (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll falha inteiro se um arquivo não existir — adiciona um por um pra não travar o resto
      Promise.all(ARQUIVOS_APP_SHELL.map((arquivo) => cache.add(arquivo).catch(() => {})))
    )
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  // só cuida dos arquivos do próprio site — Firestore, fontes do Google etc. seguem direto pra rede
  if (url.origin !== self.location.origin) return;

  // stale-while-revalidate: responde na hora com o que já tem em cache (se tiver) e, ao mesmo
  // tempo, busca uma versão nova na rede pra já deixar pronta pra próxima vez.
  evento.respondWith(
    caches.match(requisicao).then((respostaCache) => {
      const buscaRede = fetch(requisicao)
        .then((respostaRede) => {
          if (respostaRede && respostaRede.ok) {
            const copia = respostaRede.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(requisicao, copia));
          }
          return respostaRede;
        })
        .catch(() => respostaCache);
      return respostaCache || buscaRede;
    })
  );
});
