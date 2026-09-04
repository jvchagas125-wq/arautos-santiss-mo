import { inicializarNavegacao, aplicarLogo, mostrarToast, abrirModal, fecharModal,
  formatarDataComDiaSemana, formatarDataBR, formatarHora, vincularOlhoSenha, criarCalendario,
  isoParaData, dataParaIso, MESES } from "./utils.js";
import {
  obterConfiguracoesGerais, salvarConfiguracoesGerais,
  obterDiasHorarios, salvarDiasHorarios, ouvirDiasHorarios,
  obterSenhaAdmin, salvarSenhaAdmin,
  ouvirTodosAgendamentos, ouvirTodosUsuarios, excluirUsuario, cancelarAgendamento, limparAgendamentosCancelados
} from "./dados.js";
import { SENHA_ADMIN_PADRAO } from "./firebase-config.js";

const CHAVE_SESSAO_ADMIN = "arautos_admin_logado";
let painelJaIniciado = false;

/* ---------------- Login do admin ---------------- */
const telaLoginAdmin = document.getElementById("telaLoginAdmin");
const painelAdmin = document.getElementById("painelAdmin");
const formLoginAdmin = document.getElementById("formLoginAdmin");
const inputSenhaAdmin = document.getElementById("inputSenhaAdmin");
const erroSenhaAdmin = document.getElementById("erroSenhaAdmin");

vincularOlhoSenha(document.getElementById("olhoSenhaAdmin"), inputSenhaAdmin);

function mostrarPainel() {
  telaLoginAdmin.classList.add("oculto");
  painelAdmin.classList.remove("oculto");
  iniciarPainel();
}

if (sessionStorage.getItem(CHAVE_SESSAO_ADMIN) === "1") {
  mostrarPainel();
}

