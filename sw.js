// Service worker mínimo — existe só para o site ser reconhecido como instalável (PWA) pelo Chrome/Android.
// Não faz cache de nada de propósito: os dados vêm do Firestore em tempo real e não queremos
// mostrar informação desatualizada (horários, agendamentos, avisos) quando alguém abre o app instalado.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (evento) => {
  evento.respondWith(fetch(evento.request));
});
