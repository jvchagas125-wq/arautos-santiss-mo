import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  isoParaData, dataParaIso, formatarDataBR, formatarHora, hojeIso, horariosDisponiveisNoDia,
  horasDeMissaNoDia, gerarBlocosDeSemana, DIAS_SEMANA_COMPLETO,
  MESES, DIAS_SEMANA_ABREV, comLimiteDeTempo } from "./utils.js";
import { obterConfiguracoesGerais, obterDiasHorarios, ouvirAgendamentosDaData, ouvirTodosAgendamentos, criarAgendamento } from "./dados.js";

inicializarNavegacao("agendamento");

let usuario = null;
let diasHorarios = null;
let mesAtual = null; // Date (dia 1 do mês visível)
let dataSelecionada = null; // string iso
let horaSelecionada = null; // number
let pararEscutaHorarios = null;
let horariosOcupados = []; // [{ hora, nome, telefone, telefoneDigits }]

// ---- Tabela de agendamentos (a "planilha" da coordenação, ao vivo) ----
let blocosDeSemana = []; // [[iso, iso, ...], ...] — um array de dias por semana
let indiceSemanaTabela = 0;
let todosAgendamentosAtivos = []; // todo mundo com status "agendado", de todas as datas
let pararEscutaTodosAgendamentos = null;

const dataInput = document.getElementById("dataInput");
const calendario = document.getElementById("calendario");
const calendarioDias = document.getElementById("calendarioDias");
const mesAnoEl = document.getElementById("mesAno");
const btnMesAnterior = document.getElementById("mesAnterior");
const btnMesProximo = document.getElementById("mesProximo");
const painelHorarios = document.getElementById("painelHorarios");
const gradeHorarios = document.getElementById("gradeHorarios");
const semHorarios = document.getElementById("semHorarios");
const btnConfirmarAgendamento = document.getElementById("btnConfirmarAgendamento");
const avisoSemPeriodo = document.getElementById("avisoSemPeriodo");
const erroCarregarPeriodo = document.getElementById("erroCarregarPeriodo");
const modalConfirmacao = document.getElementById("modalConfirmacao");

const modalTabelaAgendamentos = document.getElementById("modalTabelaAgendamentos");
const tabelaAgendamentosPeriodo = document.getElementById("tabelaAgendamentosPeriodo");
const tabelaAgendamentosGrade = document.getElementById("tabelaAgendamentosGrade");
const tabelaAgendamentosLegenda = document.getElementById("tabelaAgendamentosLegenda");
const tabelaAgendamentosVazia = document.getElementById("tabelaAgendamentosVazia");
const tabelaAgendamentosScroll = document.querySelector(".tabela-agendamentos__scroll");
const btnSemanaAnteriorTabela = document.getElementById("semanaAnteriorTabela");
const btnSemanaProximaTabela = document.getElementById("semanaProximaTabela");

// O campo de data começa desabilitado (veja o atributo "disabled" no HTML) — só é liberado
// quando os dados realmente terminam de carregar. Isso evita o bug de, no celular, tocar no
// campo rápido demais (antes da configuração chegar) e ver o calendário abrir vazio, sem os
// dias nem o mês/ano preenchidos.
async function iniciar() {
  avisoSemPeriodo.classList.add("oculto");
  erroCarregarPeriodo.classList.add("oculto");
  dataInput.disabled = true;

  if (pararEscutaTodosAgendamentos) { pararEscutaTodosAgendamentos(); pararEscutaTodosAgendamentos = null; }

  try {
    usuario = await exigirCadastro();

    const config = await comLimiteDeTempo(obterConfiguracoesGerais());
    aplicarLogo(config.logoUrl);
    aplicarFundo(config.fundoUrl);

    diasHorarios = await comLimiteDeTempo(obterDiasHorarios());

    if (!diasHorarios.dataInicio || !diasHorarios.dataFim) {
      avisoSemPeriodo.classList.remove("oculto");
      iniciarTabelaAgendamentos(); // mostra a mensagem de "sem período" também na tabela
      return;
    }

    mesAtual = new Date(isoParaData(diasHorarios.dataInicio).getFullYear(), isoParaData(diasHorarios.dataInicio).getMonth(), 1);
    renderizarCalendario();
    dataInput.disabled = false;

    iniciarTabelaAgendamentos();
  } catch (err) {
    console.error("Erro ao carregar dados de agendamento:", err);
    erroCarregarPeriodo.classList.remove("oculto");
  }
}

erroCarregarPeriodo.addEventListener("click", () => iniciar());

