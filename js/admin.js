import { inicializarNavegacao, aplicarLogo, mostrarToast, abrirModal, fecharModal,
  formatarDataComDiaSemana, formatarDataBR, formatarHora, vincularOlhoSenha, criarCalendario, criarSeletorHora,
  isoParaData, dataParaIso, horariosDisponiveisNoDia,
  MESES, CATEGORIAS_INTENCAO, DIAS_SEMANA_COMPLETO, linkificarTexto } from "./utils.js";
import {
  obterConfiguracoesGerais, salvarConfiguracoesGerais,
  obterFrases, salvarFrases,
  obterDiasHorarios, salvarDiasHorarios, ouvirDiasHorarios,
  obterSenhaAdmin, salvarSenhaAdmin,
  ouvirTodosAgendamentos, ouvirTodosUsuarios, excluirUsuario, cancelarAgendamento, limparAgendamentosCancelados,
  marcarAgendamentoExtra, ouvirMissasNaGrade, definirMissaNaGrade,
  obterConfigIntencoes, salvarConfigIntencoes, ouvirTodasIntencoes, excluirListaIntencoes,
  ouvirAvisos, criarAviso, atualizarAviso, excluirAviso
} from "./dados.js";
import { SENHA_ADMIN_PADRAO } from "./firebase-config.js";

// Guarda a própria senha (não apenas um sinalizador) para que o acesso automático
// só continue válido enquanto essa for a senha atual do painel — se o padre trocar
// a senha em "Configurações", todo mundo que tinha login automático precisa digitar
// a nova senha uma vez.
const CHAVE_SENHA_ADMIN_LOCAL = "arautos_admin_senha";
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

async function tentarLoginAutomatico() {
  const senhaSalva = localStorage.getItem(CHAVE_SENHA_ADMIN_LOCAL);
  if (!senhaSalva) return;
  try {
    const senhaCorreta = await obterSenhaAdmin(SENHA_ADMIN_PADRAO);
    if (senhaSalva === senhaCorreta) {
      mostrarPainel();
    } else {
      // a senha foi trocada desde o último acesso: pede login novamente
      localStorage.removeItem(CHAVE_SENHA_ADMIN_LOCAL);
    }
  } catch (err) {
    console.error(err);
    // sem conexão no momento: não bloqueia quem já tinha acesso salvo neste aparelho
    mostrarPainel();
  }
}
tentarLoginAutomatico();

formLoginAdmin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formLoginAdmin.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Verificando...";
  try {
    const senhaCorreta = await obterSenhaAdmin(SENHA_ADMIN_PADRAO);
    if (inputSenhaAdmin.value === senhaCorreta) {
      localStorage.setItem(CHAVE_SENHA_ADMIN_LOCAL, senhaCorreta);
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
    localStorage.removeItem(CHAVE_SENHA_ADMIN_LOCAL);
    location.reload();
  });

  configurarMenuSecoes();
  configurarFrase();
  configurarHorarios();
  configurarIntencoes();
  configurarAvisos();
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