formLoginAdmin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formLoginAdmin.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Verificando...";
  try {
    const senhaCorreta = await obterSenhaAdmin(SENHA_ADMIN_PADRAO);
    if (inputSenhaAdmin.value === senhaCorreta) {
      sessionStorage.setItem(CHAVE_SESSAO_ADMIN, "1");
      mostrarPainel();
    } else {
      erroSenhaAdmin.style.display = "block";
      inputSenhaAdmin.value = "";
      inputSenhaAdmin.focus();
    }
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao conectar. Verifique a configuração do Firebase.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

/* ---------------- Painel (após login) ---------------- */
function iniciarPainel() {
  if (painelJaIniciado) return;
  painelJaIniciado = true;

  inicializarNavegacao("admin");

  document.getElementById("btnSairAdmin").addEventListener("click", () => {
    sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
    location.reload();
  });

  configurarMenuSecoes();
  configurarFrase();
  configurarHorarios();
  configurarAcompanhamento();
  configurarContatos();
  configurarConfiguracoes();
}

function configurarMenuSecoes() {
  const links = document.querySelectorAll("#menuLateral nav a[data-secao]");
  const secoes = document.querySelectorAll(".admin-secao");
  const menuLateral = document.getElementById("menuLateral");
  const overlay = document.getElementById("overlay");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const alvo = link.dataset.secao;
      secoes.forEach((s) => s.classList.toggle("oculto", s.id !== `secao-${alvo}`));
      links.forEach((l) => l.classList.toggle("ativa", l === link));
      menuLateral.classList.remove("aberto");
      overlay.classList.remove("ativo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------------- Frase do dia ---------------- */
function configurarFrase() {
  const form = document.getElementById("formFrase");
  const campoTexto = document.getElementById("campoFraseTexto");
  const campoAutor = document.getElementById("campoFraseAutor");

  obterConfiguracoesGerais().then((config) => {
    campoTexto.value = config.fraseDoDia || "";
    campoAutor.value = config.autorFrase || "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarConfiguracoesGerais({
        fraseDoDia: campoTexto.value.trim(),
        autorFrase: campoAutor.value.trim()
      });
      mostrarToast("Frase do dia atualizada!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar frase";
    }
  });
}

/* ---------------- Dias e horários ---------------- */
function configurarHorarios() {
  const form = document.getElementById("formPeriodo");
  const campoInicio = document.getElementById("campoDataInicio");
  const campoFim = document.getElementById("campoDataFim");
  const grade = document.getElementById("gradeHorariosAdmin");

  const calInicio = criarCalendario(document.getElementById("calendarioInicio"), campoInicio, {});
  const calFim = criarCalendario(document.getElementById("calendarioFim"), campoFim, {});

  for (let h = 0; h < 24; h++) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${h}" /> ${String(h).padStart(2,"0")}h`;
    grade.appendChild(label);
  }
  const checkboxes = () => Array.from(grade.querySelectorAll("input[type=checkbox]"));

  checkboxes().forEach((cb) => {
    cb.addEventListener("change", () => cb.closest("label").classList.toggle("marcado", cb.checked));
  });

  obterDiasHorarios().then((dh) => {
    calInicio.definirValor(dh.dataInicio || null);
    calFim.definirValor(dh.dataFim || null);
    const ativos = new Set(dh.horariosAtivos || []);
    checkboxes().forEach((cb) => {
      cb.checked = ativos.has(Number(cb.value));
      cb.closest("label").classList.toggle("marcado", cb.checked);
    });
  });

  document.getElementById("btnMarcarTodos").addEventListener("click", () => {
    checkboxes().forEach((cb) => { cb.checked = true; cb.closest("label").classList.add("marcado"); });
  });
  document.getElementById("btnDesmarcarTodos").addEventListener("click", () => {
    checkboxes().forEach((cb) => { cb.checked = false; cb.closest("label").classList.remove("marcado"); });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dataInicio = calInicio.obterValor();
    const dataFim = calFim.obterValor();
    if (!dataInicio || !dataFim) {
      mostrarToast("Selecione as duas datas do período.");
      return;
    }
    if (dataFim < dataInicio) {
      mostrarToast('A data "até" precisa ser igual ou depois da data "de".');
      return;
    }
    const horariosAtivos = checkboxes().filter((cb) => cb.checked).map((cb) => Number(cb.value));
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarDiasHorarios({ dataInicio, dataFim, horariosAtivos });
      mostrarToast("Dias e horários atualizados!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar dias e horários";
    }
  });
}