function dataDentroDoPeriodo(iso) {
  return iso >= diasHorarios.dataInicio && iso <= diasHorarios.dataFim;
}

/* ---------- Tabela de agendamentos: mesma grade "estilo planilha" que o padre exporta em
   Excel no painel admin (mesmos grupos/cores por faixa de horário), só que ao vivo no site
   público. No celular abre num modal (botão "Ver tabela de agendamento"); no computador o
   CSS transforma esse mesmo modal numa segunda coluna sempre visível (ver style.css). ---------- */
function grupoPorHora(hora) {
  if ((hora >= 0 && hora <= 6) || (hora >= 21 && hora <= 23)) return "nicodemos";
  if (hora >= 7 && hora <= 11) return "arautos";
  return "madalena"; // 12h-20h
}

function iniciarTabelaAgendamentos() {
  if (!diasHorarios || !diasHorarios.dataInicio || !diasHorarios.dataFim) {
    blocosDeSemana = [];
    renderizarTabelaAgendamentos();
    return;
  }

  blocosDeSemana = gerarBlocosDeSemana(diasHorarios.dataInicio, diasHorarios.dataFim);

  // abre já na semana que contém hoje (ou a mais próxima, se hoje estiver fora do período)
  const hoje = hojeIso();
  let indiceInicial = blocosDeSemana.findIndex((dias) => hoje >= dias[0] && hoje <= dias[dias.length - 1]);
  if (indiceInicial === -1) indiceInicial = hoje < diasHorarios.dataInicio ? 0 : blocosDeSemana.length - 1;
  indiceSemanaTabela = Math.max(0, indiceInicial);

  if (pararEscutaTodosAgendamentos) pararEscutaTodosAgendamentos();
  pararEscutaTodosAgendamentos = ouvirTodosAgendamentos("agendado", (lista) => {
    todosAgendamentosAtivos = lista;
    renderizarTabelaAgendamentos();
  });

  renderizarTabelaAgendamentos();
}

function renderizarTabelaAgendamentos() {
  const semPeriodo = blocosDeSemana.length === 0;
  tabelaAgendamentosVazia.classList.toggle("oculto", !semPeriodo);
  tabelaAgendamentosScroll.classList.toggle("oculto", semPeriodo);
  tabelaAgendamentosLegenda.classList.toggle("oculto", semPeriodo);
  btnSemanaAnteriorTabela.disabled = semPeriodo || indiceSemanaTabela <= 0;
  btnSemanaProximaTabela.disabled = semPeriodo || indiceSemanaTabela >= blocosDeSemana.length - 1;

  if (semPeriodo) {
    tabelaAgendamentosPeriodo.textContent = "—";
    tabelaAgendamentosGrade.innerHTML = "";
    return;
  }

  const dias = blocosDeSemana[indiceSemanaTabela];
  tabelaAgendamentosPeriodo.textContent =
    `Semana ${indiceSemanaTabela + 1} de ${blocosDeSemana.length} — ${formatarDataBR(dias[0])} a ${formatarDataBR(dias[dias.length - 1])}`;

  // agrupa os agendamentos ativos por "data_hora" pra consulta rápida célula a célula
  const porDataHora = new Map();
  todosAgendamentosAtivos.forEach((a) => {
    const chave = `${a.data}_${a.hora}`;
    if (!porDataHora.has(chave)) porDataHora.set(chave, []);
    porDataHora.get(chave).push(a);
  });

  let html = "<thead><tr><th></th>";
  dias.forEach((iso) => {
    const nomeDia = DIAS_SEMANA_COMPLETO[isoParaData(iso).getDay()].toLowerCase();
    html += `<th>${nomeDia}<br>${formatarDataBR(iso).slice(0, 5)}</th>`;
  });
  html += "</tr></thead><tbody>";

  const horasAtivasPorDia = new Map(dias.map((iso) => [iso, new Set(horariosDisponiveisNoDia(diasHorarios, iso))]));
  const horasDeMissaPorDia = new Map(dias.map((iso) => [iso, horasDeMissaNoDia(diasHorarios, iso)]));

  for (let hora = 0; hora < 24; hora++) {
    html += `<tr><td class="tabela-agendamentos__hora">${String(hora).padStart(2, "0")}h</td>`;
    dias.forEach((iso) => {
      const horasAtivas = horasAtivasPorDia.get(iso);
      const horasMissa = horasDeMissaPorDia.get(iso);
      const pessoas = porDataHora.get(`${iso}_${hora}`) || [];

      if (horasMissa.has(hora)) {
        html += `<td class="status-missa">Missa</td>`;
      } else if (!horasAtivas.has(hora)) {
        html += `<td class="status-bloqueado"></td>`;
      } else if (pessoas.length > 0) {
        const algumExtra = pessoas.some((p) => p.extra);
        const classe = algumExtra ? "status-extra" : `grupo-${grupoPorHora(hora)}`;
        const nomes = pessoas.map((p) => (p.nome || "—").split(" ")[0]).join(" / ");
        html += `<td class="${classe}" title="${pessoas.map((p) => p.nome || "—").join(", ").replace(/"/g, "&quot;")}">${nomes}</td>`;
      } else {
        html += `<td class="status-aberto"></td>`;
      }
    });
    html += "</tr>";
  }
  html += "</tbody>";
  tabelaAgendamentosGrade.innerHTML = html;

  tabelaAgendamentosLegenda.innerHTML = `
    <span><i style="background:#c6e0b4"></i> Arautos (07h–11h)</span>
    <span><i style="background:#bdd7ee"></i> São Nicodemos (00h–06h e 21h–23h)</span>
    <span><i style="background:#f4d9a0"></i> Santa Maria Madalena (12h–20h)</span>
    <span><i style="background:#cbb6e8"></i> Extra</span>
    <span><i style="background:#ffd700"></i> Missa</span>
    <span><i style="background:#e06666"></i> Horário em aberto</span>
    <span><i style="background:#1a1a1a"></i> Fora do período</span>
  `;
}

