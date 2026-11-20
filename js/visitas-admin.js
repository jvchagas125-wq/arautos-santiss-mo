// Painel: "Origem das visitas" — links para divulgar (cada página × Instagram/WhatsApp/outra origem) e os resultados
// em números e gráficos. As regras de contagem estão em js/visitas-comum.js; quem registra a entrada é js/rastreio.js.
import {
  ORIGENS_PRONTAS, PAGINAS_RASTREADAS, ultimosDias, linkRastreavel, normalizarOrigem, resumirVisitas,
  rotuloDaOrigem, rotuloDaPagina
} from "./visitas-comum.js";

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Number(n).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
const formatarDia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* tenta o jeito antigo */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch { return false; }
}

/* opcoes: { obterVisitas(dias) → docs, toast(msg), base? (endereço do site) } */
export function iniciarVisitasAdmin(opcoes) {
  const $ = (id) => document.getElementById(id);
  const caixaLinks = $("visLinks"), campoOutra = $("visOutraOrigem");
  const abas = document.querySelectorAll("#visAbas button");
  const base = opcoes.base || location.origin;
  let periodo = 30;
  let carregou = false, carregando = false;

  /* ---------- links para divulgar ---------- */
  function desenharLinks() {
    const outra = normalizarOrigem(campoOutra.value);
    const origens = [...ORIGENS_PRONTAS, ...(outra && !ORIGENS_PRONTAS.some((o) => o.chave === outra) ? [{ chave: outra, rotulo: rotuloDaOrigem(outra) }] : [])];
    caixaLinks.innerHTML = `
      <div class="vis-tabela" role="table">
        <div class="vis-linha vis-linha--cab" role="row">
          <div role="columnheader">Página</div>
          ${origens.map((o) => `<div role="columnheader">${esc(o.rotulo)}</div>`).join("")}
        </div>
        ${PAGINAS_RASTREADAS.map((p) => `
          <div class="vis-linha" role="row">
            <div class="vis-pagina" role="cell">${esc(p.rotulo)}</div>
            ${origens.map((o) => {
              const link = linkRastreavel(base, p.href, o.chave);
              return `<div role="cell"><button type="button" class="btn btn-contorno btn-pequeno vis-copiar" data-link="${esc(link)}" title="${esc(link)}">Copiar link</button></div>`;
            }).join("")}
          </div>`).join("")}
      </div>`;
    caixaLinks.querySelectorAll(".vis-copiar").forEach((b) => b.addEventListener("click", async () => {
      const ok = await copiar(b.dataset.link);
      opcoes.toast(ok ? "Link copiado!" : "Não foi possível copiar. Tente de novo.");
      if (ok) { const t = b.textContent; b.textContent = "Copiado ✓"; setTimeout(() => { b.textContent = t; }, 1600); }
    }));
  }
  campoOutra.addEventListener("input", desenharLinks);

  /* ---------- resultados ---------- */
  function barrasHorizontais(lista, rotulo) {
    if (!lista.length) return '<p class="mensagem-vazia">Ainda sem entradas neste período.</p>';
    const max = Math.max(...lista.map((x) => x.visitas), 1);
    return lista.map((x) => `
      <div class="vis-barra">
        <div class="vis-barra__topo"><span>${esc(rotulo(x.chave))}</span><span><strong>${num(x.visitas)}</strong> ${x.visitas === 1 ? "entrada" : "entradas"} · ${plural(x.pessoas, "pessoa", "pessoas")}</span></div>
        <div class="vis-barra__trilho"><div class="vis-barra__preenchido" style="width:${Math.max(2, (x.visitas / max) * 100)}%"></div></div>
      </div>`).join("");
  }

  function graficoPorDia(dias) {
    const L = 600, A = 170, ml = 30, mr = 6, mt = 10, mb = 22;
    const max = Math.max(...dias.map((d) => d.visitas), 1);
    const teto = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const larg = (L - ml - mr) / dias.length;
    const y = (v) => A - mb - (v / teto) * (A - mt - mb);
    const grade = [0, 1, 2, 3, 4].map((i) => {
      const v = (teto / 4) * i;
      return `<line class="grafico__grade" x1="${ml}" x2="${L - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="grafico__eixo" x="${ml - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`;
    }).join("");
    const passo = Math.max(1, Math.ceil(dias.length / 6));
    const barras = dias.map((d, i) => {
      const x = ml + i * larg + larg * 0.15, w = Math.max(1.5, larg * 0.7);
      const rotuloX = i % passo === 0 || i === dias.length - 1 ? `<text class="grafico__eixo" x="${x + w / 2}" y="${A - 6}" text-anchor="middle">${formatarDia(d.dia)}</text>` : "";
      return `<rect class="vis-coluna" data-i="${i}" x="${x}" y="${y(d.visitas)}" width="${w}" height="${Math.max(0, A - mb - y(d.visitas))}" rx="1.5"/>${rotuloX}`;
    }).join("");
    return `<svg class="grafico__svg vis-svg" viewBox="0 0 ${L} ${A}" role="img" aria-label="Entradas por dia">${grade}${barras}</svg>`;
  }

  function desenharResultados(docs) {
    const dias = ultimosDias(periodo);
    const r = resumirVisitas(docs, dias);
    const melhorOrigem = r.porOrigem[0], melhorPagina = r.porPagina[0];
    $("visKpis").innerHTML = [
      [num(r.visitas), r.visitas === 1 ? "entrada" : "entradas"],
      [num(r.pessoas), r.pessoas === 1 ? "pessoa" : "pessoas"],
      [melhorOrigem ? esc(rotuloDaOrigem(melhorOrigem.chave)) : "—", "origem que mais traz gente"],
      [melhorPagina ? esc(rotuloDaPagina(melhorPagina.chave)) : "—", "página mais usada para entrar"]
    ].map(([v, t]) => `<span class="crm-resumo__item"><strong>${v}</strong> ${t}</span>`).join("");

    $("visGrafico").innerHTML = r.visitas ? graficoPorDia(r.porDia) : '<p class="mensagem-vazia">Ainda não há entradas registradas neste período. Divulgue os links acima e os números aparecem aqui.</p>';
    const dica = $("visDica");
    dica.textContent = "";
    $("visGrafico").querySelectorAll(".vis-coluna").forEach((c) => {
      const mostrar = () => { const d = r.porDia[Number(c.dataset.i)]; dica.textContent = `${formatarDia(d.dia)}: ${plural(d.visitas, "entrada", "entradas")} · ${plural(d.pessoas, "pessoa", "pessoas")}`; };
      c.addEventListener("pointerenter", mostrar); c.addEventListener("pointerdown", mostrar);
    });

    $("visPorOrigem").innerHTML = barrasHorizontais(r.porOrigem, rotuloDaOrigem);
    $("visPorPagina").innerHTML = barrasHorizontais(r.porPagina, rotuloDaPagina);
    $("visDetalhes").innerHTML = r.cruzado.length
      ? `<div class="vis-tabela vis-tabela--detalhe">
          <div class="vis-linha vis-linha--cab"><div>Origem</div><div>Página de entrada</div><div class="vis-num">Entradas</div><div class="vis-num">Pessoas</div></div>
          ${r.cruzado.slice(0, 60).map((x) => { const [o, p] = x.chave.split("|"); return `<div class="vis-linha"><div>${esc(rotuloDaOrigem(o))}</div><div>${esc(rotuloDaPagina(p))}</div><div class="vis-num">${num(x.visitas)}</div><div class="vis-num">${num(x.pessoas)}</div></div>`; }).join("")}
        </div>`
      : "";
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    $("visEstado").textContent = "Carregando...";
    try {
      const docs = await opcoes.obterVisitas(ultimosDias(periodo));
      carregou = true;
      desenharResultados(docs);
      $("visEstado").textContent = "";
    } catch (err) {
      console.error(err);
      $("visEstado").textContent = "Não foi possível carregar os números agora.";
    } finally { carregando = false; }
  }

  abas.forEach((b) => b.addEventListener("click", () => {
    periodo = Number(b.dataset.dias);
    abas.forEach((o) => { o.classList.toggle("ativa", o === b); o.setAttribute("aria-pressed", String(o === b)); });
    carregar();
  }));
  $("visAtualizar").addEventListener("click", carregar);

  desenharLinks();
  return {
    // chamado quando a página "Origem das visitas" é aberta: só então lê os números do banco (poupa leituras)
    aoAbrir() { if (!carregou) carregar(); }
  };
}