/* ---------------- Acompanhamento ---------------- */
function configurarAcompanhamento() {
  const abas = document.querySelectorAll(".admin-aba");
  const painelAgendados = document.getElementById("painelAgendados");
  const painelCancelados = document.getElementById("painelCancelados");
  const listaCancelados = document.getElementById("listaCancelados");
  const modalMotivo = document.getElementById("modalMotivo");
  const textoMotivo = document.getElementById("textoMotivo");
  const modalCancelarAgend = document.getElementById("modalCancelarAgendamento");
  const nomeCancelarAgendEl = document.getElementById("nomeCancelarAgendamento");
  const btnCancelarNaoCancelar = document.getElementById("btnNaoCancelarAgendamento");
  const btnConfirmarCancelarAgend = document.getElementById("btnConfirmarCancelarAgendamento");
  const fecharModalCancelarAgend = document.getElementById("fecharModalCancelarAgendamento");
  const modalLimparCanceladosAdmin = document.getElementById("modalLimparCancelados");
  const btnLimparCanceladosAdmin = document.getElementById("btnLimparCanceladosAdmin");

  // ---- calendário grande de agendados ----
  const calendarioAgendados = document.getElementById("calendarioAgendados");
  const avisoSemPeriodoAgendados = document.getElementById("avisoSemPeriodoAgendados");
  const calAgendadosMesAno = document.getElementById("calAgendadosMesAno");
  const calAgendadosDias = document.getElementById("calAgendadosDias");
  const calAgendadosMesAnterior = document.getElementById("calAgendadosMesAnterior");
  const calAgendadosMesProximo = document.getElementById("calAgendadosMesProximo");
  const contagemAgendadosTotal = document.getElementById("contagemAgendadosTotal");
  const btnExportarExcel = document.getElementById("btnExportarExcel");

  // ---- modal de detalhes do dia ----
  const modalDiaAgendados = document.getElementById("modalDiaAgendados");
  const diaAgendadosTitulo = document.getElementById("diaAgendadosTitulo");
  const diaAgendadosConteudo = document.getElementById("diaAgendadosConteudo");

  let agendamentosAtivos = [];
  let agendamentoParaCancelar = null;
  let diasHorariosAtual = { dataInicio: "", dataFim: "" };
  let mesAtualAgendados = null;

  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      abas.forEach((a) => a.classList.toggle("ativa", a === aba));
      painelAgendados.classList.toggle("oculto", aba.dataset.aba !== "agendados");
      painelCancelados.classList.toggle("oculto", aba.dataset.aba !== "cancelados");
    });
  });

  document.getElementById("fecharModalMotivo").addEventListener("click", () => fecharModal(modalMotivo));
  document.getElementById("btnFecharMotivo").addEventListener("click", () => fecharModal(modalMotivo));

  /* ---- calendário: renderização ---- */
  function agendamentosDoDia(iso) {
    return agendamentosAtivos.filter((a) => a.data === iso);
  }

  function renderizarCalendarioAgendados() {
    if (!diasHorariosAtual.dataInicio || !diasHorariosAtual.dataFim || !mesAtualAgendados) {
      calendarioAgendados.classList.add("oculto");
      avisoSemPeriodoAgendados.classList.remove("oculto");
      return;
    }
    avisoSemPeriodoAgendados.classList.add("oculto");
    calendarioAgendados.classList.remove("oculto");

    const nomeMes = MESES[mesAtualAgendados.getMonth()];
    calAgendadosMesAno.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mesAtualAgendados.getFullYear()}`;
    calAgendadosDias.innerHTML = "";

    const primeiroDiaSemana = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth(), 1).getDay();
    const totalDias = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth() + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaSemana; i++) {
      const vazio = document.createElement("span");
      vazio.className = "calendario__vazio";
      calAgendadosDias.appendChild(vazio);
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const d = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth(), dia);
      const iso = dataParaIso(d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendario__dia";
      btn.textContent = dia;

      const dentroPeriodo = iso >= diasHorariosAtual.dataInicio && iso <= diasHorariosAtual.dataFim;
      if (dentroPeriodo) {
        btn.classList.add("disponivel");
        const qtd = agendamentosDoDia(iso).length;
        if (qtd > 0) {
          btn.classList.add("tem-agendamentos");
          btn.title = `${qtd} ${qtd === 1 ? "agendamento" : "agendamentos"} — toque para ver detalhes`;
          const badge = document.createElement("span");
          badge.className = "calendario__dia-badge";
          badge.textContent = String(qtd);
          btn.appendChild(badge);
          btn.addEventListener("click", () => abrirModalDiaAgendados(iso));
        }
      }
      calAgendadosDias.appendChild(btn);
    }

    const mesInicioPeriodo = isoParaData(diasHorariosAtual.dataInicio);
    const mesFimPeriodo = isoParaData(diasHorariosAtual.dataFim);
    const anteriorHabilitado = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth(), 0) >=
      new Date(mesInicioPeriodo.getFullYear(), mesInicioPeriodo.getMonth(), 1);
    const proximoHabilitado = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth() + 1, 1) <=
      new Date(mesFimPeriodo.getFullYear(), mesFimPeriodo.getMonth(), 1);
    calAgendadosMesAnterior.disabled = !anteriorHabilitado;
    calAgendadosMesProximo.disabled = !proximoHabilitado;
  }

  calAgendadosMesAnterior.addEventListener("click", () => {
    mesAtualAgendados = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth() - 1, 1);
    renderizarCalendarioAgendados();
  });
  calAgendadosMesProximo.addEventListener("click", () => {
    mesAtualAgendados = new Date(mesAtualAgendados.getFullYear(), mesAtualAgendados.getMonth() + 1, 1);
    renderizarCalendarioAgendados();
  });

  ouvirDiasHorarios((dh) => {
    diasHorariosAtual = dh;
    if (dh.dataInicio && dh.dataFim) {
      const novoMesInicio = new Date(isoParaData(dh.dataInicio).getFullYear(), isoParaData(dh.dataInicio).getMonth(), 1);
      if (!mesAtualAgendados) {
        mesAtualAgendados = novoMesInicio;
      } else {
        const mesFimPeriodo = isoParaData(dh.dataFim);
        const limiteFim = new Date(mesFimPeriodo.getFullYear(), mesFimPeriodo.getMonth(), 1);
        if (mesAtualAgendados < novoMesInicio || mesAtualAgendados > limiteFim) {
          mesAtualAgendados = novoMesInicio;
        }
      }
    } else {
      mesAtualAgendados = null;
    }
    renderizarCalendarioAgendados();
  });

  /* ---- modal de detalhes do dia ---- */
  function abrirModalDiaAgendados(iso) {
    const doDia = agendamentosDoDia(iso).sort((a, b) => a.hora - b.hora);
    diaAgendadosTitulo.textContent = formatarDataComDiaSemana(iso);
    diaAgendadosConteudo.innerHTML = "";

    const porHora = new Map();
    doDia.forEach((a) => {
      if (!porHora.has(a.hora)) porHora.set(a.hora, []);
      porHora.get(a.hora).push(a);
    });

    [...porHora.keys()].sort((a, b) => a - b).forEach((hora) => {
      const pessoas = porHora.get(hora);
      const grupo = document.createElement("div");
      grupo.className = "grupo-horario-dia";

      const titulo = document.createElement("div");
      titulo.className = "grupo-horario-dia__titulo";
      titulo.innerHTML = `${formatarHora(hora)} <span class="contagem-contatos">${pessoas.length}</span>`;
      grupo.appendChild(titulo);

      const listaEl = document.createElement("div");
      listaEl.className = "lista-pessoas-ocupado";

      pessoas.forEach((a) => {
        const item = document.createElement("div");
        item.className = "pessoa-ocupado-item";

        const info = document.createElement("div");
        const nome = document.createElement("div");
        nome.className = "pessoa-ocupado-item__nome";
        nome.textContent = a.nome || "—";
        const tel = document.createElement("div");
        tel.className = "pessoa-ocupado-item__tel";
        tel.textContent = a.telefone || "—";
        info.appendChild(nome);
        info.appendChild(tel);

        const acoes = document.createElement("div");
        acoes.className = "pessoa-ocupado-item__acoes";

        const linkWhats = document.createElement("a");
        linkWhats.className = "link-whatsapp";
        linkWhats.href = `https://wa.me/55${a.telefoneDigits || ""}`;
        linkWhats.target = "_blank";
        linkWhats.rel = "noopener";
        linkWhats.title = "Chamar no WhatsApp";
        linkWhats.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 10.5c.3 2.4 2.1 4.2 4.5 4.5"/></svg>`;

        const btnCancelar = document.createElement("button");
        btnCancelar.type = "button";
        btnCancelar.className = "btn-cancelar-item";
        btnCancelar.title = "Cancelar agendamento";
        btnCancelar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>`;
        btnCancelar.addEventListener("click", () => {
          agendamentoParaCancelar = a;
          nomeCancelarAgendEl.textContent = a.nome || "esta pessoa";
          abrirModal(modalCancelarAgend);
        });

        acoes.appendChild(linkWhats);
        acoes.appendChild(btnCancelar);
        item.appendChild(info);
        item.appendChild(acoes);
        listaEl.appendChild(item);
      });

      grupo.appendChild(listaEl);
      diaAgendadosConteudo.appendChild(grupo);
    });

    abrirModal(modalDiaAgendados);
  }

  document.getElementById("fecharModalDiaAgendados").addEventListener("click", () => fecharModal(modalDiaAgendados));

  /* ---- exportar planilha (Excel) ---- */
  async function exportarAgendadosParaExcel(lista) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Arautos do Evangelho";
    wb.created = new Date();
    const ws = wb.addWorksheet("Agendamentos", { views: [{ state: "frozen", ySplit: 1 }] });

    ws.columns = [
      { header: "Nome", key: "nome", width: 30 },
      { header: "Telefone", key: "telefone", width: 18 },
      { header: "Data", key: "data", width: 14 },
      { header: "Dia da semana", key: "diaSemana", width: 16 },
      { header: "Horário", key: "horario", width: 18 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFDF8" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A0C1E" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    headerRow.height = 20;

    const ordenados = [...lista].sort((a, b) =>
      (a.data + String(a.hora).padStart(2, "0")).localeCompare(b.data + String(b.hora).padStart(2, "0"))
    );
    ordenados.forEach((a) => {
      const diaSemana = formatarDataComDiaSemana(a.data).split(" - ")[1] || "";
      const row = ws.addRow({
        nome: a.nome || "",
        telefone: a.telefone || "",
        data: formatarDataBR(a.data),
        diaSemana,
        horario: formatarHora(a.hora),
      });
      row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; });
    });

    ws.autoFilter = { from: "A1", to: "E1" };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const hoje = new Date();
    const carimbo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    a.download = `agendamentos-arautos-${carimbo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  btnExportarExcel.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (agendamentosAtivos.length === 0) {
      mostrarToast("Não há agendamentos para exportar.");
      return;
    }
    if (typeof ExcelJS === "undefined") {
      mostrarToast("Não foi possível carregar o gerador de planilhas. Verifique sua conexão.");
      return;
    }
    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Gerando planilha...";
    try {
      await exportarAgendadosParaExcel(agendamentosAtivos);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível gerar a planilha. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = htmlOriginal;
    }
  });

  function cardCancelado(a) {
    return `
      <div class="card-agendamento" style="opacity:.75;">
        <div class="card-agendamento__status">Cancelado</div>
        <div class="card-agendamento__pessoa">${escaparHtml(a.nome)}</div>
        <div class="card-agendamento__tel">${escaparHtml(a.telefone)}</div>
        <div class="card-agendamento__data">${formatarDataComDiaSemana(a.data)}</div>
        <div class="card-agendamento__hora">${formatarHora(a.hora)}</div>
        <div class="card-agendamento__acoes">
          <button class="btn btn-contorno" data-motivo="${escaparHtml(a.motivoCancelamento || "Nenhum motivo informado.")}">Ver motivo</button>
        </div>
      </div>`;
  }

  ouvirTodosAgendamentos("agendado", (lista) => {
    agendamentosAtivos = lista;
    contagemAgendadosTotal.textContent = `${lista.length} ${lista.length === 1 ? "agendamento" : "agendamentos"}`;
    renderizarCalendarioAgendados();
  });

  ouvirTodosAgendamentos("cancelado", (lista) => {
    listaCancelados.innerHTML = lista.length
      ? lista.map(cardCancelado).join("")
      : '<p class="mensagem-vazia">Nenhum cancelamento registrado.</p>';
    btnLimparCanceladosAdmin.classList.toggle("oculto", lista.length === 0);
    listaCancelados.querySelectorAll("[data-motivo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        textoMotivo.textContent = btn.dataset.motivo;
        abrirModal(modalMotivo);
      });
    });
  });

  function fecharCancelamentoAgend() {
    fecharModal(modalCancelarAgend);
    agendamentoParaCancelar = null;
  }
  btnCancelarNaoCancelar.addEventListener("click", fecharCancelamentoAgend);
  fecharModalCancelarAgend.addEventListener("click", fecharCancelamentoAgend);

  btnConfirmarCancelarAgend.addEventListener("click", async () => {
    if (!agendamentoParaCancelar) return;
    btnConfirmarCancelarAgend.disabled = true;
    btnConfirmarCancelarAgend.textContent = "Cancelando...";
    try {
      await cancelarAgendamento(
        agendamentoParaCancelar.id,
        agendamentoParaCancelar.data,
        agendamentoParaCancelar.hora,
        "Cancelado pelo painel administrativo."
      );
      mostrarToast("Agendamento cancelado.");
      fecharModal(modalCancelarAgend);
      fecharModal(modalDiaAgendados);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível cancelar agora. Tente novamente.");
    } finally {
      agendamentoParaCancelar = null;
      btnConfirmarCancelarAgend.disabled = false;
      btnConfirmarCancelarAgend.textContent = "Cancelar agendamento";
    }
  });

  btnLimparCanceladosAdmin.addEventListener("click", () => abrirModal(modalLimparCanceladosAdmin));
  document.getElementById("fecharModalLimparCancelados").addEventListener("click", () => fecharModal(modalLimparCanceladosAdmin));
  document.getElementById("btnVoltarLimparCanceladosAdmin").addEventListener("click", () => fecharModal(modalLimparCanceladosAdmin));

  document.getElementById("btnConfirmarLimparCanceladosAdmin").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Limpando...";
    try {
      await limparAgendamentosCancelados();
      mostrarToast("Histórico de cancelados limpo.");
      fecharModal(modalLimparCanceladosAdmin);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível limpar agora. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Limpar cancelados";
    }
  });
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

