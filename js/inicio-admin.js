// Painel administrativo: página inicial — blocos que levam a cada página do painel e um gráfico
// pequeno com o total de pessoas cadastradas no site ao longo do tempo.
import { firebaseConfig } from "./firebase-config.js";
import { ouvirTodosUsuarios } from "./dados.js";

/* ---------------- Gráfico: pessoas cadastradas ao longo do tempo ---------------- */

const DIA_MS = 24 * 60 * 60 * 1000;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const doisDigitos = (n) => String(n).padStart(2, "0");
const inicioDoDia = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

// Série acumulada: [{ rotulo, rotuloCurto, total }] — total de pessoas cadastradas ATÉ o fim de cada ponto.
//  periodo "30d"  → um ponto por dia, últimos 30 dias
//  periodo "12m"  → um ponto por mês, últimos 12 meses
//  periodo "tudo" → por dia se o histórico tem até 90 dias; senão por mês, desde o primeiro cadastro
export function serieDeCadastros(datasMs, periodo, agora = Date.now()) {
  const datas = datasMs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const hoje = inicioDoDia(agora);
  let modo = "dia";
  let inicio;
  if (periodo === "30d") {
    inicio = hoje - 29 * DIA_MS;
  } else if (periodo === "12m") {
    modo = "mes";
    const d = new Date(agora);
    inicio = new Date(d.getFullYear(), d.getMonth() - 11, 1).getTime();
  } else {
    const primeiro = datas.length ? datas[0] : agora;
    if (hoje - inicioDoDia(primeiro) <= 90 * DIA_MS) {
      inicio = Math.min(inicioDoDia(primeiro), hoje - 6 * DIA_MS); // pelo menos uma semana para o gráfico ter forma
    } else {
      modo = "mes";
      const d = new Date(primeiro);
      inicio = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
  }

  const pontos = [];
  if (modo === "dia") {
    for (let t = inicio; t <= hoje; t += DIA_MS) {
      const d = new Date(t);
      pontos.push({
        fim: t + DIA_MS,
        rotulo: `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`,
        rotuloCurto: `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`
      });
    }
  } else {
    const d0 = new Date(inicio);
    const hojeD = new Date(agora);
    for (let a = d0.getFullYear(), m = d0.getMonth(); a < hojeD.getFullYear() || (a === hojeD.getFullYear() && m <= hojeD.getMonth()); m++) {
      if (m > 11) { m = 0; a++; }
      pontos.push({
        fim: new Date(a, m + 1, 1).getTime(),
        rotulo: `${MESES_CURTOS[m]}/${a}`,
        rotuloCurto: `${MESES_CURTOS[m]}/${String(a).slice(2)}`
      });
    }
  }
  let i = 0;
  return pontos.map((p) => {
    while (i < datas.length && datas[i] < p.fim) i++;
    return { rotulo: p.rotulo, rotuloCurto: p.rotuloCurto, total: i };
  });
}

function textoPessoas(n) { return `${n} ${n === 1 ? "pessoa" : "pessoas"}`; }

function svgDoGrafico(serie) {
  const L = 320, A = 150, ml = 34, mr = 10, mt = 12, mb = 24;
  const totais = serie.map((p) => p.total);
  let min = Math.min(...totais), max = Math.max(...totais);
  if (max === min) { max = min + 1; if (min > 0) min -= 1; }
  const folga = Math.max(1, Math.round((max - min) * 0.1));
  const yMin = Math.max(0, min - folga), yMax = max + folga;
  const x = (i) => ml + (serie.length === 1 ? (L - ml - mr) / 2 : (i * (L - ml - mr)) / (serie.length - 1));
  const y = (v) => mt + (1 - (v - yMin) / (yMax - yMin)) * (A - mt - mb);
  const linha = serie.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(serie.length - 1).toFixed(1)} ${A - mb} L${x(0).toFixed(1)} ${A - mb} Z`;
  const meio = serie[Math.floor((serie.length - 1) / 2)];
  const grade = [yMin, Math.round((yMin + yMax) / 2), yMax].map((v) =>
    `<line x1="${ml}" x2="${L - mr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grafico__grade"/><text x="${ml - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" class="grafico__eixo">${v}</text>`
  ).join("");
  const eixoX = serie.length > 1
    ? `<text x="${ml}" y="${A - 7}" class="grafico__eixo">${serie[0].rotuloCurto}</text>` +
      (serie.length > 4 ? `<text x="${x(Math.floor((serie.length - 1) / 2)).toFixed(1)}" y="${A - 7}" text-anchor="middle" class="grafico__eixo">${meio.rotuloCurto}</text>` : "") +
      `<text x="${L - mr}" y="${A - 7}" text-anchor="end" class="grafico__eixo">${serie[serie.length - 1].rotuloCurto}</text>`
    : `<text x="${x(0)}" y="${A - 7}" text-anchor="middle" class="grafico__eixo">${serie[0].rotuloCurto}</text>`;
  return {
    html: `<svg viewBox="0 0 ${L} ${A}" class="grafico__svg" role="img" aria-label="Pessoas cadastradas ao longo do tempo">
      ${grade}<path d="${area}" class="grafico__area"/><path d="${linha}" class="grafico__linha"/>
      <line class="grafico__guia oculto" x1="0" x2="0" y1="${mt}" y2="${A - mb}"/><circle class="grafico__ponto" r="4.5" cx="${x(serie.length - 1).toFixed(1)}" cy="${y(serie[serie.length - 1].total).toFixed(1)}"/>
      ${eixoX}</svg>`,
    x, y, L, ml, mr
  };
}

// Datas reais de cadastro: o próprio banco guarda a data de criação de cada documento; só dá para ler
// pela interface REST (o SDK do navegador não mostra). Se falhar, usa a data do último cadastro/login.
async function buscarDatasDeCadastro() {
  const { projectId, apiKey } = firebaseConfig;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/usuarios`;
  const datas = [];
  let pagina = "";
  do {
    const url = `${base}?pageSize=300&mask.fieldPaths=telefoneDigits&key=${encodeURIComponent(apiKey)}${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Firestore respondeu ${r.status}`);
    const j = await r.json();
    (j.documents || []).forEach((d) => { const ms = Date.parse(d.createTime); if (Number.isFinite(ms)) datas.push(ms); });
    pagina = j.nextPageToken || "";
  } while (pagina);
  return datas;
}

