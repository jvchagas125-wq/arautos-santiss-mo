// Painel admin › Dias e Horários › "Agendar Adoração para outras pessoas".
// Calendário com os dias da adoração -> janela com os horários do dia (mostrando quem já agendou) ->
// janela pedindo o nome da pessoa. O agendamento aparece no site público em "Acompanhamento".
import { abrirModal, fecharModal, mostrarToast, MESES, dataParaIso, isoParaData, hojeIso,
  formatarDataComDiaSemana, formatarHora, horariosDisponiveisNoDia, capitalizarNome } from "./utils.js";
import { ouvirAgendamentosAtivosNoPeriodo, criarAgendamentoParaOutraPessoa } from "./dados.js";

const textoHora = (hora) => `${String(hora).padStart(2, "0")}:00 - ${String((hora + 1) % 24).padStart(2, "0")}:00`;

export function criarAgendarParaOutros() {
  const cabecalho = document.getElementById("cabecalhoAgendarOutros");
  const calendarioEl = document.getElementById("calendarioAgendarOutros");
  const avisoSemPeriodo = document.getElementById("avisoAgendarSemPeriodo");
  const modalHorarios = document.getElementById("modalAgendarHorarios");
  const gradeHorarios = document.getElementById("agendarGradeHorarios");
  const semHorarios = document.getElementById("agendarSemHorarios");
  const modalNome = document.getElementById("modalAgendarNome");
  const formNome = document.getElementById("formAgendarNome");
  const campoNome = document.getElementById("agendarNomeCampo");
  const btnConfirmarNome = document.getElementById("btnConfirmarAgendarNome");
  if (!cabecalho || !calendarioEl) return { definirPeriodo() {} };

  let periodo = null; // doc configuracoes/diasHorarios completo (dataInicio, dataFim, horariosAtivos, alteracoes...)
  let agendamentos = []; // ativos, de hoje até o fim do período
  let pararEscuta = null;
  let faixaEscutada = "";
  let aberto = false; // o cartão já foi aberto alguma vez (só então lemos os agendamentos)
  let mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let primeiraVez = true;
  let diaAtual = null; // iso do dia cujos horários estão na janela
  let horaAtual = null;

  const temPeriodo = () => !!(periodo && periodo.dataInicio && periodo.dataFim);
  // mesmas regras do site público: dentro do período, não passado e não marcado como "sem adoração"
  const diaDoPeriodo = (iso) => temPeriodo()
    && periodo.alteracoes?.[iso]?.fechado !== true
    && iso >= periodo.dataInicio && iso <= periodo.dataFim && iso >= hojeIso()
    && horariosDisponiveisNoDia(periodo, iso).length > 0;
  const doDia = (iso) => agendamentos.filter((a) => a.data === iso);

  function garantirEscuta() {
    if (!aberto || !temPeriodo()) return;
    const inicio = periodo.dataInicio > hojeIso() ? periodo.dataInicio : hojeIso();
    const faixa = `${inicio}_${periodo.dataFim}`;
    if (faixa === faixaEscutada) return;
    if (pararEscuta) pararEscuta();
    faixaEscutada = faixa;
    if (inicio > periodo.dataFim) { agendamentos = []; renderizar(); return; }
    pararEscuta = ouvirAgendamentosAtivosNoPeriodo(inicio, periodo.dataFim, (lista) => {
      agendamentos = lista;
      renderizar();
    });
  }

  function renderizarCalendario() {
    const elMesAno = calendarioEl.querySelector("[data-mes-ano]");
    const elDias = calendarioEl.querySelector("[data-dias]");
    const nomeMes = MESES[mes.getMonth()];
    elMesAno.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mes.getFullYear()}`;
    const primeiroMes = (() => {
      const base = temPeriodo() && periodo.dataInicio > hojeIso() ? isoParaData(periodo.dataInicio) : new Date();
      return new Date(base.getFullYear(), base.getMonth(), 1);
    })();
    const ultimoMes = temPeriodo()
      ? new Date(isoParaData(periodo.dataFim).getFullYear(), isoParaData(periodo.dataFim).getMonth(), 1)
      : primeiroMes;
    calendarioEl.querySelector("[data-nav-anterior]").disabled = mes <= primeiroMes;
    calendarioEl.querySelector("[data-nav-proximo]").disabled = mes >= ultimoMes;

    elDias.innerHTML = "";
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1).getDay();
    const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    for (let i = 0; i < primeiro; i++) {
      const vazio = document.createElement("span");
      vazio.className = "calendario__vazio";
      elDias.appendChild(vazio);
    }
    for (let dia = 1; dia <= total; dia++) {
      const iso = dataParaIso(new Date(mes.getFullYear(), mes.getMonth(), dia));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendario__dia";
      btn.textContent = dia;
      if (diaDoPeriodo(iso)) {
        btn.classList.add("disponivel");
        const qtd = doDia(iso).length;
        if (qtd > 0) {
          btn.classList.add("tem-agendamentos");
          btn.title = `${qtd} ${qtd === 1 ? "agendamento" : "agendamentos"} neste dia`;
          const selo = document.createElement("span");
          selo.className = "calendario__dia-badge";
          selo.textContent = qtd;
          btn.appendChild(selo);
        }
        btn.addEventListener("click", () => abrirHorarios(iso));
      }
      elDias.appendChild(btn);
    }
  }

  function renderizarHorarios() {
    if (!diaAtual) return;
    document.getElementById("agendarHorariosData").textContent = formatarDataComDiaSemana(diaAtual);
    const horas = temPeriodo() ? horariosDisponiveisNoDia(periodo, diaAtual) : [];
    gradeHorarios.innerHTML = "";
    semHorarios.classList.toggle("oculto", horas.length > 0);
    const naHora = new Map();
    doDia(diaAtual).forEach((a) => {
      if (!naHora.has(a.hora)) naHora.set(a.hora, []);
      naHora.get(a.hora).push(a);
    });
    horas.forEach((hora) => {
      const pessoas = naHora.get(hora) || [];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "horario-btn";
      btn.dataset.hora = String(hora);
      const rotulo = document.createElement("span");
      rotulo.className = "horario-btn__hora";
      rotulo.textContent = textoHora(hora);
      btn.appendChild(rotulo);
      if (pessoas.length > 0) {
        btn.classList.add("ocupado");
        const quem = document.createElement("span");
        quem.className = "horario-btn__reservado horario-btn__reservado--nomes";
        quem.textContent = `Já agendado: ${pessoas.map((p) => p.nome || "—").join(" · ")}`;
        btn.appendChild(quem);
      }
      btn.addEventListener("click", () => abrirNome(hora));
      gradeHorarios.appendChild(btn);
    });
  }

  function renderizar() {
    avisoSemPeriodo.classList.toggle("oculto", temPeriodo());
    calendarioEl.classList.toggle("oculto", !temPeriodo());
    renderizarCalendario();
    if (modalHorarios.classList.contains("aberto")) renderizarHorarios();
  }

  function abrirHorarios(iso) {
    diaAtual = iso;
    renderizarHorarios();
    abrirModal(modalHorarios);
  }
  function fecharHorarios() { fecharModal(modalHorarios); diaAtual = null; }

  function abrirNome(hora) {
    horaAtual = hora;
    document.getElementById("agendarNomeResumo").textContent = `${formatarDataComDiaSemana(diaAtual)} · ${formatarHora(hora)}`;
    campoNome.value = "";
    abrirModal(modalNome);
    setTimeout(() => campoNome.focus(), 80);
  }
  function fecharNome() { fecharModal(modalNome); horaAtual = null; }

  document.getElementById("fecharModalAgendarHorarios").addEventListener("click", fecharHorarios);
  document.getElementById("fecharModalAgendarNome").addEventListener("click", fecharNome);
  document.getElementById("btnCancelarAgendarNome").addEventListener("click", fecharNome);

  formNome.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!diaAtual || horaAtual === null) return;
    const digitado = campoNome.value.replace(/\s+/g, " ").trim();
    if (digitado.length < 2 || !/\p{L}/u.test(digitado)) { mostrarToast("Digite o nome da pessoa."); campoNome.focus(); return; }
    const nome = capitalizarNome(digitado);
    btnConfirmarNome.disabled = true;
    btnConfirmarNome.textContent = "Agendando...";
    try {
      await criarAgendamentoParaOutraPessoa({ nome, data: diaAtual, hora: horaAtual });
      fecharNome();
      mostrarToast(`Agendado: ${nome}.`);
    } catch (err) {
      if (err && err.codigo === "AGENDAMENTO_DUPLICADO") {
        mostrarToast("Essa pessoa já está agendada neste dia e horário.");
      } else {
        console.error(err);
        mostrarToast("Não foi possível agendar. Verifique a conexão e tente novamente.");
      }
    } finally {
      btnConfirmarNome.disabled = false;
      btnConfirmarNome.textContent = "Agendar";
    }
  });

  calendarioEl.querySelector("[data-nav-anterior]").addEventListener("click", () => {
    mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
    renderizarCalendario();
  });
  calendarioEl.querySelector("[data-nav-proximo]").addEventListener("click", () => {
    mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
    renderizarCalendario();
  });

  // os agendamentos só são lidos do banco quando o cartão é aberto pela primeira vez (economiza leituras)
  cabecalho.addEventListener("click", () => {
    if (aberto) return;
    aberto = true;
    garantirEscuta();
  });
  cabecalho.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !aberto) { aberto = true; garantirEscuta(); }
  });

  return {
    // chamado a cada atualização de "Dias e horários" (o painel já escuta esse documento)
    definirPeriodo(dh) {
      periodo = dh || null;
      if (primeiraVez && temPeriodo()) {
        primeiraVez = false;
        const base = periodo.dataInicio > hojeIso() ? isoParaData(periodo.dataInicio) : new Date();
        mes = new Date(base.getFullYear(), base.getMonth(), 1);
      }
      garantirEscuta();
      renderizar();
    }
  };
}
