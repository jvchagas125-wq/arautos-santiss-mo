import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  isoParaData, dataParaIso, formatarDataBR, formatarHora, hojeIso,
  horariosDisponiveisNoDia, horasDeMissaNoDia, gerarBlocosDeSemana,
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

// ---- Grade semanal de agendamentos (mesmo estilo da planilha exportada em Acompanhamento,
// ao vivo no site público) ----
let blocosSemana = []; // gerarBlocosDeSemana(dataInicio, dataFim): array de semanas, cada uma um array de isos
let indiceSemanaAtual = 0;
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

const modalCalendarioAgendamentos = document.getElementById("modalCalendarioAgendamentos");
const gradeSemanalAgendamentos = document.getElementById("gradeSemanalAgendamentos");
const gradeSemanalTabela = document.getElementById("gradeSemanalTabela");
const semanaTitulo = document.getElementById("semanaTitulo");
const semanaAnterior = document.getElementById("semanaAnterior");
const semanaProxima = document.getElementById("semanaProxima");
const calGrandeVazia = document.getElementById("calGrandeVazia");

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
      iniciarCalendarioAgendamentos(); // mostra a mensagem de "sem período" também no calendário
      return;
    }

    // Abre no mês de início do período, mas nunca antes do mês atual (senão a pessoa cairia
    // num mês inteiramente bloqueado por dias já passados).
    const hoje = isoParaData(hojeIso());
    const inicioPeriodo = isoParaData(diasHorarios.dataInicio);
    const mesInicial = inicioPeriodo > hoje ? inicioPeriodo : hoje;
    mesAtual = new Date(mesInicial.getFullYear(), mesInicial.getMonth(), 1);
    renderizarCalendario();
    dataInput.disabled = false;

    iniciarCalendarioAgendamentos();
  } catch (err) {
    console.error("Erro ao carregar dados de agendamento:", err);
    erroCarregarPeriodo.classList.remove("oculto");
  }
}

erroCarregarPeriodo.addEventListener("click", () => iniciar());

function dataDentroDoPeriodo(iso) {
  // hojeIso() garante que dias já passados fiquem bloqueados, mesmo estando dentro do
  // período configurado — o dia de hoje continua disponível normalmente.
  return iso >= diasHorarios.dataInicio && iso <= diasHorarios.dataFim && iso >= hojeIso();
}

/* ---------- Grade semanal de agendamentos: mesmo layout/cores da planilha (Excel) exportada
   em Acompanhamento no painel admin, só que ao vivo no site público. Uma semana por vez (setas
   pra navegar), 24 linhas (horas) x colunas (dias), célula colorida por grupo/Missa/extra/livre;
   toque numa célula com gente mostra os detalhes. No celular abre num modal (botão "Ver
   calendário de agendamentos"); no computador o CSS transforma esse mesmo modal numa segunda
   coluna sempre visível (ver style.css). ---------- */
// mapa "data iso + hora" -> array de agendamentos ativos naquele horário, recalculado UMA VEZ a
// cada atualização em vez de varrer a lista inteira de novo pra cada uma das 24x7 células.
let mapAgendamentosPorDiaHora = new Map();

function reconstruirMapaAgendamentosPorDiaHora() {
  mapAgendamentosPorDiaHora = new Map();
  todosAgendamentosAtivos.forEach((a) => {
    const chave = `${a.data}_${a.hora}`;
    if (!mapAgendamentosPorDiaHora.has(chave)) mapAgendamentosPorDiaHora.set(chave, []);
    mapAgendamentosPorDiaHora.get(chave).push(a);
  });
}

function classeCorPorHora(hora) {
  if ((hora >= 0 && hora <= 6) || (hora >= 21 && hora <= 23)) return "grade-semanal__cel--nicodemos";
  if (hora >= 7 && hora <= 11) return "grade-semanal__cel--arautos";
  return "grade-semanal__cel--madalena"; // 12h-20h
}

function iniciarCalendarioAgendamentos() {
  if (!diasHorarios || !diasHorarios.dataInicio || !diasHorarios.dataFim) {
    blocosSemana = [];
    indiceSemanaAtual = 0;
    renderizarGradeSemanal();
    return;
  }

  blocosSemana = gerarBlocosDeSemana(diasHorarios.dataInicio, diasHorarios.dataFim);
  const hoje = hojeIso();
  const idx = blocosSemana.findIndex((dias) => dias[dias.length - 1] >= hoje);
  indiceSemanaAtual = idx === -1 ? Math.max(0, blocosSemana.length - 1) : idx;

  if (pararEscutaTodosAgendamentos) pararEscutaTodosAgendamentos();
  pararEscutaTodosAgendamentos = ouvirTodosAgendamentos("agendado", (lista) => {
    todosAgendamentosAtivos = lista;
    reconstruirMapaAgendamentosPorDiaHora();
    renderizarGradeSemanal();
  });

  renderizarGradeSemanal();
}

