import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  isoParaData, dataParaIso, formatarDataBR, formatarHora, formatarDataComDiaSemana, hojeIso,
  horariosDisponiveisNoDia, MESES, DIAS_SEMANA_ABREV, comLimiteDeTempo } from "./utils.js";
import { obterConfiguracoesGerais, obterDiasHorarios, ouvirAgendamentosDaData, ouvirTodosAgendamentos, criarAgendamento } from "./dados.js";

inicializarNavegacao("agendamento");

let usuario = null;
let diasHorarios = null;
let mesAtual = null; // Date (dia 1 do mês visível)
let dataSelecionada = null; // string iso
let horaSelecionada = null; // number
let pararEscutaHorarios = null;
let horariosOcupados = []; // [{ hora, nome, telefone, telefoneDigits }]

// ---- Calendário de agendamentos (igual ao "Acompanhamento" do painel administrativo, ao vivo) ----
let mesAtualCalendario = null; // Date (dia 1 do mês visível no calendário grande)
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
const calendarioGrandeAgendamentos = document.getElementById("calendarioGrandeAgendamentos");
const calGrandeMesAno = document.getElementById("calGrandeMesAno");
const calGrandeDias = document.getElementById("calGrandeDias");
const calGrandeMesAnterior = document.getElementById("calGrandeMesAnterior");
const calGrandeMesProximo = document.getElementById("calGrandeMesProximo");
const calGrandeVazia = document.getElementById("calGrandeVazia");

const modalDiaCalendario = document.getElementById("modalDiaCalendario");
const diaCalendarioTitulo = document.getElementById("diaCalendarioTitulo");
const diaCalendarioConteudo = document.getElementById("diaCalendarioConteudo");

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

    mesAtual = new Date(isoParaData(diasHorarios.dataInicio).getFullYear(), isoParaData(diasHorarios.dataInicio).getMonth(), 1);
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
  return iso >= diasHorarios.dataInicio && iso <= diasHorarios.dataFim;
}

/* ---------- Calendário de agendamentos: igual ao "Acompanhamento" do painel administrativo,
   só que ao vivo no site público. Dias com agendamento ficam em destaque com um selo de
   quantidade; tocar num dia mostra quem reservou em cada horário. No celular abre num modal
   (botão "Ver calendário de agendamentos"); no computador o CSS transforma esse mesmo modal
   numa segunda coluna sempre visível (ver style.css). ---------- */
function agendamentosDoDiaCalendario(iso) {
  return todosAgendamentosAtivos.filter((a) => a.data === iso);
}

function iniciarCalendarioAgendamentos() {
  if (!diasHorarios || !diasHorarios.dataInicio || !diasHorarios.dataFim) {
    mesAtualCalendario = null;
    renderizarCalendarioGrande();
    return;
  }

  mesAtualCalendario = new Date(
    isoParaData(diasHorarios.dataInicio).getFullYear(),
    isoParaData(diasHorarios.dataInicio).getMonth(),
    1
  );

  if (pararEscutaTodosAgendamentos) pararEscutaTodosAgendamentos();
  pararEscutaTodosAgendamentos = ouvirTodosAgendamentos("agendado", (lista) => {
    todosAgendamentosAtivos = lista;
    renderizarCalendarioGrande();
    // se o modal de detalhes de um dia estiver aberto, atualiza a lista dele também
    if (isoDiaCalendarioAberto) abrirModalDiaCalendario(isoDiaCalendarioAberto);
  });

  renderizarCalendarioGrande();
}

