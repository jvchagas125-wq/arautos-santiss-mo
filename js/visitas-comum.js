// Rastreamento de entradas no site: regras compartilhadas entre as páginas públicas (que registram a entrada)
// e o painel administrativo (que monta os gráficos). Só funções puras, sem depender do navegador.
//
// Como funciona: na primeira página que a pessoa abre em cada visita, o site soma 1 "entrada" em: dia → origem →
// página. A origem é deduzida de onde a pessoa veio (site de origem, ícone do aplicativo instalado ou aplicativo que
// abriu o link — Instagram, Facebook, TikTok) ou fica como "Direto".
import { ORDEM_PAGINAS } from "./utils.js";

export const PREFIXO_DOC_VISITAS = "visitas_";
export const idDocVisitas = (dia) => `${PREFIXO_DOC_VISITAS}${dia}`;

const ROTULOS_ORIGEM = {
  direto: "Direto ou WhatsApp (sem identificação)",
  "app-instalado": "Aplicativo instalado (ícone na tela)",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  tiktok: "TikTok",
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
export const PAGINAS_RASTREADAS = ORDEM_PAGINAS.map((p) => ({ chave: p.chave, rotulo: p.label }));
export const rotuloDaPagina = (chave) => PAGINAS_RASTREADAS.find((p) => p.chave === chave)?.rotulo || chave;

// De qual site a pessoa veio (endereço de origem informado pelo navegador)? Devolve "" se veio direto ou de uma página do próprio site.
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

// Sem "?origem" e sem site de origem: o próprio navegador do aplicativo se identifica. Quando alguém abre um link
// dentro do Instagram, do Facebook/Messenger ou do TikTok, o "user agent" traz o nome do app. O WhatsApp NÃO se
// identifica (abre no Chrome/Safari normal), então para ele só vale o link com "?origem=whatsapp".
export function origemDoNavegador(userAgent) {
  const ua = String(userAgent || "");
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FBSV|Messenger/i.test(ua)) return "facebook";
  if (/musical_ly|TikTok|BytedanceWebview|Bytedance/i.test(ua)) return "tiktok";
  return "";
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

// Soma as entradas gravadas (um documento por dia) no período: totais, por dia, por origem, por página e origem × página.
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