function dataAproximada(usuario) {
  const t = usuario && (usuario.criadoEm || usuario.atualizadoEm);
  if (!t) return NaN;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return Date.parse(t);
}

function iniciarGrafico() {
  const caixa = document.getElementById("graficoCadastros");
  const kpis = document.getElementById("kpisCadastros");
  const abas = document.querySelectorAll("#abasCadastros button");
  const dica = document.getElementById("dicaGrafico");
  let periodo = "30d";
  let datas = [];
  let listaAtual = [];
  let datasReais = null;      // de createTime (precisas)
  let totalBuscado = -1;
  let buscando = false;

  const dadosDeDatas = () => (datasReais && datasReais.length ? datasReais : listaAtual.map(dataAproximada).filter(Number.isFinite));

  function desenhar() {
    datas = dadosDeDatas();
    const total = listaAtual.length;
    const agora = Date.now();
    const novos = (dias) => datas.filter((d) => d >= agora - dias * DIA_MS).length;
    kpis.innerHTML = "";
    [["Total de pessoas", total], ["Últimos 7 dias", novos(7)], ["Últimos 30 dias", novos(30)]].forEach(([r, v]) => {
      const el = document.createElement("span");
      el.className = "crm-resumo__item";
      el.innerHTML = `<strong>${v}</strong> ${r.toLowerCase().startsWith("total") ? "cadastradas" : "novas — " + r.toLowerCase()}`;
      kpis.appendChild(el);
    });
    if (!total) { caixa.innerHTML = '<p class="mensagem-vazia">Ainda não há pessoas cadastradas.</p>'; dica.textContent = ""; return; }
    const serie = serieDeCadastros(datas, periodo, agora);
    const g = svgDoGrafico(serie);
    caixa.innerHTML = g.html;
    const svg = caixa.querySelector("svg");
    const guia = svg.querySelector(".grafico__guia");
    const ponto = svg.querySelector(".grafico__ponto");
    const ultimo = serie[serie.length - 1];
    dica.textContent = `${ultimo.rotulo}: ${textoPessoas(ultimo.total)} cadastradas`;
    const mostrar = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * g.L;
      let i = serie.length === 1 ? 0 : Math.round(((px - g.ml) / (g.L - g.ml - g.mr)) * (serie.length - 1));
      i = Math.max(0, Math.min(serie.length - 1, i));
      guia.classList.remove("oculto");
      guia.setAttribute("x1", g.x(i)); guia.setAttribute("x2", g.x(i));
      ponto.setAttribute("cx", g.x(i)); ponto.setAttribute("cy", g.y(serie[i].total));
      dica.textContent = `${serie[i].rotulo}: ${textoPessoas(serie[i].total)} cadastradas`;
    };
    svg.addEventListener("pointermove", mostrar);
    svg.addEventListener("pointerdown", mostrar);
    svg.addEventListener("pointerleave", () => {
      guia.classList.add("oculto");
      ponto.setAttribute("cx", g.x(serie.length - 1)); ponto.setAttribute("cy", g.y(ultimo.total));
      dica.textContent = `${ultimo.rotulo}: ${textoPessoas(ultimo.total)} cadastradas`;
    });
  }

  async function atualizarDatasReais() {
    if (buscando || totalBuscado === listaAtual.length) return;
    buscando = true;
    const alvo = listaAtual.length;
    try { datasReais = await buscarDatasDeCadastro(); totalBuscado = alvo; }
    catch (err) { console.warn("Datas de cadastro: usando a data da última atualização.", err); datasReais = null; totalBuscado = alvo; }
    buscando = false;
    desenhar();
    if (totalBuscado !== listaAtual.length) atualizarDatasReais(); // chegou gente nova enquanto buscava
  }

  abas.forEach((b) => b.addEventListener("click", () => {
    periodo = b.dataset.periodo;
    abas.forEach((o) => { o.classList.toggle("ativa", o === b); o.setAttribute("aria-pressed", String(o === b)); });
    desenhar();
  }));

  ouvirTodosUsuarios((lista) => {
    listaAtual = lista;
    desenhar();                 // na hora, com o que já se sabe
    atualizarDatasReais();      // e refina com as datas reais
  });
}