/* ---------------- Contatos (pessoas cadastradas) ---------------- */
function configurarContatos() {
  const campoBusca = document.getElementById("buscaContatos");
  const lista = document.getElementById("listaContatos");
  const contagemEl = document.getElementById("contagemContatos");
  const modalRemover = document.getElementById("modalRemoverContato");
  const nomeRemoverEl = document.getElementById("nomeRemoverContato");
  const btnCancelarRemover = document.getElementById("btnCancelarRemoverContato");
  const btnConfirmarRemover = document.getElementById("btnConfirmarRemoverContato");
  const fecharModalRemover = document.getElementById("fecharModalRemoverContato");
  let todosContatos = [];
  let telefoneParaRemover = null;

  function normalizar(texto) {
    return (texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function cardContato(c) {
    const numeroWhats = "55" + (c.telefoneDigits || "");
    return `
      <div class="card-contato">
        <div>
          <div class="card-contato__nome">${escaparHtml(c.nome)}</div>
          <div class="card-contato__tel">${escaparHtml(c.telefone)}</div>
        </div>
        <div class="card-contato__acoes">
          <a class="card-contato__whats" href="https://wa.me/${numeroWhats}" target="_blank" rel="noopener" title="Chamar no WhatsApp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 10.5c.3 2.4 2.1 4.2 4.5 4.5"/></svg>
          </a>
          <button type="button" class="card-contato__excluir" data-tel="${escaparHtml(c.telefoneDigits)}" data-nome="${escaparHtml(c.nome)}" title="Remover cadastro">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>`;
  }

  function renderizar() {
    const filtro = normalizar(campoBusca.value);
    const filtrados = !filtro
      ? todosContatos
      : todosContatos.filter((c) => normalizar(c.nome).includes(filtro) || normalizar(c.telefone).includes(filtro));

    contagemEl.textContent = `(${filtrados.length})`;

    if (filtrados.length === 0) {
      lista.innerHTML = todosContatos.length === 0
        ? '<p class="mensagem-vazia">Ninguém se cadastrou no site ainda.</p>'
        : '<p class="mensagem-vazia">Nenhum contato encontrado para essa busca.</p>';
      return;
    }
    lista.innerHTML = filtrados.map(cardContato).join("");

    lista.querySelectorAll(".card-contato__excluir").forEach((btn) => {
      btn.addEventListener("click", () => {
        telefoneParaRemover = btn.dataset.tel;
        nomeRemoverEl.textContent = btn.dataset.nome || "esta pessoa";
        abrirModal(modalRemover);
      });
    });
  }

  function fecharRemocao() {
    fecharModal(modalRemover);
    telefoneParaRemover = null;
  }
  btnCancelarRemover.addEventListener("click", fecharRemocao);
  fecharModalRemover.addEventListener("click", fecharRemocao);

  btnConfirmarRemover.addEventListener("click", async () => {
    if (!telefoneParaRemover) return;
    btnConfirmarRemover.disabled = true;
    btnConfirmarRemover.textContent = "Removendo...";
    try {
      await excluirUsuario(telefoneParaRemover);
      mostrarToast("Cadastro removido com sucesso.");
      fecharModal(modalRemover);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível remover o cadastro. Tente novamente.");
    } finally {
      telefoneParaRemover = null;
      btnConfirmarRemover.disabled = false;
      btnConfirmarRemover.textContent = "Remover cadastro";
    }
  });

  campoBusca.addEventListener("input", renderizar);

  ouvirTodosUsuarios((lista_) => {
    todosContatos = lista_;
    renderizar();
  });
}

/* ---------------- Configurações (logo, fundo, senha) ---------------- */
function comprimirImagem(file, maxWidth, qualidade, tipoSaida) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(tipoSaida, qualidade));
      };
      img.onerror = reject;
      img.src = leitor.result;
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(file);
  });
}