/* ---------------- Frase do dia (até 30, em rotação) ---------------- */
function configurarFrase() {
  const form = document.getElementById("formFrase");
  const lista = document.getElementById("listaFrases");

  for (let i = 0; i < 30; i++) {
    const linha = document.createElement("div");
    linha.className = "linha-frase";
    linha.innerHTML = `
      <span class="linha-frase__numero">${i + 1}</span>
      <div class="linha-frase__campos">
        <textarea rows="2" class="campo-frase-texto" placeholder="Frase ${i + 1} (opcional)"></textarea>
        <input type="text" class="campo-frase-autor" placeholder="Autor (opcional)" />
      </div>
    `;
    lista.appendChild(linha);
  }
  const camposTexto = () => Array.from(lista.querySelectorAll(".campo-frase-texto"));
  const camposAutor = () => Array.from(lista.querySelectorAll(".campo-frase-autor"));

  obterFrases().then((dados) => {
    const textos = camposTexto();
    const autores = camposAutor();
    dados.lista.forEach((item, i) => {
      if (textos[i]) textos[i].value = item?.frase || "";
      if (autores[i]) autores[i].value = item?.autor || "";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textos = camposTexto();
    const autores = camposAutor();
    const novaLista = textos.map((campo, i) => ({
      frase: campo.value.trim(),
      autor: autores[i].value.trim()
    }));
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarFrases(novaLista);
      mostrarToast("Frases atualizadas!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar frases";
    }
  });
}

/* ---------------- Dias e horários ---------------- */
function configurarHorarios() {
  const form = document.getElementById("formPeriodo");
  const campoInicio = document.getElementById("campoDataInicio");
  const campoFim = document.getElementById("campoDataFim");
  const grupoDataFim = document.getElementById("grupoDataFim");
  const campoSomenteEsseDia = document.getElementById("campoSomenteEsseDia");
  const campoHoraInicioPrimeiroDia = document.getElementById("campoHoraInicioPrimeiroDia");
  const campoHoraFimUltimoDia = document.getElementById("campoHoraFimUltimoDia");
  const grade = document.getElementById("gradeHorariosAdmin");

  const calFim = criarCalendario(document.getElementById("calendarioFim"), campoFim, {});
  const calInicio = criarCalendario(document.getElementById("calendarioInicio"), campoInicio, {
    aoSelecionar: (iso) => {
      if (campoSomenteEsseDia.checked) calFim.definirValor(iso);
    }
  });
  const seletorHoraInicio = criarSeletorHora(document.getElementById("seletorHoraInicioPrimeiroDia"), campoHoraInicioPrimeiroDia, {});
  const seletorHoraFim = criarSeletorHora(document.getElementById("seletorHoraFimUltimoDia"), campoHoraFimUltimoDia, {});

  function aplicarEstadoSomenteEsseDia(ativo) {
    grupoDataFim.classList.toggle("campo-desativado", ativo);
    campoFim.disabled = ativo;
    if (ativo) calFim.definirValor(calInicio.obterValor());
  }
  campoSomenteEsseDia.addEventListener("change", () => aplicarEstadoSomenteEsseDia(campoSomenteEsseDia.checked));

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
    campoSomenteEsseDia.checked = !!dh.somenteEsseDia;
    aplicarEstadoSomenteEsseDia(campoSomenteEsseDia.checked);
    seletorHoraInicio.definirValor(dh.horaInicioPrimeiroDia || "");
    seletorHoraFim.definirValor(dh.horaFimUltimoDia || "");
  });

  document.getElementById("btnMarcarTodos").addEventListener("click", () => {
    checkboxes().forEach((cb) => { cb.checked = true; cb.closest("label").classList.add("marcado"); });
  });
  document.getElementById("btnDesmarcarTodos").addEventListener("click", () => {
    checkboxes().forEach((cb) => { cb.checked = false; cb.closest("label").classList.remove("marcado"); });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const somenteEsseDia = campoSomenteEsseDia.checked;
    const dataInicio = calInicio.obterValor();
    if (!dataInicio) {
      mostrarToast(somenteEsseDia ? "Selecione a data do dia de adoração." : "Selecione as duas datas do período.");
      return;
    }
    let dataFim = somenteEsseDia ? dataInicio : calFim.obterValor();
    if (!somenteEsseDia) {
      if (!dataFim) {
        mostrarToast("Selecione as duas datas do período.");
        return;
      }
      if (dataFim < dataInicio) {
        mostrarToast('A data "até" precisa ser igual ou depois da data "de".');
        return;
      }
    }
    const horariosAtivos = checkboxes().filter((cb) => cb.checked).map((cb) => Number(cb.value));
    const horaInicioPrimeiroDia = seletorHoraInicio.obterValor();
    const horaFimUltimoDia = seletorHoraFim.obterValor();
    if (somenteEsseDia && horaInicioPrimeiroDia && horaFimUltimoDia && horaInicioPrimeiroDia >= horaFimUltimoDia) {
      mostrarToast('No mesmo dia, o horário de início precisa ser antes do horário de término.');
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarDiasHorarios({ dataInicio, dataFim, horariosAtivos, somenteEsseDia, horaInicioPrimeiroDia, horaFimUltimoDia });
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

/* ---------------- Intenções da missa ---------------- */
function configurarIntencoes() {
  const form = document.getElementById("formHorariosMissas");
  const gradesPorDia = document.getElementById("gradesPorDia");
  const campoHorasAntes = document.getElementById("campoHorasAntes");
  const listaQuadros = document.getElementById("listaQuadrosIntencoes");
  const avisoSemIntencoes = document.getElementById("avisoSemIntencoes");

  const modalExcluirLista = document.getElementById("modalExcluirLista");
  const nomeExcluirLista = document.getElementById("nomeExcluirLista");
  let listaParaExcluir = null; // { dataMissa, horaMissa, rotulo }

  // um "quadro" colapsável por dia da semana (índice = Date.getDay(): 0=domingo ... 6=sábado),
  // exibidos na ordem segunda...domingo para ficar mais natural de ler
  const ORDEM_EXIBICAO = [1, 2, 3, 4, 5, 6, 0];
  const gradesPorIndice = []; // gradesPorIndice[diaSemana] = elemento .grade-checkbox

  ORDEM_EXIBICAO.forEach((diaSemana) => {
    const quadro = document.createElement("div");
    quadro.className = "quadro-dia-missa";

    const cabecalho = document.createElement("div");
    cabecalho.className = "quadro-dia-missa__cabecalho";
    cabecalho.innerHTML = `
      <svg class="quadro-dia-missa__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      <span class="quadro-dia-missa__titulo">${DIAS_SEMANA_COMPLETO[diaSemana]}</span>
      <span class="quadro-dia-missa__resumo" data-resumo>Sem horário</span>
    `;

    const corpo = document.createElement("div");
    corpo.className = "quadro-dia-missa__corpo oculto";
    const grade = document.createElement("div");
    grade.className = "grade-checkbox";
    for (let h = 0; h < 24; h++) {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${h}" /> ${String(h).padStart(2,"0")}h`;
      grade.appendChild(label);
    }
    corpo.appendChild(grade);
    gradesPorIndice[diaSemana] = grade;

    const resumoEl = cabecalho.querySelector("[data-resumo]");
    function atualizarResumo() {
      const qtd = grade.querySelectorAll("input:checked").length;
      resumoEl.textContent = qtd === 0 ? "Sem horário" : `${qtd} ${qtd === 1 ? "horário" : "horários"}`;
      quadro.classList.toggle("quadro-dia-missa--vazio", qtd === 0);
    }
    grade.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        cb.closest("label").classList.toggle("marcado", cb.checked);
        atualizarResumo();
      });
    });
    atualizarResumo();

    cabecalho.addEventListener("click", () => {
      quadro.classList.toggle("aberto");
      corpo.classList.toggle("oculto");
    });

    quadro.appendChild(cabecalho);
    quadro.appendChild(corpo);
    gradesPorDia.appendChild(quadro);
  });

  function marcarHoras(diaSemana, horas) {
    const ativos = new Set(horas || []);
    const grade = gradesPorIndice[diaSemana];
    grade.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = ativos.has(Number(cb.value));
      cb.closest("label").classList.toggle("marcado", cb.checked);
    });
    const qtd = grade.querySelectorAll("input:checked").length;
    const quadro = grade.closest(".quadro-dia-missa");
    const resumoEl = quadro.querySelector("[data-resumo]");
    resumoEl.textContent = qtd === 0 ? "Sem horário" : `${qtd} ${qtd === 1 ? "horário" : "horários"}`;
    quadro.classList.toggle("quadro-dia-missa--vazio", qtd === 0);
  }
  function horasMarcadas(diaSemana) {
    return Array.from(gradesPorIndice[diaSemana].querySelectorAll("input[type=checkbox]"))
      .filter((cb) => cb.checked).map((cb) => Number(cb.value));
  }

  obterConfigIntencoes().then((config) => {
    for (let d = 0; d < 7; d++) marcarHoras(d, config.horariosPorDia[d]);
    campoHorasAntes.value = config.horasAntes;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const horariosPorDia = [];
    for (let d = 0; d < 7; d++) horariosPorDia.push(horasMarcadas(d));
    const horasAntes = Number(campoHorasAntes.value) || 3;
    if (horariosPorDia.every((h) => h.length === 0)) {
      mostrarToast("Selecione pelo menos um horário de missa.");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarConfigIntencoes({ horariosPorDia, horasAntes });
      mostrarToast("Horários das missas atualizados!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar horários das missas";
    }
  });

  function tituloLista(dataMissa, horaMissa) {
    return `Missa de ${formatarDataComDiaSemana(dataMissa)} às ${String(horaMissa).padStart(2,"0")}:00`;
  }

  function renderizarQuadros(entradas) {
    const grupos = new Map(); // "data|hora" -> [entradas]
    entradas.forEach((it) => {
      const chave = `${it.dataMissa}|${it.horaMissa}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(it);
    });

    const chavesOrdenadas = [...grupos.keys()].sort((a, b) => b.localeCompare(a));
    listaQuadros.innerHTML = "";
    avisoSemIntencoes.classList.toggle("oculto", chavesOrdenadas.length > 0);

    chavesOrdenadas.forEach((chave) => {
      const [dataMissa, horaMissaStr] = chave.split("|");
      const horaMissa = Number(horaMissaStr);
      const itens = grupos.get(chave);
      const rotulo = tituloLista(dataMissa, horaMissa);

      const quadro = document.createElement("div");
      quadro.className = "quadro-intencao";

      const cabecalho = document.createElement("div");
      cabecalho.className = "quadro-intencao__cabecalho";
      cabecalho.innerHTML = `
        <svg class="quadro-intencao__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        <span class="quadro-intencao__titulo">${rotulo} — ${itens.length} ${itens.length === 1 ? "intenção" : "intenções"}</span>
        <button type="button" class="quadro-intencao__lixeira" title="Apagar lista">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
        </button>
      `;

      const corpo = document.createElement("div");
      corpo.className = "quadro-intencao__corpo oculto";
      CATEGORIAS_INTENCAO.forEach(({ chave: chaveCategoria, rotulo: rotuloCategoria }) => {
        const doGrupo = itens.filter((it) => it.categoria === chaveCategoria);
        if (doGrupo.length === 0) return;
        const bloco = document.createElement("div");
        bloco.className = "grupo-horario-dia";
        const titulo = document.createElement("div");
        titulo.className = "grupo-horario-dia__titulo";
        titulo.textContent = `${rotuloCategoria} (${doGrupo.length})`;
        bloco.appendChild(titulo);
        doGrupo.forEach((it) => {
          const item = document.createElement("div");
          item.className = "intencao-item";
          item.textContent = it.texto;
          bloco.appendChild(item);
        });
        corpo.appendChild(bloco);
      });

      cabecalho.addEventListener("click", () => {
        quadro.classList.toggle("aberto");
        corpo.classList.toggle("oculto");
      });
      cabecalho.querySelector(".quadro-intencao__lixeira").addEventListener("click", (e) => {
        e.stopPropagation();
        listaParaExcluir = { dataMissa, horaMissa, rotulo };
        nomeExcluirLista.textContent = rotulo;
        abrirModal(modalExcluirLista);
      });

      quadro.appendChild(cabecalho);
      quadro.appendChild(corpo);
      listaQuadros.appendChild(quadro);
    });
  }

  ouvirTodasIntencoes(renderizarQuadros);

  document.getElementById("fecharModalExcluirLista").addEventListener("click", () => fecharModal(modalExcluirLista));
  document.getElementById("btnVoltarExcluirLista").addEventListener("click", () => fecharModal(modalExcluirLista));
  document.getElementById("btnConfirmarExcluirLista").addEventListener("click", async (e) => {
    if (!listaParaExcluir) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Apagando...";
    try {
      await excluirListaIntencoes(listaParaExcluir.dataMissa, listaParaExcluir.horaMissa);
      mostrarToast("Lista de intenções apagada.");
      fecharModal(modalExcluirLista);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível apagar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Apagar lista";
    }
  });
}

/* ---------------- Avisos ---------------- */
function configurarAvisos() {
  const formNovo = document.getElementById("formNovoAviso");
  const campoTitulo = document.getElementById("campoAvisoTitulo");
  const campoTexto = document.getElementById("campoAvisoTexto");
  const campoImagem = document.getElementById("campoAvisoImagem");
  const listaAvisosAdmin = document.getElementById("listaAvisosAdmin");
  const avisoSemAvisos = document.getElementById("avisoSemAvisos");

  const modalExcluirAviso = document.getElementById("modalExcluirAviso");
  const nomeExcluirAviso = document.getElementById("nomeExcluirAviso");
  let avisoParaExcluir = null;

  formNovo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = formNovo.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Publicando...";
    try {
      await criarAviso({
        titulo: campoTitulo.value.trim(),
        texto: campoTexto.value.trim(),
        imagemUrl: campoImagem.value.trim()
      });
      formNovo.reset();
      mostrarToast("Aviso publicado!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível publicar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Publicar aviso";
    }
  });

  function renderizarAvisos(lista) {
    listaAvisosAdmin.innerHTML = "";
    avisoSemAvisos.classList.toggle("oculto", lista.length > 0);

    lista.forEach((aviso) => {
      const card = document.createElement("div");
      card.className = "cartao-aviso-admin";
      card.innerHTML = `
        ${aviso.imagemUrl ? `<img src="${aviso.imagemUrl}" alt="" class="cartao-aviso-admin__img" />` : ""}
        <div class="cartao-aviso-admin__corpo">
          <div class="cartao-aviso-admin__titulo">${aviso.titulo}</div>
          <p class="cartao-aviso-admin__texto"></p>
          <div class="cartao-aviso-admin__acoes">
            <button type="button" class="btn btn-contorno btn-pequeno btn-editar-aviso">Editar</button>
            <button type="button" class="btn btn-vermelho btn-pequeno btn-excluir-aviso" title="Apagar aviso">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:-2px;"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
              Excluir
            </button>
          </div>
          <form class="form-editar-aviso oculto">
            <div class="campo">
              <label>Título</label>
              <input type="text" class="campo-edit-titulo" value="${aviso.titulo.replace(/"/g,"&quot;")}" required />
            </div>
            <div class="campo">
              <label>Texto</label>
              <textarea rows="3" class="campo-edit-texto" required>${aviso.texto}</textarea>
            </div>
            <div class="campo">
              <label>URL da imagem (opcional)</label>
              <input type="url" class="campo-edit-imagem" value="${(aviso.imagemUrl || "").replace(/"/g,"&quot;")}" />
            </div>
            <div class="cartao-aviso-admin__acoes">
              <button type="button" class="btn btn-contorno btn-pequeno btn-cancelar-edicao-aviso">Cancelar</button>
              <button type="submit" class="btn btn-dourado btn-pequeno">Salvar</button>
            </div>
          </form>
        </div>
      `;

      linkificarTexto(aviso.texto || "", card.querySelector(".cartao-aviso-admin__texto"));

      const formEdicao = card.querySelector(".form-editar-aviso");
      const btnEditar = card.querySelector(".btn-editar-aviso");
      const btnExcluir = card.querySelector(".btn-excluir-aviso");
      const btnCancelarEdicao = card.querySelector(".btn-cancelar-edicao-aviso");

      btnEditar.addEventListener("click", () => {
        formEdicao.classList.remove("oculto");
        btnEditar.closest(".cartao-aviso-admin__acoes").classList.add("oculto");
      });
      btnCancelarEdicao.addEventListener("click", () => {
        formEdicao.classList.add("oculto");
        btnEditar.closest(".cartao-aviso-admin__acoes").classList.remove("oculto");
      });
      btnExcluir.addEventListener("click", () => {
        avisoParaExcluir = aviso.id;
        nomeExcluirAviso.textContent = aviso.titulo;
        abrirModal(modalExcluirAviso);
      });
      formEdicao.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btnSalvar = formEdicao.querySelector("button[type=submit]");
        btnSalvar.disabled = true;
        btnSalvar.textContent = "Salvando...";
        try {
          await atualizarAviso(aviso.id, {
            titulo: formEdicao.querySelector(".campo-edit-titulo").value.trim(),
            texto: formEdicao.querySelector(".campo-edit-texto").value.trim(),
            imagemUrl: formEdicao.querySelector(".campo-edit-imagem").value.trim()
          });
          mostrarToast("Aviso atualizado!");
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível salvar. Tente novamente.");
        } finally {
          btnSalvar.disabled = false;
          btnSalvar.textContent = "Salvar";
        }
      });

      listaAvisosAdmin.appendChild(card);
    });
  }

  ouvirAvisos(renderizarAvisos);

  document.getElementById("fecharModalExcluirAviso").addEventListener("click", () => fecharModal(modalExcluirAviso));
  document.getElementById("btnVoltarExcluirAviso").addEventListener("click", () => fecharModal(modalExcluirAviso));
  document.getElementById("btnConfirmarExcluirAviso").addEventListener("click", async (e) => {
    if (!avisoParaExcluir) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Apagando...";
    try {
      await excluirAviso(avisoParaExcluir);
      mostrarToast("Aviso apagado.");
      fecharModal(modalExcluirAviso);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível apagar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Apagar aviso";
    }
  });
}

/* ---------------- Exportação da planilha (grade semanal, estilo do modelo da coordenação) ---------------- */
const CORES_EXPORT = {
  tituloBg: "FF7A0C1E",
  tituloTexto: "FFFFFDF8",
  cabecalhoBg: "FFCDA434",
  cabecalhoTexto: "FF4A0711",
  nicodemos: "FFBDD7EE",  // 00h-06h e 21h-23h
  arautos: "FFC6E0B4",    // 07h-11h
  madalena: "FFF4D9A0",   // 12h-20h
  extra: "FFCBB6E8",      // agendamento marcado como "extra" no painel
  aberto: "FFE06666",     // horário livre, sem ninguém agendado
  missa: "FFFFF2A8",      // horário marcado como Missa no painel
  bloqueado: "FF1A1A1A"   // hora fora do período configurado (antes/depois do limite do dia)
};

function corDoGrupoPorHora(hora) {
  if ((hora >= 0 && hora <= 6) || (hora >= 21 && hora <= 23)) return CORES_EXPORT.nicodemos;
  if (hora >= 7 && hora <= 11) return CORES_EXPORT.arautos;
  return CORES_EXPORT.madalena; // 12h-20h
}

// Divide o período todo (De -> Até) em blocos de 7 dias corridos, um bloco = uma aba da planilha.
// Quando sobra um resto pequeno no final (ex.: o período termina num único sábado avulso depois
// da última semana cheia), esse resto é incorporado à última semana em vez de virar uma aba nova
// quase vazia — assim uma semana de sábado a sábado (8 dias) sai numa aba só.
function gerarBlocosDeSemana(dataInicio, dataFim) {
  const todosDias = [];
  let d = isoParaData(dataInicio);
  while (dataParaIso(d) <= dataFim) {
    todosDias.push(dataParaIso(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  if (todosDias.length === 0) return [];

  const numSemanasCheias = Math.floor(todosDias.length / 7);
  const resto = todosDias.length % 7;
  const semanasAntesDaUltima = resto === 0 ? numSemanasCheias : numSemanasCheias - 1;

  const blocos = [];
  let i = 0;
  for (let s = 0; s < semanasAntesDaUltima; s++) {
    blocos.push(todosDias.slice(i, i + 7));
    i += 7;
  }
  if (i < todosDias.length) {
    blocos.push(todosDias.slice(i));
  }
  return blocos;
}

// Aba 1: lista simples e filtrável (formato antigo), útil pra buscar/ordenar.
function adicionarAbaListaCompleta(wb, lista) {
  const ws = wb.addWorksheet("Lista completa", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Nome", key: "nome", width: 30 },
    { header: "Telefone", key: "telefone", width: 18 },
    { header: "Data", key: "data", width: 14 },
    { header: "Dia da semana", key: "diaSemana", width: 16 },
    { header: "Horário", key: "horario", width: 18 },
    { header: "Extra", key: "extra", width: 10 }
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
      extra: a.extra ? "Sim" : ""
    });
    row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; });
  });

  ws.autoFilter = { from: "A1", to: "F1" };
}

// Abas seguintes: uma grade por semana (estilo da planilha da coordenação), com cores por grupo,
// "extra", "Missa" e horários bloqueados/fora do período configurado.
function adicionarAbasDeSemana(wb, dias, porDataHora, missasGrade, diasHorariosAtual, indiceSemana) {
  const ws = wb.addWorksheet(`Semana ${indiceSemana + 1}`, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }]
  });

  const totalColunas = 1 + dias.length;
  ws.getColumn(1).width = 7;
  for (let c = 2; c <= totalColunas; c++) ws.getColumn(c).width = 22;

  ws.mergeCells(1, 1, 1, totalColunas);
  const tituloCell = ws.getCell(1, 1);
  tituloCell.value = `SEMANA ${indiceSemana + 1} — ADORAÇÃO EUCARÍSTICA (${formatarDataBR(dias[0])} a ${formatarDataBR(dias[dias.length - 1])})`;
  tituloCell.font = { bold: true, size: 13, color: { argb: CORES_EXPORT.tituloTexto } };
  tituloCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.tituloBg } };
  tituloCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  const headerRow = ws.getRow(2);
  dias.forEach((iso, i) => {
    const nomeDia = DIAS_SEMANA_COMPLETO[isoParaData(iso).getDay()].toLowerCase();
    const cell = headerRow.getCell(2 + i);
    cell.value = `${nomeDia} ${formatarDataBR(iso).slice(0, 5)}`;
    cell.font = { bold: true, color: { argb: CORES_EXPORT.cabecalhoTexto } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.cabecalhoBg } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 24;

  for (let hora = 0; hora < 24; hora++) {
    const row = ws.getRow(3 + hora);
    const celHora = row.getCell(1);
    celHora.value = `${String(hora).padStart(2, "0")}h`;
    celHora.font = { bold: true };
    celHora.alignment = { vertical: "middle", horizontal: "center" };

    dias.forEach((iso, i) => {
      const cell = row.getCell(2 + i);
      const horasAtivasDoDia = new Set(horariosDisponiveisNoDia(diasHorariosAtual, iso));
      const chave = `${iso}_${hora}`;
      const pessoas = porDataHora.get(chave) || [];

      if (missasGrade.has(chave)) {
        cell.value = "MISSA";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.missa } };
        cell.font = { bold: true, color: { argb: "FF6B5900" } };
      } else if (!horasAtivasDoDia.has(hora)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.bloqueado } };
      } else if (pessoas.length > 0) {
        const algumExtra = pessoas.some((p) => p.extra);
        cell.value = pessoas.map((p) => p.nome || "—").join(" / ");
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: algumExtra ? CORES_EXPORT.extra : corDoGrupoPorHora(hora) } };
        cell.font = { color: { argb: "FF3A2A1A" } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.aberto } };
      }
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    row.height = 26;
  }

  const linhaLegendaInicio = 3 + 24 + 1;
  const legenda = [
    [CORES_EXPORT.arautos, "Arautos (07h às 11h)", "FF3A2A1A"],
    [CORES_EXPORT.nicodemos, "Grupo São Nicodemos — Homens (00h às 06h e 21h às 23h) *", "FF3A2A1A"],
    [CORES_EXPORT.madalena, "Grupo Santa Maria Madalena — para todos (12h às 20h)", "FF3A2A1A"],
    [CORES_EXPORT.extra, "Extra — qualquer grupo", "FF3A2A1A"],
    [CORES_EXPORT.missa, "Missa (sem adoração no horário)", "FF6B5900"],
    [CORES_EXPORT.aberto, "Horário em aberto!!!", "FFFFFFFF"],
    [CORES_EXPORT.bloqueado, "Fora do período de adoração", "FFFFFFFF"]
  ];
  legenda.forEach(([cor, texto, corTexto], i) => {
    const linha = linhaLegendaInicio + i;
    ws.mergeCells(linha, 2, linha, totalColunas);
    const cell = ws.getCell(linha, 2);
    cell.value = texto;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
    cell.font = { bold: true, color: { argb: corTexto } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(linha).height = 20;
  });

  const linhaObs = linhaLegendaInicio + legenda.length + 1;
  ws.mergeCells(linhaObs, 1, linhaObs, totalColunas);
  const obsCell = ws.getCell(linhaObs, 1);
  obsCell.value = "* As esposas dos integrantes do Grupo São Nicodemos podem acompanhá-los.";
  obsCell.font = { italic: true };
  obsCell.alignment = { vertical: "middle", horizontal: "center" };
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
  let missasGradeAtual = new Set(); // chaves "AAAA-MM-DD_hora", usadas no modal do dia e na exportação
  let isoModalDiaAberto = null; // iso do dia com o modal de detalhes aberto no momento (p/ re-renderizar após marcar extra/missa)

  ouvirMissasNaGrade((lista) => {
    missasGradeAtual = new Set(lista.map((m) => `${m.data}_${m.hora}`));
    if (isoModalDiaAberto) abrirModalDiaAgendados(isoModalDiaAberto);
  });

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
    isoModalDiaAberto = iso;
    const doDia = agendamentosDoDia(iso).sort((a, b) => a.hora - b.hora);
    diaAgendadosTitulo.textContent = formatarDataComDiaSemana(iso);
    diaAgendadosConteudo.innerHTML = "";

    const porHora = new Map();
    doDia.forEach((a) => {
      if (!porHora.has(a.hora)) porHora.set(a.hora, []);
      porHora.get(a.hora).push(a);
    });

    // mostra todos os horários ativos do dia (não só os que já têm gente agendada), pra dar pra
    // marcar "Missa" também num horário livre
    const horasDoDia = horariosDisponiveisNoDia(diasHorariosAtual, iso);

    horasDoDia.forEach((hora) => {
      const pessoas = porHora.get(hora) || [];
      const chaveMissa = `${iso}_${hora}`;
      const ehMissa = missasGradeAtual.has(chaveMissa);

      const grupo = document.createElement("div");
      grupo.className = "grupo-horario-dia";

      const titulo = document.createElement("div");
      titulo.className = "grupo-horario-dia__titulo";
      titulo.innerHTML = `${formatarHora(hora)} ${pessoas.length ? `<span class="contagem-contatos">${pessoas.length}</span>` : ""} ${ehMissa ? '<span class="badge-missa">Missa</span>' : ""}`;

      const chipMissa = document.createElement("button");
      chipMissa.type = "button";
      chipMissa.className = "chip-missa" + (ehMissa ? " ativo" : "");
      chipMissa.textContent = ehMissa ? "Desmarcar Missa" : "Marcar como Missa";
      chipMissa.addEventListener("click", async () => {
        chipMissa.disabled = true;
        try {
          await definirMissaNaGrade(iso, hora, !ehMissa);
          abrirModalDiaAgendados(iso);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível atualizar. Tente novamente.");
          chipMissa.disabled = false;
        }
      });
      titulo.appendChild(chipMissa);
      grupo.appendChild(titulo);

      if (ehMissa) {
        const aviso = document.createElement("p");
        aviso.className = "horario-vazio-msg";
        aviso.textContent = "Sem adoração — horário de Missa.";
        grupo.appendChild(aviso);
      } else if (pessoas.length === 0) {
        const aviso = document.createElement("p");
        aviso.className = "horario-vazio-msg";
        aviso.textContent = "Horário livre — ninguém agendado.";
        grupo.appendChild(aviso);
      } else {
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

          const btnExtra = document.createElement("button");
          btnExtra.type = "button";
          btnExtra.className = "btn-extra-item" + (a.extra ? " ativo" : "");
          btnExtra.title = a.extra ? "Desmarcar como extra" : "Marcar como extra (fora do grupo habitual)";
          btnExtra.innerHTML = `<svg viewBox="0 0 24 24" fill="${a.extra ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.7 1.2 6.7L12 17.8l-5.8 3.1 1.2-6.7-4.9-4.7 6.6-.8Z"/></svg>`;
          btnExtra.addEventListener("click", async () => {
            btnExtra.disabled = true;
            try {
              await marcarAgendamentoExtra(a.id, !a.extra);
              abrirModalDiaAgendados(iso);
            } catch (err) {
              console.error(err);
              mostrarToast("Não foi possível atualizar. Tente novamente.");
              btnExtra.disabled = false;
            }
          });

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
          acoes.appendChild(btnExtra);
          acoes.appendChild(btnCancelar);
          item.appendChild(info);
          item.appendChild(acoes);
          listaEl.appendChild(item);
        });

        grupo.appendChild(listaEl);
      }

      diaAgendadosConteudo.appendChild(grupo);
    });

    abrirModal(modalDiaAgendados);
  }

  document.getElementById("fecharModalDiaAgendados").addEventListener("click", () => {
    fecharModal(modalDiaAgendados);
    isoModalDiaAberto = null;
  });

  /* ---- exportar planilha (Excel) ---- */
  async function exportarAgendadosParaExcel(lista) {
    if (!diasHorariosAtual.dataInicio || !diasHorariosAtual.dataFim) {
      mostrarToast("Configure o período da adoração antes de exportar.");
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Arautos do Evangelho";
    wb.created = new Date();

    adicionarAbaListaCompleta(wb, lista);

    const porDataHora = new Map();
    lista.forEach((a) => {
      const chave = `${a.data}_${a.hora}`;
      if (!porDataHora.has(chave)) porDataHora.set(chave, []);
      porDataHora.get(chave).push(a);
    });

    const blocosDeSemana = gerarBlocosDeSemana(diasHorariosAtual.dataInicio, diasHorariosAtual.dataFim);
    blocosDeSemana.forEach((dias, indiceSemana) => {
      adicionarAbasDeSemana(wb, dias, porDataHora, missasGradeAtual, diasHorariosAtual, indiceSemana);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const hoje = new Date();
    const carimbo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    a.download = `grade-adoracao-arautos-${carimbo}.xlsx`;
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
      isoModalDiaAberto = null;
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
      const novaSenha = campo.value.trim();
      await salvarSenhaAdmin(novaSenha);
      // mantém este aparelho logado com a nova senha (só os outros precisarão digitá-la de novo)
      localStorage.setItem(CHAVE_SENHA_ADMIN_LOCAL, novaSenha);
      campo.value = "";
      mostrarToast("Senha alterada com sucesso!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível alterar a senha.");
    }
  });
}