btnSemanaAnteriorTabela.addEventListener("click", () => {
  if (indiceSemanaTabela > 0) { indiceSemanaTabela--; renderizarTabelaAgendamentos(); }
});
btnSemanaProximaTabela.addEventListener("click", () => {
  if (indiceSemanaTabela < blocosDeSemana.length - 1) { indiceSemanaTabela++; renderizarTabelaAgendamentos(); }
});
document.getElementById("btnVerTabelaAgendamentos").addEventListener("click", () => abrirModal(modalTabelaAgendamentos));
document.getElementById("fecharModalTabelaAgendamentos").addEventListener("click", () => fecharModal(modalTabelaAgendamentos));

function renderizarCalendario() {
  const nomeMes = MESES[mesAtual.getMonth()];
  mesAnoEl.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mesAtual.getFullYear()}`;
  calendarioDias.innerHTML = "";

  const primeiroDiaSemana = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).getDay();
  const totalDias = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate();

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const vazio = document.createElement("span");
    vazio.className = "calendario__vazio";
    calendarioDias.appendChild(vazio);
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const dataAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), dia);
    const iso = dataParaIso(dataAtual);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendario__dia";
    btn.textContent = dia;

    if (dataDentroDoPeriodo(iso)) {
      btn.classList.add("disponivel");
      if (iso === dataSelecionada) btn.classList.add("selecionado");
      btn.addEventListener("click", () => selecionarData(iso));
    }
    calendarioDias.appendChild(btn);
  }

  // navegação de mês limitada ao período configurado
  const mesInicioPeriodo = isoParaData(diasHorarios.dataInicio);
  const mesFimPeriodo = isoParaData(diasHorarios.dataFim);
  const anteriorHabilitado = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 0) >=
    new Date(mesInicioPeriodo.getFullYear(), mesInicioPeriodo.getMonth(), 1);
  const proximoHabilitado = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1) <=
    new Date(mesFimPeriodo.getFullYear(), mesFimPeriodo.getMonth(), 1);
  btnMesAnterior.disabled = !anteriorHabilitado;
  btnMesProximo.disabled = !proximoHabilitado;
}

btnMesAnterior.addEventListener("click", () => {
  mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1);
  renderizarCalendario();
});
btnMesProximo.addEventListener("click", () => {
  mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1);
  renderizarCalendario();
});

dataInput.addEventListener("click", () => {
  if (dataInput.disabled) return;
  calendario.classList.toggle("aberto");
});
document.addEventListener("click", (e) => {
  if (!calendario.contains(e.target) && e.target !== dataInput) {
    calendario.classList.remove("aberto");
  }
});

function selecionarData(iso) {
  dataSelecionada = iso;
  horaSelecionada = null;
  btnConfirmarAgendamento.disabled = true;
  dataInput.value = formatarDataBR(iso);
  calendario.classList.remove("aberto");
  renderizarCalendario();

  painelHorarios.style.display = "";
  gradeHorarios.innerHTML = '<div class="spinner"></div>';
  semHorarios.classList.add("oculto");

  if (pararEscutaHorarios) pararEscutaHorarios();
  pararEscutaHorarios = ouvirAgendamentosDaData(iso, (ocupados) => {
    horariosOcupados = ocupados;
    renderizarHorarios();
  });
}

function textoHora(hora) {
  return `${String(hora).padStart(2,"0")}:00 - ${String((hora+1)%24).padStart(2,"0")}:00`;
}

function textoReservado(qtd) {
  return qtd === 1 ? "1 agendou · Ver detalhes" : `${qtd} agendaram · Ver detalhes`;
}

function renderizarHorarios() {
  const horariosAtivos = horariosDisponiveisNoDia(diasHorarios, dataSelecionada);
  gradeHorarios.innerHTML = "";

  if (horariosAtivos.length === 0) {
    semHorarios.classList.remove("oculto");
    return;
  }
  semHorarios.classList.add("oculto");

  horariosAtivos.forEach((hora) => {
    // pode haver mais de uma pessoa agendada para o mesmo dia e horário
    const ocupacoes = horariosOcupados.filter((o) => o.hora === hora);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "horario-btn";
    if (hora === horaSelecionada) btn.classList.add("selecionado");

    if (ocupacoes.length > 0) {
      btn.classList.add("ocupado");
      btn.innerHTML = `
        <span class="horario-btn__hora">${textoHora(hora)}</span>
        <span class="horario-btn__reservado">${textoReservado(ocupacoes.length)}</span>
      `;
      btn.querySelector(".horario-btn__reservado").addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalDetalhesOcupado(hora, ocupacoes);
      });
    } else {
      btn.textContent = textoHora(hora);
    }

    // o horário continua disponível para novos agendamentos, mesmo já tendo gente inscrita nele
    btn.addEventListener("click", () => {
      horaSelecionada = hora;
      btnConfirmarAgendamento.disabled = false;
      document.querySelectorAll(".horario-btn").forEach((b) => b.classList.remove("selecionado"));
      btn.classList.add("selecionado");
    });

    gradeHorarios.appendChild(btn);
  });
}

const modalDetalhesOcupado = document.getElementById("modalDetalhesOcupado");
const detalhesOcupadoHora = document.getElementById("detalhesOcupadoHora");
const detalhesOcupadoLista = document.getElementById("detalhesOcupadoLista");

function abrirModalDetalhesOcupado(hora, ocupacoes) {
  detalhesOcupadoHora.textContent = `${formatarDataBR(dataSelecionada)} — ${textoHora(hora)}`;
  detalhesOcupadoLista.innerHTML = "";

  ocupacoes.forEach((o) => {
    const item = document.createElement("div");
    item.className = "pessoa-ocupado-item";

    const info = document.createElement("div");
    const nome = document.createElement("div");
    nome.className = "pessoa-ocupado-item__nome";
    nome.textContent = o.nome || "—";
    const tel = document.createElement("div");
    tel.className = "pessoa-ocupado-item__tel";
    tel.textContent = o.telefone || "—";
    info.appendChild(nome);
    info.appendChild(tel);

    const link = document.createElement("a");
    link.className = "link-whatsapp";
    link.href = `https://wa.me/55${o.telefoneDigits || ""}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Chamar no WhatsApp";
    link.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 10.5c.3 2.4 2.1 4.2 4.5 4.5"/></svg>`;

    item.appendChild(info);
    item.appendChild(link);
    detalhesOcupadoLista.appendChild(item);
  });

  abrirModal(modalDetalhesOcupado);
}

document.getElementById("fecharModalDetalhesOcupado").addEventListener("click", () => fecharModal(modalDetalhesOcupado));

btnConfirmarAgendamento.addEventListener("click", () => {
  if (!dataSelecionada || horaSelecionada === null) return;
  document.getElementById("modalData").textContent = formatarDataBR(dataSelecionada);
  document.getElementById("modalHora").textContent = formatarHora(horaSelecionada);
  abrirModal(modalConfirmacao);
});

document.getElementById("btnCancelarModal").addEventListener("click", () => fecharModal(modalConfirmacao));

document.getElementById("btnConfirmarModal").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Agendando...";
  try {
    await criarAgendamento({
      nome: usuario.nome,
      telefoneDigits: usuario.telefoneDigits,
      telefone: usuario.telefone,
      data: dataSelecionada,
      hora: horaSelecionada
    });
    window.location.href = "meus-agendamentos.html";
  } catch (err) {
    console.error(err);
    fecharModal(modalConfirmacao);
    mostrarToast("Não foi possível agendar. Verifique sua conexão e tente novamente.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar";
  }
});

iniciar();