/* ---------------- Blocos das páginas do painel ---------------- */

const DESCRICOES = {
  frase: "Frases que aparecem no início do site",
  horarios: "Dias e horários da Adoração",
  intencoes: "Listas das missas e envio por e-mail",
  avisos: "Agenda da semana e comunicados",
  acompanhamento: "Agendamentos e cancelamentos",
  inscricoes: "Cursos, inscritos e avisos",
  contatos: "Pessoas cadastradas no site",
  administradores: "Contas e acessos do painel",
  configuracoes: "Páginas, logo, fundo e banners"
};

function iniciarBlocos() {
  const grade = document.getElementById("blocosInicio");
  const links = [...document.querySelectorAll("#menuLateral nav a[data-secao]")].filter((a) => a.dataset.secao !== "inicio");
  links.forEach((a) => {
    const secao = a.dataset.secao;
    const emoji = a.querySelector(".emoji")?.textContent || "";
    const titulo = [...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    const bloco = document.createElement("button");
    bloco.type = "button";
    bloco.className = "bloco-inicio";
    bloco.dataset.secao = secao;
    bloco.innerHTML = `<span class="bloco-inicio__emoji"></span><span class="bloco-inicio__titulo"></span><span class="bloco-inicio__desc"></span><span class="bloco-inicio__selo oculto"></span>`;
    bloco.querySelector(".bloco-inicio__emoji").textContent = emoji;
    bloco.querySelector(".bloco-inicio__titulo").textContent = titulo;
    bloco.querySelector(".bloco-inicio__desc").textContent = DESCRICOES[secao] || "";
    bloco.addEventListener("click", () => a.click()); // faz o mesmo que o menu: abre a página
    grade.appendChild(bloco);
    // espelha o selo de pendências do menu (ex.: Administradores aguardando aprovação)
    const selo = a.querySelector(".menu-selo");
    if (selo) {
      const meu = bloco.querySelector(".bloco-inicio__selo");
      const copiar = () => { meu.textContent = selo.textContent; meu.classList.toggle("oculto", selo.classList.contains("oculto")); };
      new MutationObserver(copiar).observe(selo, { attributes: true, childList: true, characterData: true, subtree: true });
      copiar();
    }
  });
}

export function iniciarInicioAdmin() {
  // botão fixo no canto inferior: de qualquer página volta para a Página inicial
  document.getElementById("btnVoltarInicio")?.addEventListener("click", () => {
    document.querySelector('#menuLateral nav a[data-secao="inicio"]')?.click();
  });
  iniciarBlocos();
  iniciarGrafico();
}
