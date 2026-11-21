// Painel: "Origem das visitas" — links para divulgar (cada página × Instagram/WhatsApp/outra origem) e os resultados
// em números e gráficos. As regras de contagem estão em js/visitas-comum.js; quem registra a entrada é js/rastreio.js.
import {
  ORIGENS_PRONTAS, PAGINAS_RASTREADAS, ultimosDias, linkRastreavel, normalizarOrigem, resumirVisitas,
  rotuloDaOrigem, rotuloDaPagina, diaBrasilia
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
  let modo = "todas"; // todas | marcadas | sem-marca
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

  // Origens dos links marcados: Instagram e WhatsApp sempre aparecem (mesmo com 0), depois as outras que tiverem entradas
  function origensMarcadas(lista) {
    const achada = (chave) => lista.find((x) => x.chave === chave) || { chave, visitas: 0, pessoas: 0 };
    const fixas = ORIGENS_PRONTAS.map((o) => achada(o.chave));
    const outras = lista.filter((x) => !ORIGENS_PRONTAS.some((o) => o.chave === x.chave));
    return [...fixas, ...outras];
  }

  function desenharResultados(docs) {
    const dias = ultimosDias(periodo);
    const r = resumirVisitas(docs, dias, modo);
    const rm = modo === "marcadas" ? r : resumirVisitas(docs, dias, "marcadas");
    const rs = modo === "sem-marca" ? r : resumirVisitas(docs, dias, "sem-marca");
    const melhorOrigem = r.porOrigem[0], melhorPagina = r.porPagina[0];
    const porOrigemMarcada = (chave) => rm.porOrigem.find((x) => x.chave === chave) || { visitas: 0, pessoas: 0 };
    // as duas partes lado a lado: quem veio por link com ?origem= e quem veio sem marca
    const bloco = (titulo, dica, t, classe) => `<div class="vis-divisao__item ${classe}"><div class="vis-divisao__titulo">${titulo}</div><div class="vis-divisao__num"><strong>${num(t.visitas)}</strong> ${t.visitas === 1 ? "entrada" : "entradas"} · ${plural(t.pessoas, "pessoa", "pessoas")}</div><div class="vis-divisao__dica">${dica}</div></div>`;
    $("visDivisao").innerHTML =
      bloco("🔗 Por link com ?origem=", `📸 Instagram: <strong>${num(porOrigemMarcada("instagram").visitas)}</strong> · 💬 WhatsApp: <strong>${num(porOrigemMarcada("whatsapp").visitas)}</strong>`, r.totais.marcadas, "vis-divisao__item--marcada") +
      bloco("Sem marca", "reconhecido pelo site, aplicativo instalado ou sem identificação", r.totais.semMarca, "");
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

    // em "Todas", a lista por origem já vem separada em dois grupos
    $("visPorOrigem").innerHTML = modo === "todas"
      ? `<h5 class="vis-grupo">🔗 Por link com ?origem= — ${plural(rm.visitas, "entrada", "entradas")}</h5>` +
        barrasHorizontais(origensMarcadas(rm.porOrigem), rotuloDaOrigem) +
        `<h5 class="vis-grupo">Sem marca — ${plural(rs.visitas, "entrada", "entradas")}</h5>` +
        (rs.porOrigem.length ? barrasHorizontais(rs.porOrigem, rotuloDaOrigem) : '<p class="mensagem-vazia">Nenhuma entrada sem marca neste período.</p>')
      : barrasHorizontais(modo === "marcadas" ? origensMarcadas(r.porOrigem) : r.porOrigem, rotuloDaOrigem);
    $("visPorPagina").innerHTML = barrasHorizontais(r.porPagina, rotuloDaPagina);
    $("visDetalhes").innerHTML = r.cruzado.length
      ? `<div class="vis-tabela vis-tabela--detalhe">
          <div class="vis-linha vis-linha--cab"><div>Origem</div><div>Página de entrada</div><div class="vis-num">Entradas</div><div class="vis-num">Pessoas</div></div>
          ${r.cruzado.slice(0, 60).map((x) => { const [o, p] = x.chave.split("|"); return `<div class="vis-linha"><div>${esc(rotuloDaOrigem(o))}</div><div>${esc(rotuloDaPagina(p))}</div><div class="vis-num">${num(x.visitas)}</div><div class="vis-num">${num(x.pessoas)}</div></div>`; }).join("")}
        </div>`
      : "";
  }

  // números do período, por dia. O dia de hoje é mantido em tempo real (ver iniciarAoVivo).
  const porDia = new Map();
  let diaAoVivo = null, pararAoVivo = null, relogio = null, aberto = false;

  function redesenhar() {
    const docs = [...porDia.values()];
    desenharResultados(docs);
    const r = resumirVisitas(docs, ultimosDias(periodo));
    $("visResumoCab").textContent = `${plural(r.visitas, "entrada", "entradas")} · ${periodo} dias`;
  }
  function marcarAoVivo(ok, erro) {
    const el = $("visAoVivo");
    if (erro) { el.className = "vis-aovivo vis-aovivo--off"; el.textContent = "Tempo real indisponível agora — use ↻ Atualizar."; return; }
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
    el.className = "vis-aovivo";
    el.innerHTML = `<span class="vis-aovivo__ponto" aria-hidden="true"></span> Ao vivo · atualizado às ${hora}`;
  }
  function pararTempoReal() {
    if (pararAoVivo) { try { pararAoVivo(); } catch { /* ignora */ } pararAoVivo = null; }
    if (relogio) { clearInterval(relogio); relogio = null; }
    diaAoVivo = null;
    const el = $("visAoVivo"); if (el) { el.textContent = ""; el.className = "vis-aovivo"; }
  }
  function iniciarAoVivo() {
    pararTempoReal();
    if (!opcoes.ouvirDia) return;
    const hoje = diaBrasilia();
    diaAoVivo = hoje;
    let primeira = true;
    pararAoVivo = opcoes.ouvirDia(hoje, (dados) => {
      if (dados) porDia.set(hoje, { dia: hoje, ...dados }); else porDia.delete(hoje);
      if (primeira) { primeira = false; if (!carregou) return; }
      if (carregou) { redesenhar(); marcarAoVivo(true); }
    }, () => marcarAoVivo(false, true));
    // quando vira o dia (meia-noite de Brasília), recarrega o período e passa a ouvir o dia novo
    relogio = setInterval(() => { if (aberto && diaBrasilia() !== diaAoVivo) { carregar().then(iniciarAoVivo); } }, 30000);
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    $("visEstado").textContent = "Carregando...";
    try {
      const docs = await opcoes.obterVisitas(ultimosDias(periodo));
      porDia.clear();
      docs.forEach((d) => porDia.set(d.dia, d));
      carregou = true;
      redesenhar();
      $("visEstado").textContent = "";
      if (pararAoVivo) marcarAoVivo(true);
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
  const botoesFiltro = document.querySelectorAll("#visFiltro button");
  botoesFiltro.forEach((b) => b.addEventListener("click", () => {
    modo = b.dataset.modo;
    botoesFiltro.forEach((o) => { o.classList.toggle("ativa", o === b); o.setAttribute("aria-pressed", String(o === b)); });
    if (carregou) redesenhar();
  }));

  // as duas listas começam fechadas; os números só são lidos do banco na primeira vez que "Resultados" é aberto
  function ligarQuadro(idQuadro, idCabecalho, idCorpo, aoAbrir) {
    const quadro = $(idQuadro), cab = $(idCabecalho), corpo = $(idCorpo);
    const alternar = () => {
      const abrir = corpo.classList.contains("oculto");
      corpo.classList.toggle("oculto", !abrir);
      quadro.classList.toggle("aberto", abrir);
      cab.setAttribute("aria-expanded", String(abrir));
      if (aoAbrir) aoAbrir(abrir);
    };
    cab.addEventListener("click", alternar);
    cab.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } });
  }
  ligarQuadro("quadroVisLinks", "cabecalhoVisLinks", "corpoVisLinks");
  // "Resultados": ao abrir, lê o período e passa a acompanhar o dia de hoje em tempo real; ao fechar, para de escutar
  ligarQuadro("quadroVisResultados", "cabecalhoVisResultados", "corpoVisResultados", async (abrir) => {
    aberto = abrir;
    if (!abrir) { pararTempoReal(); return; }
    if (!carregou) await carregar(); else carregar();
    iniciarAoVivo();
  });

  desenharLinks();
  return {
    // mantido por compatibilidade: abrir a página não lê mais nada; a leitura acontece ao abrir "Resultados"
    aoAbrir() {}
  };
}