function configurarConfiguracoes() {
  const previewLogo = document.getElementById("previewLogo");
  const previewFundo = document.getElementById("previewFundo");
  const uploadLogo = document.getElementById("uploadLogo");
  const uploadFundo = document.getElementById("uploadFundo");
  const urlLogo = document.getElementById("urlLogo");
  const urlFundo = document.getElementById("urlFundo");

  vincularOlhoSenha(document.getElementById("olhoNovaSenha"), document.getElementById("campoNovaSenha"));

  let novoLogoDataUrl = null;
  let novoFundoDataUrl = null;

  obterConfiguracoesGerais().then((config) => {
    if (config.logoUrl) previewLogo.src = config.logoUrl;
    if (config.fundoUrl) previewFundo.src = config.fundoUrl;
  });

  uploadLogo.addEventListener("change", async () => {
    const file = uploadLogo.files[0];
    if (!file) return;
    novoLogoDataUrl = await comprimirImagem(file, 320, 0.9, "image/png");
    previewLogo.src = novoLogoDataUrl;
    urlLogo.value = "";
  });
  uploadFundo.addEventListener("change", async () => {
    const file = uploadFundo.files[0];
    if (!file) return;
    novoFundoDataUrl = await comprimirImagem(file, 1000, 0.65, "image/jpeg");
    previewFundo.src = novoFundoDataUrl;
    urlFundo.value = "";
  });

  document.getElementById("btnSalvarLogo").addEventListener("click", async () => {
    const valor = novoLogoDataUrl || urlLogo.value.trim();
    if (!valor) { mostrarToast("Selecione um arquivo ou cole um link para a logo."); return; }
    try {
      await salvarConfiguracoesGerais({ logoUrl: valor });
      aplicarLogo(valor);
      mostrarToast("Logo atualizada!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar a logo (arquivo muito grande). Tente uma imagem menor ou um link.");
    }
  });

  document.getElementById("btnSalvarFundo").addEventListener("click", async () => {
    const valor = novoFundoDataUrl || urlFundo.value.trim();
    if (!valor) { mostrarToast("Selecione um arquivo ou cole um link para o fundo."); return; }
    try {
      await salvarConfiguracoesGerais({ fundoUrl: valor });
      mostrarToast("Foto de fundo atualizada!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar (arquivo muito grande). Tente uma imagem menor ou um link.");
    }
  });

  document.getElementById("btnSalvarSenha").addEventListener("click", async () => {
    const campo = document.getElementById("campoNovaSenha");
    if (campo.value.trim().length < 4) {
      mostrarToast("A senha precisa ter pelo menos 4 caracteres.");
      return;
    }
    try {
      await salvarSenhaAdmin(campo.value.trim());
      campo.value = "";
      mostrarToast("Senha alterada com sucesso!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível alterar a senha.");
    }
  });
}