function renderizarCalendarioGrande() {
  const semPeriodo = !mesAtualCalendario;
  calGrandeVazia.classList.toggle("oculto", !semPeriodo);
  calendarioGrandeAgendamentos.classList.toggle("oculto", semPeriodo);
  if (semPeriodo) return;

  const nomeMes = MESES[mesAtualCalendario.getMonth()];
  calGrandeMesAno.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mesAtualCalendario.getFullYear()}`;
  calGrandeDias.innerHTML = "";

  const primeiroDiaSemana = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth(), 1).getDay();
  const totalDias = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth() + 1, 0).getDate();

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const vazio = document.createElement("span");
    vazio.className = "calendario__vazio";
    calGrandeDias.appendChild(vazio);
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const d = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth(), dia);
    const iso = dataParaIso(d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendario__dia";
    btn.textContent = dia;

    if (dataDentroDoPeriodo(iso)) {
      btn.classList.add("disponivel");
      const qtd = agendamentosDoDiaCalendario(iso).length;
      if (qtd > 0) {
        btn.classList.add("tem-agendamentos");
        btn.title = `${qtd} ${qtd === 1 ? "agendamento" : "agendamentos"} — toque para ver detalhes`;
        const badge = document.createElement("span");
        badge.className = "calendario__dia-badge";
        badge.textContent = String(qtd);
        btn.appendChild(badge);
        btn.addEventListener("click", () => abrirModalDiaCalendario(iso));
      }
    }
    calGrandeDias.appendChild(btn);
  }

  const mesInicioPeriodo = isoParaData(diasHorarios.dataInicio);
  const mesFimPeriodo = isoParaData(diasHorarios.dataFim);
  const anteriorHabilitado = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth(), 0) >=
    new Date(mesInicioPeriodo.getFullYear(), mesInicioPeriodo.getMonth(), 1);
  const proximoHabilitado = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth() + 1, 1) <=
    new Date(mesFimPeriodo.getFullYear(), mesFimPeriodo.getMonth(), 1);
  calGrandeMesAnterior.disabled = !anteriorHabilitado;
  calGrandeMesProximo.disabled = !proximoHabilitado;
}

calGrandeMesAnterior.addEventListener("click", () => {
  mesAtualCalendario = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth() - 1, 1);
  renderizarCalendarioGrande();
});
calGrandeMesProximo.addEventListener("click", () => {
  mesAtualCalendario = new Date(mesAtualCalendario.getFullYear(), mesAtualCalendario.getMonth() + 1, 1);
  renderizarCalendarioGrande();
});
document.getElementById("btnVerCalendarioAgendamentos").addEventListener("click", () => abrirModal(modalCalendarioAgendamentos));
document.getElementById("fecharModalCalendarioAgendamentos").addEventListener("click", () => fecharModal(modalCalendarioAgendamentos));

/* ---- modal de detalhes do dia (quem reservou em cada horário) ---- */
let isoDiaCalendarioAberto = null;

// monta o "cartão" de uma pessoa (nome e telefone, sem o botão de WhatsApp — não faz sentido
// deixar isso público pra qualquer visitante chamar quem agendou) — usado tanto aqui quanto no
// modal de detalhes de horário da grade de "Horários disponíveis" (abrirModalDetalhesOcupado)
function criarItemPessoaOcupado(o) {
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

  item.appendChild(info);
  return item;
}

function abrirModalDiaCalendario(iso) {
  isoDiaCalendarioAberto = iso;
  const doDia = agendamentosDoDiaCalendario(iso).sort((a, b) => a.hora - b.hora);
  diaCalendarioTitulo.textContent = formatarDataComDiaSemana(iso);
  diaCalendarioConteudo.innerHTML = "";

  const porHora = new Map();
  doDia.forEach((a) => {
    if (!porHora.has(a.hora)) porHora.set(a.hora, []);
    porHora.get(a.hora).push(a);
  });

  // mostra todos os horários ativos do dia (não só os que já têm gente agendada)
  const horasDoDia = horariosDisponiveisNoDia(diasHorarios, iso);

  horasDoDia.forEach((hora) => {
    const pessoas = porHora.get(hora) || [];

    const grupo = document.createElement("div");
    grupo.className = "grupo-horario-dia";

    const titulo = document.createElement("div");
    titulo.className = "grupo-horario-dia__titulo";
    titulo.innerHTML = `${formatarHora(hora)} ${pessoas.length ? `<span class="contagem-contatos">${pessoas.length}</span>` : ""}`;
    grupo.appendChild(titulo);

    if (pessoas.length === 0) {
      const aviso = document.createElement("p");
      aviso.className = "horario-vazio-msg";
      aviso.textContent = "Horário livre — ninguém agendado.";
      grupo.appendChild(aviso);
    } else {
      const listaEl = document.createElement("div");
      listaEl.className = "lista-pessoas-ocupado";
      pessoas.forEach((a) => listaEl.appendChild(criarItemPessoaOcupado(a)));
      grupo.appendChild(listaEl);
    }

    diaCalendarioConteudo.appendChild(grupo);
  });

  abrirModal(modalDiaCalendario);
}

document.getElementById("fecharModalDiaCalendario").addEventListener("click", () => {
  fecharModal(modalDiaCalendario);
  isoDiaCalendarioAberto = null;
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
    window.location.href = "meus-agendamentos.html";
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