function renderizarGradeSemanal() {
  const semPeriodo = blocosSemana.length === 0;
  calGrandeVazia.classList.toggle("oculto", !semPeriodo);
  gradeSemanalAgendamentos.classList.toggle("oculto", semPeriodo);
  if (semPeriodo) return;

  const dias = blocosSemana[indiceSemanaAtual];
  semanaTitulo.textContent = `${formatarDataBR(dias[0]).slice(0, 5)} a ${formatarDataBR(dias[dias.length - 1]).slice(0, 5)}`;

  const horasAtivasPorDia = new Map(dias.map((iso) => [iso, new Set(horariosDisponiveisNoDia(diasHorarios, iso))]));
  const horasDeMissaPorDia = new Map(dias.map((iso) => [iso, horasDeMissaNoDia(diasHorarios, iso)]));

  const thead = document.createElement("thead");
  const trCabecalho = document.createElement("tr");
  trCabecalho.appendChild(document.createElement("th"));
  dias.forEach((iso) => {
    const th = document.createElement("th");
    const nomeDia = DIAS_SEMANA_ABREV[isoParaData(iso).getDay()];
    th.innerHTML = `${nomeDia}<br>${formatarDataBR(iso).slice(0, 5)}`;
    trCabecalho.appendChild(th);
  });
  thead.appendChild(trCabecalho);

  const tbody = document.createElement("tbody");
  for (let hora = 0; hora < 24; hora++) {
    const tr = document.createElement("tr");
    const thHora = document.createElement("th");
    thHora.textContent = `${String(hora).padStart(2, "0")}h`;
    tr.appendChild(thHora);

    dias.forEach((iso) => {
      const td = document.createElement("td");
      const horasAtivas = horasAtivasPorDia.get(iso);
      const horasMissa = horasDeMissaPorDia.get(iso);
      const pessoas = mapAgendamentosPorDiaHora.get(`${iso}_${hora}`) || [];

      if (horasMissa.has(hora)) {
        td.textContent = "Missa";
        td.className = "grade-semanal__cel--missa";
      } else if (!horasAtivas.has(hora)) {
        td.className = "grade-semanal__cel--bloqueado";
      } else if (pessoas.length > 0) {
        const algumExtra = pessoas.some((p) => p.extra);
        td.textContent = pessoas.map((p) => p.nome || "—").join(" / ");
        td.className = `${algumExtra ? "grade-semanal__cel--extra" : classeCorPorHora(hora)} grade-semanal__cel--com-gente`;
        td.dataset.iso = iso;
        td.dataset.hora = String(hora);
      } else {
        td.className = "grade-semanal__cel--aberto";
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  gradeSemanalTabela.replaceChildren(thead, tbody);

  semanaAnterior.disabled = indiceSemanaAtual <= 0;
  semanaProxima.disabled = indiceSemanaAtual >= blocosSemana.length - 1;
}

semanaAnterior.addEventListener("click", () => {
  if (indiceSemanaAtual > 0) { indiceSemanaAtual--; renderizarGradeSemanal(); }
});
semanaProxima.addEventListener("click", () => {
  if (indiceSemanaAtual < blocosSemana.length - 1) { indiceSemanaAtual++; renderizarGradeSemanal(); }
});

document.getElementById("btnVerCalendarioAgendamentos").addEventListener("click", () => abrirModal(modalCalendarioAgendamentos));
document.getElementById("fecharModalCalendarioAgendamentos").addEventListener("click", () => fecharModal(modalCalendarioAgendamentos));

// monta o "cartão" de uma pessoa (só o nome — o telefone é dado sensível e fica visível
// apenas no painel administrativo, nunca no site público) — usado tanto pela grade semanal
// quanto pelo modal de detalhes de horário da grade de "Horários disponíveis" (abaixo)
function criarItemPessoaOcupado(o) {
  const item = document.createElement("div");
  item.className = "pessoa-ocupado-item";

  const info = document.createElement("div");
  const nome = document.createElement("div");
  nome.className = "pessoa-ocupado-item__nome";
  nome.textContent = o.nome || "—";
  info.appendChild(nome);

  item.appendChild(info);
  return item;
}

// um único listener "delegado" na tabela, em vez de um listener novo em cada célula a cada
// re-renderização — evita recriar dezenas de closures toda vez que alguém agenda algo
gradeSemanalTabela.addEventListener("click", (e) => {
  const td = e.target.closest("td.grade-semanal__cel--com-gente");
  if (!td) return;
  const iso = td.dataset.iso;
  const hora = Number(td.dataset.hora);
  const pessoas = mapAgendamentosPorDiaHora.get(`${iso}_${hora}`) || [];
  abrirModalDetalhesOcupado(hora, pessoas, iso);
});

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

  // navegação de mês limitada ao período configurado, e nunca para antes do mês atual
  // (dias passados já ficam bloqueados, então não faz sentido nem deixar voltar até eles)
  const hojeNav = isoParaData(hojeIso());
  const inicioPeriodoNav = isoParaData(diasHorarios.dataInicio);
  const mesInicioPeriodo = inicioPeriodoNav > hojeNav ? inicioPeriodoNav : hojeNav;
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

function abrirModalDetalhesOcupado(hora, ocupacoes, iso) {
  detalhesOcupadoHora.textContent = `${formatarDataBR(iso || dataSelecionada)} — ${textoHora(hora)}`;
  detalhesOcupadoLista.innerHTML = "";
  ocupacoes.forEach((o) => detalhesOcupadoLista.appendChild(criarItemPessoaOcupado(o)));
  abrirModal(modalDetalhesOcupado);
}

document.getElementById("fecharModalDetalhesOcupado").addEventListener("click", () => fecharModal(modalDetalhesOcupado));

btnConfirmarAgendamento.addEventListener("click", () => {
  if (!dataSelecionada || horaSelecionada === null) return;

  // a mesma pessoa não pode agendar duas vezes o mesmo dia e horário
  const jaReservouEsseHorario = horariosOcupados.some(
    (o) => o.hora === horaSelecionada && o.telefoneDigits === usuario.telefoneDigits
  );
  if (jaReservouEsseHorario) {
    mostrarToast("Você já reservou esse dia e horário.");
    return;
  }

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
    window.location.href = "meus-agendamentos";
  } catch (err) {
    console.error(err);
    fecharModal(modalConfirmacao);
    mostrarToast(
      err && err.codigo === "AGENDAMENTO_DUPLICADO"
        ? "Você já reservou esse dia e horário."
        : "Não foi possível agendar. Verifique sua conexão e tente novamente."
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar";
  }
});

iniciar();
