// Service worker: guarda em cache os arquivos do próprio site (HTML, CSS, JS, ícones) para que,
// depois da primeira visita, as páginas abram na hora — sem esperar a rede — tanto no site
// público quanto no painel administrativo. Os DADOS (horários, agendamentos, avisos, frases...)
// nunca passam por aqui: eles vêm do Firestore, que tem seu próprio cache em tempo real
// (veja js/firebase-init.js) e por isso continuam sempre atualizados.
const CACHE_NAME = "arautos-shell-v50";

const ARQUIVOS_APP_SHELL = [
  "./",
  "./index.html",
  "./agendamento.html",
  "./intencoes.html",
  "./avisos.html",
  "./meus-agendamentos.html",
  "./contatos.html",
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
  "./js/contatos.js",
  "./js/admin.js",
  "./js/docx-intencoes.js",
  "./js/acessos.js",
  "./js/contas.js",
  "./js/instalar-app.js",
  "./js/pdf-intencoes.js",
  "./js/sw-registro.js",
  "./assets/logo.png",
  "./assets/favicon.png?v=2",
  "./assets/selo-adoracao.png",
  "./assets/cruz-ornamento.png",
  "./assets/icone-app-192.png?v=2",
  "./assets/icone-app-512.png?v=2",
  "./assets/icone-app-180.png?v=2"
];

// IMPORTANTE: o Vercel redireciona "agendamento.html" para "agendamento" (URLs limpas). Uma resposta
// que veio de um redirecionamento NÃO pode ser entregue como página pelo service worker — o
// navegador mostra "ERR_FAILED / Não é possível acessar esse site". Por isso toda resposta
// guardada ou entregue passa por aqui, que a copia sem a marca de "redirecionada".
async function semRedirecionamento(resposta) {
  if (!resposta || !resposta.redirected) return resposta;
  const corpo = await resposta.clone().blob();
  return new Response(corpo, { status: resposta.status, statusText: resposta.statusText, headers: resposta.headers });
}

self.addEventListener("install", (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // um arquivo por vez (se um não existir, o resto continua) e já sem a marca de redirecionamento
      Promise.all(ARQUIVOS_APP_SHELL.map((arquivo) =>
        fetch(arquivo, { cache: "reload" })
          .then(async (resposta) => { if (resposta.ok) await cache.put(arquivo, await semRedirecionamento(resposta)); })
          .catch(() => {})
      ))
    )
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME && n !== CACHE_EXTERNO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});


// Cache à parte (nunca apagado nas atualizações do site) para o que é de terceiros e não muda:
// as fontes do Google e o código do Firebase (a URL já traz a versão). Assim, depois da primeira
// visita, nem as fontes nem o Firebase precisam ser baixados de novo pela internet do celular.
const CACHE_EXTERNO = "arautos-externo-v1";

// Painel administrativo: continua buscando a versão mais nova na rede primeiro (quem administra
// precisa ver na hora o que acabou de ser publicado). O resto do site abre direto do cache.
const ARQUIVOS_ADMIN = /\/(admin(\.html)?|js\/(admin|acessos|contas|docx-intencoes|pdf-intencoes)\.js|css\/admin\.css)$/;

function ehNavegacao(requisicao) {
  return requisicao.mode === "navigate";
}

async function acharNoCache(cache, requisicao, url) {
  let achado = await cache.match(requisicao, { ignoreSearch: ehNavegacao(requisicao) });
  if (!achado && ehNavegacao(requisicao)) {
    // o Vercel serve /agendamento (sem .html) — o cache inicial guardou como agendamento.html
    const caminho = url.pathname === "/" ? "./index.html" : "." + url.pathname.replace(/\/$/, "") + ".html";
    achado = await cache.match(caminho);
  }
  return semRedirecionamento(achado);
}

// rede primeiro, com limite de tempo, e cache só se a rede falhar (painel admin)
function redePrimeiro(evento, requisicao, url) {
  return Promise.race([
    fetch(requisicao),
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("tempo esgotado")), 3500))
  ])
    .then((respostaRede) => {
      if (respostaRede && respostaRede.ok) {
        const copia = respostaRede.clone();
        caches.open(CACHE_NAME).then(async (cache) => cache.put(requisicao, await semRedirecionamento(copia)));
      }
      return respostaRede;
    })
    .catch(async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const guardado = await acharNoCache(cache, requisicao, url);
        if (guardado) return guardado;
      } catch { /* cai na rede abaixo */ }
      return fetch(requisicao);
    });
}

// "stale-while-revalidate": mostra NA HORA o que já está guardado e, em segundo plano, baixa a
// versão mais nova pra próxima abertura. É isso que faz o app abrir instantaneamente no celular,
// sem esperar a rede a cada página. Se não houver nada guardado ainda, busca na rede normalmente.
async function cacheEAtualiza(evento, requisicao, url) {
  const cache = await caches.open(CACHE_NAME);
  const guardado = await acharNoCache(cache, requisicao, url);
  const atualizacao = fetch(requisicao)
    .then(async (respostaRede) => {
      if (respostaRede && respostaRede.ok) await cache.put(requisicao, await semRedirecionamento(respostaRede.clone()));
      return respostaRede;
    })
    .catch(() => null);
  if (guardado) {
    evento.waitUntil(atualizacao);
    return guardado;
  }
  // nada guardado ainda: segue a rede normalmente (inclusive redirecionamentos, que o navegador resolve sozinho)
  return (await atualizacao) || fetch(requisicao);
}

// fontes e Firebase: usa o que está guardado; se não houver, baixa e guarda
async function cacheExterno(evento, requisicao, revalidar) {
  const cache = await caches.open(CACHE_EXTERNO);
  const guardado = await cache.match(requisicao);
  const buscar = () => fetch(requisicao).then((resposta) => {
    if (resposta && (resposta.ok || resposta.type === "opaque")) cache.put(requisicao, resposta.clone());
    return resposta;
  });
  if (guardado) {
    if (revalidar) evento.waitUntil(buscar().catch(() => {}));
    return guardado;
  }
  return buscar();
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.googleapis.com") {
      evento.respondWith(cacheExterno(evento, requisicao, true));   // CSS das fontes: atualiza em segundo plano
    } else if (url.hostname === "fonts.gstatic.com" || (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))) {
      evento.respondWith(cacheExterno(evento, requisicao, false));  // arquivos com versão fixa: nunca mudam
    }
    return; // Firestore, Cloudinary etc. seguem direto pra rede
  }

  // rede de segurança: se qualquer coisa der errado aqui dentro, a página é buscada direto na
  // internet, como se o service worker não existisse — nunca mais uma tela de erro por causa dele
  const resposta = ARQUIVOS_ADMIN.test(url.pathname)
    ? redePrimeiro(evento, requisicao, url)
    : cacheEAtualiza(evento, requisicao, url);
  evento.respondWith(resposta.catch(() => fetch(requisicao)));
});
