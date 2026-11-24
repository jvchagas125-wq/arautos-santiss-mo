// Pinta o logo e o fundo JÁ NO PRIMEIRO QUADRO da página (script comum, sem "module", carregado no <head>).
//
// Antes, o logo e a foto de fundo só eram aplicados por js/utils.js, que roda depois que a página inteira foi lida:
// a página aparecia com o logo padrão e o fundo vazio e, uma fração de segundo depois, as imagens certas "pulavam" no
// lugar (e o logo ainda fazia fade-in de novo a cada página). Aqui lemos o que ficou guardado neste aparelho
// (a mesma chave que utils.js grava: arautos_config_visual_cache) e já deixamos tudo pronto antes de qualquer pintura.
// utils.js continua fazendo o mesmo depois, com a configuração atual do banco — aqui é só para não piscar.
(function () {
  "use strict";
  var raiz = document.documentElement;
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem("arautos_config_visual_cache") || "null"); } catch (e) { /* sem cache */ }

  // Navegação dentro do site (já entrou nesta sessão): as animações de entrada não repetem a cada página.
  try {
    if (sessionStorage.getItem("arautos_ja_entrou")) raiz.classList.add("nav-interna");
    sessionStorage.setItem("arautos_ja_entrou", "1");
  } catch (e) { /* sem armazenamento: só perde a otimização */ }

  if (!cache) return;

  function otimizar(url, largura) {
    var m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url || "");
    return m ? m[1] + "f_auto,q_auto,c_limit,w_" + largura + "/" + m[2] : url;
  }
  function precarregar(url) {
    if (!url || /^data:/.test(url)) return;
    try {
      var l = document.createElement("link");
      l.rel = "preload"; l.as = "image"; l.href = url;
      document.head.appendChild(l);
    } catch (e) { /* só uma otimização */ }
  }
  var computador = false;
  try { computador = window.matchMedia("(min-width: 1000px) and (hover: hover) and (pointer: fine)").matches; } catch (e) { /* celular */ }

  var caminho = location.pathname;
  var ehAdmin = /^\/admin(\.html)?\/?$/.test(caminho);
  var ehInicio = /^\/(index(\.html)?)?$/.test(caminho);

  // ---- fundo ----
  try {
    if (!ehAdmin && !ehInicio) {
      // demais páginas: fundo próprio (celular/computador) ou o padrão vermelho adamascado
      var aplicar = function (url, variavel, classe, largura) {
        if (!url) return "";
        var o = otimizar(url, largura);
        raiz.style.setProperty(variavel, "url('" + o + "')");
        raiz.classList.add(classe);
        return o;
      };
      var cel = aplicar(cache.fundoOutrasUrl, "--fundo-outras-img", "fundo-outras-cel", 1000);
      var pc = aplicar(cache.fundoOutrasPcUrl, "--fundo-outras-img-pc", "fundo-outras-pc", 1920);
      precarregar(computador ? (pc || cel) : cel);
    } else if (ehInicio) {
      var fundoPc = "";
      if (cache.fundoPcUrl) {
        fundoPc = otimizar(cache.fundoPcUrl, 1920);
        raiz.style.setProperty("--fundo-img-pc", "url('" + fundoPc + "')");
      }
      if (cache.fundoUrl) {
        var fundoCel = otimizar(cache.fundoUrl, 1000);
        raiz.style.setProperty("--fundo-img", "url('" + fundoCel + "')");
        precarregar(computador && fundoPc ? fundoPc : fundoCel);
      }
    }
  } catch (e) { /* o utils.js aplica depois */ }

  // ---- logo: troca o logo padrão pelo atual assim que cada <img class="js-logo"> aparece na página ----
  if (cache.logoUrl) {
    var logo = otimizar(cache.logoUrl, 500);
    precarregar(logo);
    var trocar = function (img) {
      if (img.getAttribute("data-logo-cache") === "1") return;
      img.setAttribute("data-logo-cache", "1");
      img.addEventListener("error", function () { if (img.src !== cache.logoUrl) img.src = cache.logoUrl; }, { once: true });
      img.src = logo;
    };
    var varrer = function (no) {
      if (no.nodeType !== 1) return;
      if (no.matches && no.matches("img.js-logo")) trocar(no);
      if (no.querySelectorAll) { var l = no.querySelectorAll("img.js-logo"); for (var i = 0; i < l.length; i++) trocar(l[i]); }
    };
    try {
      var obs = new MutationObserver(function (lista) {
        for (var i = 0; i < lista.length; i++) for (var j = 0; j < lista[i].addedNodes.length; j++) varrer(lista[i].addedNodes[j]);
      });
      obs.observe(raiz, { childList: true, subtree: true });
      document.addEventListener("DOMContentLoaded", function () { varrer(document.body); obs.disconnect(); });
    } catch (e) { /* o utils.js aplica depois */ }
  }
})();
