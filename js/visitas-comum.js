// Rastreamento de entradas no site: regras compartilhadas entre as páginas públicas (que registram a entrada)
// e o painel administrativo (que monta os links e os gráficos). Só funções puras, sem depender do navegador.
//
// Como funciona: o link divulgado leva "?origem=instagram" (ou whatsapp, ou o que você escolher). Na primeira página
// que a pessoa abre em cada visita, o site soma 1 "entrada" em: dia → origem → página. Quando a pessoa chega sem
// "?origem", a origem é deduzida de onde ela veio (Instagram, Google...) ou fica como "Direto".
import { ORDEM_PAGINAS } from "./utils.js";

export const PREFIXO_DOC_VISITAS = "visitas_";
export const idDocVisitas = (dia) => `${PREFIXO_DOC_VISITAS}${dia}`;

// Origens que o painel já oferece prontas
export const ORIGENS_PRONTAS = [
  { chave: "instagram", rotulo: "Instagram" },
  { chave: "whatsapp", rotulo: "WhatsApp" }
];
const ROTULOS_ORIGEM = {
  direto: "Direto (sem origem)",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  google: "Google",
  youtube: "YouTube",
  x: "X (Twitter)",
  "outro-site": "Outros sites"
};
export function rotuloDaOrigem(chave) {
  if (ROTULOS_ORIGEM[chave]) return ROTULOS_ORIGEM[chave];
  const t = String(chave || "").replace(/[-_]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
}

// Páginas que podem receber a entrada (as mesmas do menu do site)
export const PAGINAS_RASTREADAS = ORDEM_PAGINAS.map((p) => ({ chave: p.chave, rotulo: p.label, href: p.href }));
export const rotuloDaPagina = (chave) => PAGINAS_RASTREADAS.find((p) => p.chave === chave)?.rotulo || chave;

// "Instagram Bio!" → "instagram-bio"  (só letras minúsculas, números, hífen e sublinhado; até 30 caracteres)
export function normalizarOrigem(valor) {
  return String(valor || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

// Quando não há "?origem": de qual site a pessoa veio? Devolve "" se veio direto ou de uma página do próprio site.
export function origemDoReferrer(referrer, hostDoSite = "") {
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
  if (!host) return "";
  const meu = String(hostDoSite).toLowerCase().replace(/^www\./, "");
  if (host === meu || host.endsWith(".vercel.app") && meu.endsWith(".vercel.app")) return "";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook|fb|messenger)\.com$/.test(host) || host === "l.facebook.com") return "facebook";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host)) return "x";
  return "outro-site";
}

// "AAAA-MM-DD" no horário de Brasília (o servidor e o painel usam o mesmo dia)
export function diaBrasilia(instante = new Date()) {
  const d = new Date(instante.getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 10);
}
// os últimos N dias, do mais antigo ao de hoje
export function ultimosDias(n, hoje = diaBrasilia()) {
  const [a, m, d] = hoje.split("-").map(Number);
  const base = Date.UTC(a, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

// Link para divulgar: https://site/pagina?origem=instagram
export function linkRastreavel(base, hrefPagina, origem) {
  const raiz = String(base || "").replace(/\/+$/, "");
  const caminho = hrefPagina === "/" ? "/" : "/" + encodeURI(String(hrefPagina).replace(/^\//, ""));
  return `${raiz}${caminho}?origem=${encodeURIComponent(normalizarOrigem(origem))}`;
}

// docs: [{ dia, fontes: { origem: { pagina: { visitas, pessoas } } } }] → totais para os gráficos e tabelas
export function resumirVisitas(docs, dias) {
  const porDia = new Map(dias.map((d) => [d, { dia: d, visitas: 0, pessoas: 0 }]));
  const porOrigem = new Map();
  const porPagina = new Map();
  const cruzado = new Map(); // "origem|pagina" → { visitas, pessoas }
  let visitas = 0, pessoas = 0;
  const somar = (mapa, chave, v, p) => {
    const x = mapa.get(chave) || { chave, visitas: 0, pessoas: 0 };
    x.visitas += v; x.pessoas += p; mapa.set(chave, x);
  };
  (docs || []).forEach((doc) => {
    if (!doc || !porDia.has(doc.dia)) return;
    Object.entries(doc.fontes || {}).forEach(([origem, paginas]) => {
      Object.entries(paginas || {}).forEach(([pagina, n]) => {
        const v = Number(n?.visitas) || 0, p = Number(n?.pessoas) || 0;
        if (!v && !p) return;
        visitas += v; pessoas += p;
        const dia = porDia.get(doc.dia); dia.visitas += v; dia.pessoas += p;
        somar(porOrigem, origem, v, p);
        somar(porPagina, pagina, v, p);
        somar(cruzado, `${origem}|${pagina}`, v, p);
      });
    });
  });
  const ordenar = (m) => [...m.values()].sort((a, b) => b.visitas - a.visitas || b.pessoas - a.pessoas);
  return { visitas, pessoas, porDia: [...porDia.values()], porOrigem: ordenar(porOrigem), porPagina: ordenar(porPagina), cruzado: ordenar(cruzado) };
}
