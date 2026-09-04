import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  isoParaData, dataParaIso, formatarDataBR, formatarHora, hojeIso, MESES, DIAS_SEMANA_ABREV } from "./utils.js";
import { obterConfiguracoesGerais, obterDiasHorarios, ouvirAgendamentosDaData, criarAgendamento } from "./dados.js";

inicializarNavegacao("agendamento");

let usuario = null;
let diasHorarios = null;
let mesAtual = null; // Date (dia 1 do mês visível)
let dataSelecionada = null; // string iso
let horaSelecionada = null; // number
let pararEscutaHorarios = null;
let horariosOcupados = []; // [{ hora, nome, telefone, telefoneDigits }]

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
const modalConfirmacao = document.getElementById("modalConfirmacao");

async function iniciar() {
  usuario = await exigirCadastro();

  const config = await obterConfiguracoesGerais();
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);

  diasHorarios = await obterDiasHorarios();

  if (!diasHorarios.dataInicio || !diasHorarios.dataFim) {
    avisoSemPeriodo.classList.remove("oculto");
    dataInput.disabled = true;
    return;
  }

  mesAtual = new Date(isoParaData(diasHorarios.dataInicio).getFullYear(), isoParaData(diasHorarios.dataInicio).getMonth(), 1);
  renderizarCalendario();
}

function dataDentroDoPeriodo(iso) {
  return iso >= diasHorarios.dataInicio && iso <= diasHorarios.dataFim;
}

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
  const horariosAtivos = [...(diasHorarios.horariosAtivos || [])].sort((a, b) => a - b);
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
