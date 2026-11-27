// Painel admin › Dias e Horários › "Agendar Adoração para outras pessoas".
// Calendário com os dias da adoração -> janela com os horários do dia (mostrando quem já agendou) ->
// janela pedindo o nome da pessoa. O agendamento aparece no site público em "Acompanhamento".
import { abrirModal, fecharModal, mostrarToast, MESES, dataParaIso, isoParaData, hojeIso,
  formatarDataComDiaSemana, formatarHora, horariosDoDiaComMissa, horasDeMissaNoDia, capitalizarNome } from "./utils.js";
import { ouvirAgendamentosAtivosNoPeriodo, criarAgendamentoParaOutraPessoa, salvarMissasAdoracao } from "./dados.js";

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
  const caixaNome = document.getElementById("agendarNomeCaixa");
  const checkMissa = document.getElementById("agendarMissaCheck");
  const tituloNome = document.getElementById("tituloAgendarNome");
  const modalDesmarcar = document.getElementById("modalDesmarcarMissa");
  const btnConfirmarDesmarcar = document.getElementById("btnConfirmarDesmarcarMissa");
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
    && horariosDoDiaComMissa(periodo, iso).length > 0;
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
    const horas = temPeriodo() ? horariosDoDiaComMissa(periodo, diaAtual) : [];
    const missas = temPeriodo() ? horasDeMissaNoDia(periodo, diaAtual) : new Set();
    gradeHorarios.innerHTML = "";
    semHorarios.classList.toggle("oculto", horas.length > 0);
    const naHora = new Map();
    doDia(diaAtual).forEach((a) => {
      if (!naHora.has(a.hora)) naHora.set(a.hora, []);
      naHora.get(a.hora).push(a);
    });
    horas.forEach((hora) => {
      const pessoas = naHora.get(hora) || [];
      if (missas.has(hora)) {
        // horário marcado como Santa Missa: amarelo; tocar abre a janela para remover a marcação
        const m = document.createElement("button");
        m.type = "button";
        m.className = "horario-btn horario-btn--missa";
        m.dataset.hora = String(hora);
        m.innerHTML = `<span class="horario-btn__hora">${textoHora(hora)}</span><span class="horario-btn__reservado horario-btn__missa-rotulo">Santa Missa · toque para remover</span>`;
        m.addEventListener("click", () => abrirDesmarcar(hora));
        gradeHorarios.appendChild(m);
        return;
      }
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
    checkMissa.checked = false;
    aplicarModoMissa();
    abrirModal(modalNome);
    setTimeout(() => campoNome.focus(), 80);
  }
  function fecharNome() { fecharModal(modalNome); horaAtual = null; }

  // com "Santa Missa" marcada, a janela não pede nome: só marca o horário
  function aplicarModoMissa() {
    const missa = checkMissa.checked;
    caixaNome.classList.toggle("oculto", missa);
    campoNome.required = !missa;
    tituloNome.textContent = missa ? "Santa Missa neste horário" : "Nome da pessoa";
    btnConfirmarNome.textContent = missa ? "Marcar Santa Missa" : "Agendar";
    if (!missa) setTimeout(() => campoNome.focus(), 0);
  }
  checkMissa.addEventListener("change", aplicarModoMissa);

  // mapa atual { iso: [horas] } do banco, para somar/tirar um horário e salvar o conjunto
  const missasAtuais = () => {
    const copia = {};
    Object.entries((periodo && periodo.missas) || {}).forEach(([iso, horas]) => { if (Array.isArray(horas)) copia[iso] = [...horas]; });
    return copia;
  };

  let horaDesmarcar = null;
  function abrirDesmarcar(hora) {
    horaDesmarcar = hora;
    document.getElementById("desmarcarMissaResumo").textContent = `${formatarDataComDiaSemana(diaAtual)} · ${formatarHora(hora)}`;
    abrirModal(modalDesmarcar);
    // as janelas de baixo continuam abertas: o fundo segue sem rolar
    document.body.style.overflow = "hidden";
  }
  function fecharDesmarcar() {
    fecharModal(modalDesmarcar);
    horaDesmarcar = null;
    if (modalHorarios.classList.contains("aberto")) document.body.style.overflow = "hidden";
  }
  document.getElementById("fecharModalDesmarcarMissa").addEventListener("click", fecharDesmarcar);
  document.getElementById("btnVoltarDesmarcarMissa").addEventListener("click", fecharDesmarcar);
  btnConfirmarDesmarcar.addEventListener("click", async () => {
    if (!diaAtual || horaDesmarcar === null) return;
    btnConfirmarDesmarcar.disabled = true;
    try {
      const mapa = missasAtuais();
      mapa[diaAtual] = (mapa[diaAtual] || []).filter((h) => Number(h) !== horaDesmarcar);
      await salvarMissasAdoracao(mapa);
      mostrarToast("Marcação de Santa Missa removida. O horário voltou a ficar disponível.");
      fecharDesmarcar();
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível remover agora. Verifique a conexão e tente novamente.");
    } finally {
      btnConfirmarDesmarcar.disabled = false;
    }
  });

  document.getElementById("fecharModalAgendarHorarios").addEventListener("click", fecharHorarios);
  document.getElementById("fecharModalAgendarNome").addEventListener("click", fecharNome);
  document.getElementById("btnCancelarAgendarNome").addEventListener("click", fecharNome);

  formNome.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!diaAtual || horaAtual === null) return;
    if (checkMissa.checked) { await marcarMissa(); return; }
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

  // marca o horário escolhido como Santa Missa (não pode ter gente agendada nele)
  async function marcarMissa() {
    const hora = horaAtual;
    if (doDia(diaAtual).some((a) => a.hora === hora)) {
      mostrarToast("Esse horário já tem pessoas agendadas. Cancele os agendamentos em Acompanhamento antes de marcar a Santa Missa.");
      return;
    }
    btnConfirmarNome.disabled = true;
    btnConfirmarNome.textContent = "Marcando...";
    try {
      const mapa = missasAtuais();
      mapa[diaAtual] = [...new Set([...(mapa[diaAtual] || []), hora])];
      await salvarMissasAdoracao(mapa);
      fecharNome();
      mostrarToast("Santa Missa marcada. Ninguém poderá agendar nesse horário.");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível marcar agora. Verifique a conexão e tente novamente.");
    } finally {
      btnConfirmarNome.disabled = false;
      aplicarModoMissa();
    }
  }

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
