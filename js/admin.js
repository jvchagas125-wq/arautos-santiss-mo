import { inicializarNavegacao, aplicarLogo, mostrarToast, abrirModal, fecharModal,
  formatarDataComDiaSemana, formatarDataBR, formatarHora, vincularOlhoSenha, criarCalendario, criarSeletorHora,
  isoParaData, dataParaIso, horariosDisponiveisNoDia, horasDeMissaNoDia, gerarBlocosDeSemana,
  MESES, CATEGORIAS_INTENCAO, PLACEHOLDERS_INTENCAO, INTENCAO_FIXA_ALMA, DIAS_SEMANA_COMPLETO, linkificarTexto, ORDEM_PAGINAS,
  capitalizarNome, reduzirNomeParaExibicao, vincularMascaraTelefone, telefoneValido, telefoneParaDigits } from "./utils.js";
import {
  obterConfiguracoesGerais, salvarConfiguracoesGerais,
  obterFrases, salvarFrases,
  obterDiasHorarios, salvarDiasHorarios, ouvirDiasHorarios,
  obterSenhaAdmin, salvarSenhaAdmin,
  ouvirTodosAgendamentos, ouvirTodosUsuarios, obterUsuario, cadastrarOuAtualizarUsuario, editarUsuario,
  atualizarNomeUsuario, atualizarNomeEmAgendamentosDoTelefone,
  excluirUsuario, cancelarAgendamento, limparAgendamentosCancelados,
  marcarAgendamentoExtra,
  obterConfigIntencoes, salvarConfigIntencoes, ouvirTodasIntencoes, excluirListaIntencoes,
  obterConfigEnvioIntencoes, salvarConfigEnvioIntencoes, ouvirEnviosIntencoes,
  criarIntencao, atualizarIntencao, excluirIntencao,
  ouvirAvisos, criarAviso, atualizarAviso, excluirAviso, trocarOrdemAvisos,
  ouvirBanners, criarBanner, atualizarBanner, excluirBanner, trocarOrdemBanners
} from "./dados.js";
import { SENHA_ADMIN_PADRAO } from "./firebase-config.js";
import { extrairTextosCategoria, construirPdfIntencoes, nomeArquivoPdf, rotuloListaIntencao } from "./pdf-intencoes.js";

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
  configurarInfoContato();
  configurarContatos();
  configurarBanners();
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

  const modalApagarIntencaoAdmin = document.getElementById("modalApagarIntencaoAdmin");
  let intencaoParaExcluir = null; // id da intenção individual a apagar

  // Guarda o último conjunto de intenções recebido do Firestore (pra poder re-renderizar na
  // hora, sem esperar outro evento, quando só o ESTADO da tela muda — ex.: abrir/fechar um
  // quadro, entrar/sair do modo de editar a lista de nomes de "Por alma"/"Aniversários").
  let ultimasEntradas = [];
  let enviosPorLista = {}; // histórico de envios por e-mail: "data|hora" -> { status, enviadoEm, ... }
  const quadrosAbertos = new Set(); // chaves "data|hora" dos quadros expandidos no momento
  const categoriasEmEdicaoDeLista = new Set(); // chaves "data|hora|categoria" com a lista em modo de edição

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
    return rotuloListaIntencao(dataMissa, horaMissa);
  }

  // Gera um PDF com as intenções de uma lista específica, organizadas por categoria (mesma
  // ordem/agrupamento exibido na tela), pronto pra imprimir e levar pra missa. A montagem em si
  // (o desenho do PDF) é compartilhada com o envio automático por e-mail — ver js/pdf-intencoes.js.
  async function gerarPdfIntencoes(rotulo, itens) {
    const docPdf = await construirPdfIntencoes(rotulo, itens);
    docPdf.save(nomeArquivoPdf(rotulo));
  }

  const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>`;
  const ICONE_LIXEIRA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;

  function criarBotaoIcone(classeExtra, titulo, iconeSvg) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `intencao-item__btn ${classeExtra || ""}`.trim();
    btn.title = titulo;
    btn.innerHTML = iconeSvg;
    return btn;
  }

  function pedirExclusaoIntencao(id) {
    intencaoParaExcluir = id;
    abrirModal(modalApagarIntencaoAdmin);
  }

  function rerenderizar() {
    renderizarQuadros(ultimasEntradas);
  }

  // ---- uma linha editável por intenção, usada dentro do modo "editar esta lista" ----
  function criarLinhaEdicao(chaveCategoria, it) {
    const item = document.createElement("div");
    item.className = "intencao-item";

    const campo = chaveCategoria === "gracas" ? document.createElement("textarea") : document.createElement("input");
    if (chaveCategoria === "gracas") campo.rows = 2;
    else campo.type = "text";
    campo.className = "intencao-nome-input";
    campo.value = it.texto || "";
    campo.dataset.id = it.id;
    item.appendChild(campo);

    const acoes = document.createElement("span");
    acoes.className = "intencao-item__acoes";
    const btnApagar = criarBotaoIcone("intencao-item__btn--apagar", "Apagar", ICONE_LIXEIRA);
    btnApagar.addEventListener("click", () => pedirExclusaoIntencao(it.id));
    acoes.appendChild(btnApagar);
    item.appendChild(acoes);
    return item;
  }

  // ---- botões "Salvar"/"Cancelar" do modo de edição — um só salvamento pra lista inteira,
  // e a tela atualiza na hora assim que salva (o onSnapshot do Firestore cuida disso). ----
  function criarAcoesSalvarLista(chaveCompleta, doGrupo, listaEl) {
    const linha = document.createElement("div");
    linha.className = "intencao-item__editar-acoes intencao-item__editar-acoes--lista";

    const btnSalvar = document.createElement("button");
    btnSalvar.type = "button";
    btnSalvar.className = "btn btn-dourado btn-pequeno";
    btnSalvar.textContent = "Salvar";
    btnSalvar.addEventListener("click", async () => {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
      const alteracoes = [];
      listaEl.querySelectorAll("[data-id]").forEach((campo) => {
        const id = campo.dataset.id;
        const original = doGrupo.find((it) => it.id === id);
        const novoValor = campo.value.trim();
        if (novoValor && original && novoValor !== (original.texto || "")) {
          alteracoes.push(atualizarIntencao(id, { texto: novoValor }));
        }
      });
      try {
        await Promise.all(alteracoes);
        categoriasEmEdicaoDeLista.delete(chaveCompleta);
        rerenderizar();
        mostrarToast(alteracoes.length ? "Lista atualizada!" : "Nenhuma alteração para salvar.");
      } catch (err) {
        console.error(err);
        mostrarToast("Não foi possível salvar. Tente novamente.");
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
      }
    });

    const btnCancelar = document.createElement("button");
    btnCancelar.type = "button";
    btnCancelar.className = "btn btn-contorno btn-pequeno";
    btnCancelar.textContent = "Cancelar";
    btnCancelar.addEventListener("click", () => {
      categoriasEmEdicaoDeLista.delete(chaveCompleta);
      rerenderizar();
    });

    linha.appendChild(btnSalvar);
    linha.appendChild(btnCancelar);
    return linha;
  }

  // ---- formulário de incluir uma nova intenção (o padre recebeu por telefone, por exemplo) ----
  function criarFormAdicionar(chaveCategoria, dataMissa, horaMissa) {
    const form = document.createElement("form");
    form.className = "categoria-intencao__form";

    // Sempre <textarea> (mesmo pras categorias de "um nome por vez") — com um <input> de uma
    // linha só, o placeholder é cortado quando não cabe no campo, e a pessoa nunca vê a frase
    // inteira. Numa textarea o placeholder quebra em várias linhas, então sempre aparece
    // completo, mesmo em telas estreitas. Como a pessoa está acostumada a apertar Enter pra
    // adicionar (era o comportamento do <input>), o Enter (sem Shift) continua enviando o
    // formulário — só quebra linha com Shift+Enter.
    const ehGracas = chaveCategoria === "gracas";
    const campoTexto = document.createElement("textarea");
    campoTexto.rows = ehGracas ? 2 : 4;
    campoTexto.required = true;
    campoTexto.placeholder = PLACEHOLDERS_INTENCAO[chaveCategoria] || "";
    form.appendChild(campoTexto);

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "btn btn-contorno btn-pequeno";
    btn.textContent = "Adicionar";
    form.appendChild(btn);

    if (!ehGracas) {
      campoTexto.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const texto = campoTexto.value.trim();
      if (!texto) return;
      btn.disabled = true;
      btn.textContent = "Adicionando...";
      try {
        await criarIntencao({ dataMissa, horaMissa, categoria: chaveCategoria, texto, nome: "", telefoneDigits: "" });
        campoTexto.value = "";
        mostrarToast("Intenção adicionada!");
      } catch (err) {
        console.error(err);
        mostrarToast("Não foi possível adicionar. Tente novamente.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Adicionar";
      }
    });

    return form;
  }

  function criarBlocoCategoria(chaveCategoria, rotuloCategoria, doGrupo, dataMissa, horaMissa, chaveQuadro) {
    const bloco = document.createElement("div");
    bloco.className = "grupo-horario-dia";
    const chaveCompleta = `${chaveQuadro}|${chaveCategoria}`;
    const emEdicao = categoriasEmEdicaoDeLista.has(chaveCompleta);

    const linhaTitulo = document.createElement("div");
    linhaTitulo.className = "grupo-horario-dia__titulo";
    const spanTitulo = document.createElement("span");
    spanTitulo.className = "grupo-horario-dia__titulo-texto";
    spanTitulo.textContent = `${rotuloCategoria} (${doGrupo.length})`;
    linhaTitulo.appendChild(spanTitulo);

    if (doGrupo.length > 0 && !emEdicao) {
      const btnEditarLista = criarBotaoIcone("intencao-item__btn--editar", "Editar esta lista", ICONE_LAPIS);
      btnEditarLista.addEventListener("click", () => {
        categoriasEmEdicaoDeLista.add(chaveCompleta);
        rerenderizar();
      });
      linhaTitulo.appendChild(btnEditarLista);
    }
    bloco.appendChild(linhaTitulo);

    const lista = document.createElement("div");
    lista.className = "categoria-intencao__lista";

    // "Por alma" sempre tem pelo menos a intenção fixa (ver INTENCAO_FIXA_ALMA em utils.js) —
    // nunca mostra o estado "vazio", mesmo sem ninguém ter colocado nome nenhum ainda.
    const ehAlma = chaveCategoria === "alma";

    if (doGrupo.length === 0 && !ehAlma) {
      const vazio = document.createElement("p");
      vazio.className = "categoria-intencao__vazio";
      vazio.textContent = "Nenhuma intenção nesta categoria ainda.";
      lista.appendChild(vazio);
    } else if (emEdicao) {
      doGrupo.forEach((it) => lista.appendChild(criarLinhaEdicao(chaveCategoria, it)));
    } else {
      const paragrafo = document.createElement("p");
      paragrafo.className = "intencao-nomes-paragrafo";
      const textoReal = extrairTextosCategoria(doGrupo);
      // a intenção fixa nunca se mistura com o "e" dos nomes reais — entra como uma frase à
      // parte, sempre por último, pra não parecer que alguém "escreveu" ela.
      paragrafo.textContent = ehAlma ? [textoReal, INTENCAO_FIXA_ALMA].filter(Boolean).join(" ") : textoReal;
      lista.appendChild(paragrafo);
    }
    bloco.appendChild(lista);
    if (emEdicao) bloco.appendChild(criarAcoesSalvarLista(chaveCompleta, doGrupo, lista));
    bloco.appendChild(criarFormAdicionar(chaveCategoria, dataMissa, horaMissa));

    return bloco;
  }

  function renderizarQuadros(entradas) {
    ultimasEntradas = entradas;
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
      const estaAberto = quadrosAbertos.has(chave);

      const quadro = document.createElement("div");
      quadro.className = "quadro-intencao";
      quadro.classList.toggle("aberto", estaAberto);

      const cabecalho = document.createElement("div");
      cabecalho.className = "quadro-intencao__cabecalho";
      cabecalho.innerHTML = `
        <svg class="quadro-intencao__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        <span class="quadro-intencao__titulo">${rotulo} — ${itens.length} ${itens.length === 1 ? "intenção" : "intenções"}</span>
        ${seloDeEnvio(enviosPorLista[chave])}
        <button type="button" class="quadro-intencao__enviar" title="Enviar esta lista por e-mail agora">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
        </button>
        <button type="button" class="quadro-intencao__pdf" title="Extrair PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
        </button>
        <button type="button" class="quadro-intencao__lixeira" title="Apagar lista">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
        </button>
      `;

      const corpo = document.createElement("div");
      corpo.className = "quadro-intencao__corpo";
      corpo.classList.toggle("oculto", !estaAberto);
      CATEGORIAS_INTENCAO.forEach(({ chave: chaveCategoria, rotulo: rotuloCategoria }) => {
        const doGrupo = itens.filter((it) => it.categoria === chaveCategoria);
        corpo.appendChild(criarBlocoCategoria(chaveCategoria, rotuloCategoria, doGrupo, dataMissa, horaMissa, chave));
      });

      cabecalho.addEventListener("click", () => {
        if (quadrosAbertos.has(chave)) quadrosAbertos.delete(chave);
        else quadrosAbertos.add(chave);
        quadro.classList.toggle("aberto");
        corpo.classList.toggle("oculto");
      });
      cabecalho.querySelector(".quadro-intencao__pdf").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (typeof window.jspdf === "undefined") {
          mostrarToast("Não foi possível carregar o gerador de PDF. Verifique sua conexão.");
          return;
        }
        try {
          await gerarPdfIntencoes(rotulo, itens);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível gerar o PDF. Tente novamente.");
        }
      });
      cabecalho.querySelector(".quadro-intencao__enviar").addEventListener("click", async (e) => {
        e.stopPropagation();
        const btnEnviar = e.currentTarget;
        btnEnviar.disabled = true;
        try {
          const r = await chamarApiEnvio({ acao: "enviar", dataMissa, horaMissa });
          mostrarToast(`Lista enviada por e-mail para ${r.destinatarios.length} ${r.destinatarios.length === 1 ? "endereço" : "endereços"}.`);
        } catch (err) {
          console.error(err);
          mostrarToast(err.message || "Não foi possível enviar o e-mail.");
        } finally {
          btnEnviar.disabled = false;
        }
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
  ouvirEnviosIntencoes((envios) => {
    enviosPorLista = envios;
    renderizarQuadros(ultimasEntradas);
    renderizarHistoricoEnvios(envios);
  });

  /* ---------- Envio automático por e-mail ---------- */
  const formEnvioEmail = document.getElementById("formEnvioEmail");
  const envioAtivo = document.getElementById("envioAtivo");
  const envioVazias = document.getElementById("envioVazias");
  const envioListaEmails = document.getElementById("envioListaEmails");
  const REGEX_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

  function seloDeEnvio(envio) {
    if (!envio) return "";
    if (envio.status === "enviado" && !envio.semEnvio) return `<span class="quadro-intencao__selo" title="Enviada por e-mail">✓ e-mail enviado</span>`;
    if (envio.status === "erro") return `<span class="quadro-intencao__selo quadro-intencao__selo--erro" title="O envio automático falhou; o sistema tenta de novo sozinho.">falha no envio</span>`;
    return "";
  }

  // Chama a função do servidor (api/enviar-listas.js) usando a senha do painel como prova de que é o admin.
  async function chamarApiEnvio(corpo) {
    let senha = "";
    try { senha = localStorage.getItem(CHAVE_SENHA_ADMIN_LOCAL) || ""; } catch { /* sem acesso ao armazenamento */ }
    let resposta;
    try {
      resposta = await fetch("/api/enviar-listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, senha })
      });
    } catch {
      throw new Error("Sem conexão com o servidor. Verifique a internet e tente de novo.");
    }
    let dados = null;
    try { dados = await resposta.json(); } catch { /* resposta sem JSON */ }
    if (!resposta.ok || !dados?.ok) {
      if (resposta.status === 404) throw new Error("O envio por e-mail ainda não foi ativado no site (falta publicar a atualização).");
      throw new Error(dados?.erro || "Não foi possível enviar o e-mail.");
    }
    return dados;
  }

  function criarLinhaEmail(valor = "") {
    const linha = document.createElement("div");
    linha.className = "envio-email-linha";
    const input = document.createElement("input");
    input.type = "email";
    input.placeholder = "nome@exemplo.com";
    input.autocomplete = "off";
    input.value = valor;
    input.addEventListener("input", () => input.classList.remove("invalido"));
    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "envio-email-remover";
    remover.title = "Remover e-mail";
    remover.textContent = "×";
    remover.addEventListener("click", () => linha.remove());
    linha.appendChild(input);
    linha.appendChild(remover);
    envioListaEmails.appendChild(linha);
    return input;
  }
  document.getElementById("btnAdicionarEmail").addEventListener("click", () => criarLinhaEmail().focus());

  // lê os e-mails digitados; marca em vermelho os inválidos e devolve null se houver algum
  function lerEmailsDoFormulario() {
    const emails = [];
    let todosValidos = true;
    envioListaEmails.querySelectorAll("input").forEach((input) => {
      const v = input.value.trim();
      if (!v) return;
      if (!REGEX_EMAIL.test(v)) { input.classList.add("invalido"); todosValidos = false; return; }
      if (!emails.some((e) => e.toLowerCase() === v.toLowerCase())) emails.push(v);
    });
    return todosValidos ? emails : null;
  }

  obterConfigEnvioIntencoes().then((cfg) => {
    envioAtivo.checked = cfg.ativo;
    envioVazias.checked = cfg.enviarVazias;
    envioListaEmails.innerHTML = "";
    (cfg.emails.length ? cfg.emails : [""]).forEach((e) => criarLinhaEmail(e));
  }).catch((err) => {
    console.error(err);
    criarLinhaEmail();
  });

  formEnvioEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emails = lerEmailsDoFormulario();
    if (emails === null) { mostrarToast("Confira os e-mails marcados em vermelho."); return; }
    if (envioAtivo.checked && emails.length === 0) { mostrarToast("Cadastre pelo menos um e-mail para ligar o envio automático."); return; }
    const btn = document.getElementById("btnSalvarEnvioEmail");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarConfigEnvioIntencoes({ ativo: envioAtivo.checked, emails, enviarVazias: envioVazias.checked });
      envioListaEmails.innerHTML = "";
      (emails.length ? emails : [""]).forEach((v) => criarLinhaEmail(v));
      mostrarToast(envioAtivo.checked ? "Salvo! O envio automático está ligado." : "Salvo! O envio automático está desligado.");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar";
    }
  });

  document.getElementById("btnTesteEmail").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const emails = lerEmailsDoFormulario();
    if (emails === null) { mostrarToast("Confira os e-mails marcados em vermelho."); return; }
    if (emails.length === 0) { mostrarToast("Cadastre pelo menos um e-mail antes de testar."); return; }
    btn.disabled = true;
    btn.textContent = "Enviando teste...";
    try {
      // o teste usa os e-mails SALVOS no servidor — salva antes, pra testar exatamente o que está na tela
      await salvarConfigEnvioIntencoes({ ativo: envioAtivo.checked, emails, enviarVazias: envioVazias.checked });
      const r = await chamarApiEnvio({ acao: "teste" });
      mostrarToast(`E-mail de teste enviado para ${r.destinatarios.join(", ")}.`);
    } catch (err) {
      console.error(err);
      mostrarToast(err.message || "Não foi possível enviar o teste.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Enviar e-mail de teste";
    }
  });

  function renderizarHistoricoEnvios(envios) {
    const lista = document.getElementById("listaEnvios");
    const aviso = document.getElementById("avisoSemEnvios");
    const chaves = Object.keys(envios)
      .filter((k) => !(envios[k].status === "enviado" && envios[k].semEnvio))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 8);
    aviso.classList.toggle("oculto", chaves.length > 0);
    lista.innerHTML = "";
    chaves.forEach((chave) => {
      const envio = envios[chave];
      const item = document.createElement("div");
      item.className = "envio-historico__item" + (envio.status === "erro" ? " envio-historico__item--erro" : "");
      const nome = document.createElement("span");
      nome.textContent = rotuloListaIntencao(envio.dataMissa, envio.horaMissa);
      const estado = document.createElement("span");
      estado.className = "envio-historico__estado";
      if (envio.status === "enviado") {
        const quando = envio.enviadoEm ? new Date(envio.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
        estado.textContent = `✓ enviado ${quando}${envio.manual ? " (manual)" : ""}`;
      } else if (envio.status === "erro") {
        estado.textContent = "falhou — tentando de novo";
        item.title = envio.erro || "";
      } else {
        estado.textContent = "enviando…";
      }
      item.appendChild(nome);
      item.appendChild(estado);
      lista.appendChild(item);
    });
  }

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

  document.getElementById("fecharModalApagarIntencaoAdmin").addEventListener("click", () => fecharModal(modalApagarIntencaoAdmin));
  document.getElementById("btnVoltarApagarIntencaoAdmin").addEventListener("click", () => fecharModal(modalApagarIntencaoAdmin));
  document.getElementById("btnConfirmarApagarIntencaoAdmin").addEventListener("click", async (e) => {
    if (!intencaoParaExcluir) return;
    const idParaApagar = intencaoParaExcluir;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Apagando...";
    try {
      await excluirIntencao(idParaApagar);
      mostrarToast("Intenção apagada.");
      fecharModal(modalApagarIntencaoAdmin);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível apagar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Apagar";
    }
  });
}

/* ---------------- Avisos ---------------- */

// Upload de imagem pro Cloudinary (preset "unsigned", não precisa de chave secreta no
// front-end). Retorna a URL segura (https) da imagem já hospedada.
const CLOUDINARY_CLOUD_NAME = "dcvhqnr1c";
const CLOUDINARY_UPLOAD_PRESET = "arautos-adoracao";

async function enviarImagemParaCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const resposta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });
  if (!resposta.ok) throw new Error("Falha no upload da imagem para o Cloudinary");
  const dados = await resposta.json();
  return dados.secure_url;
}

function configurarAvisos() {
  const formNovo = document.getElementById("formNovoAviso");
  const campoTitulo = document.getElementById("campoAvisoTitulo");
  const campoTexto = document.getElementById("campoAvisoTexto");
  const campoImagem = document.getElementById("campoAvisoImagem");
  const previewImagemNovo = document.getElementById("previewAvisoImagem");
  const listaAvisosAdmin = document.getElementById("listaAvisosAdmin");
  const avisoSemAvisos = document.getElementById("avisoSemAvisos");

  const modalExcluirAviso = document.getElementById("modalExcluirAviso");
  const nomeExcluirAviso = document.getElementById("nomeExcluirAviso");
  let avisoParaExcluir = null;

  campoImagem.addEventListener("change", () => {
    const file = campoImagem.files[0];
    if (!file) { previewImagemNovo.classList.add("oculto"); return; }
    previewImagemNovo.src = URL.createObjectURL(file);
    previewImagemNovo.classList.remove("oculto");
  });

  formNovo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = formNovo.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      let imagemUrl = "";
      const file = campoImagem.files[0];
      if (file) {
        btn.textContent = "Enviando imagem...";
        imagemUrl = await enviarImagemParaCloudinary(file);
      }
      btn.textContent = "Publicando...";
      await criarAviso({
        titulo: campoTitulo.value.trim(),
        texto: campoTexto.value.trim(),
        imagemUrl
      });
      formNovo.reset();
      previewImagemNovo.classList.add("oculto");
      mostrarToast("Aviso publicado!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível publicar. Verifique a imagem e tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Publicar aviso";
    }
  });

  function renderizarAvisos(lista) {
    listaAvisosAdmin.innerHTML = "";
    avisoSemAvisos.classList.toggle("oculto", lista.length > 0);

    lista.forEach((aviso, indice) => {
      const card = document.createElement("div");
      card.className = "cartao-aviso-admin";
      card.innerHTML = `
        ${aviso.imagemUrl ? `<img src="${aviso.imagemUrl}" alt="" class="cartao-aviso-admin__img" />` : ""}
        <div class="cartao-aviso-admin__corpo">
          <div class="cartao-aviso-admin__titulo">${aviso.titulo}</div>
          <p class="cartao-aviso-admin__texto"></p>
          <div class="cartao-aviso-admin__acoes">
            <button type="button" class="btn btn-contorno btn-pequeno btn-subir-aviso" title="Mover para cima" ${indice === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn btn-contorno btn-pequeno btn-descer-aviso" title="Mover para baixo" ${indice === lista.length - 1 ? "disabled" : ""}>↓</button>
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
              <label>Trocar imagem (opcional)</label>
              <input type="file" class="campo-edit-imagem" accept="image/*" />
              ${aviso.imagemUrl ? `<img src="${aviso.imagemUrl}" alt="" class="cartao-aviso-admin__img" style="margin-top:8px; max-height:100px; border-radius:8px;" />` : ""}
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
      const btnSubir = card.querySelector(".btn-subir-aviso");
      const btnDescer = card.querySelector(".btn-descer-aviso");

      btnSubir.addEventListener("click", async () => {
        if (indice === 0) return;
        btnSubir.disabled = true;
        btnDescer.disabled = true;
        try {
          await trocarOrdemAvisos(aviso, lista[indice - 1]);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível reordenar. Tente novamente.");
        }
      });
      btnDescer.addEventListener("click", async () => {
        if (indice === lista.length - 1) return;
        btnSubir.disabled = true;
        btnDescer.disabled = true;
        try {
          await trocarOrdemAvisos(aviso, lista[indice + 1]);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível reordenar. Tente novamente.");
        }
      });

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
        try {
          const dadosSalvar = {
            titulo: formEdicao.querySelector(".campo-edit-titulo").value.trim(),
            texto: formEdicao.querySelector(".campo-edit-texto").value.trim()
          };
          const fileEdicao = formEdicao.querySelector(".campo-edit-imagem").files[0];
          if (fileEdicao) {
            btnSalvar.textContent = "Enviando imagem...";
            dadosSalvar.imagemUrl = await enviarImagemParaCloudinary(fileEdicao);
          }
          btnSalvar.textContent = "Salvando...";
          await atualizarAviso(aviso.id, dadosSalvar);
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
  missa: "FFFFD700",      // horário marcado como Missa no painel (amarelo forte, pra destacar)
  bloqueado: "FF1A1A1A"   // hora fora do período configurado (antes/depois do limite do dia)
};

// Contorno fino preto usado para marcar a divisão entre colunas (dias) e linhas (horas) na grade.
const BORDA_GRADE = { style: "thin", color: { argb: "FF000000" } };
const CONTORNO_GRADE = { top: BORDA_GRADE, left: BORDA_GRADE, bottom: BORDA_GRADE, right: BORDA_GRADE };

function corDoGrupoPorHora(hora) {
  if ((hora >= 0 && hora <= 6) || (hora >= 21 && hora <= 23)) return CORES_EXPORT.nicodemos;
  if (hora >= 7 && hora <= 11) return CORES_EXPORT.arautos;
  return CORES_EXPORT.madalena; // 12h-20h
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
// "extra", Missa (calculada automaticamente a partir dos limites de início/término) e horários
// bloqueados/fora do período configurado.
function adicionarAbasDeSemana(wb, dias, porDataHora, diasHorariosAtual, indiceSemana) {
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
  headerRow.getCell(1).border = CONTORNO_GRADE;
  dias.forEach((iso, i) => {
    const nomeDia = DIAS_SEMANA_COMPLETO[isoParaData(iso).getDay()].toLowerCase();
    const cell = headerRow.getCell(2 + i);
    cell.value = `${nomeDia} ${formatarDataBR(iso).slice(0, 5)}`;
    cell.font = { bold: true, color: { argb: CORES_EXPORT.cabecalhoTexto } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES_EXPORT.cabecalhoBg } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = CONTORNO_GRADE;
  });
  headerRow.height = 24;

  const horasAtivasPorDia = new Map(dias.map((iso) => [iso, new Set(horariosDisponiveisNoDia(diasHorariosAtual, iso))]));
  const horasDeMissaPorDia = new Map(dias.map((iso) => [iso, horasDeMissaNoDia(diasHorariosAtual, iso)]));

  for (let hora = 0; hora < 24; hora++) {
    const row = ws.getRow(3 + hora);
    const celHora = row.getCell(1);
    celHora.value = `${String(hora).padStart(2, "0")}h`;
    celHora.font = { bold: true };
    celHora.alignment = { vertical: "middle", horizontal: "center" };
    celHora.border = CONTORNO_GRADE;

    dias.forEach((iso, i) => {
      const cell = row.getCell(2 + i);
      const horasAtivasDoDia = horasAtivasPorDia.get(iso);
      const horasDeMissa = horasDeMissaPorDia.get(iso);
      const chave = `${iso}_${hora}`;
      const pessoas = porDataHora.get(chave) || [];

      if (horasDeMissa.has(hora)) {
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
      cell.border = CONTORNO_GRADE;
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
  let isoModalDiaAberto = null; // iso do dia com o modal de detalhes aberto no momento (p/ re-renderizar após marcar extra)

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

    // mostra todos os horários ativos do dia (não só os que já têm gente agendada)
    const horasDoDia = horariosDisponiveisNoDia(diasHorariosAtual, iso);

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
      adicionarAbasDeSemana(wb, dias, porDataHora, diasHorariosAtual, indiceSemana);
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

/* ---------------- Informações de contato do site público (endereço, telefone, Instagram) ---------------- */
function configurarInfoContato() {
  const form = document.getElementById("formInfoContato");
  const campoTelefoneTexto = document.getElementById("campoContatoTelefoneTexto");
  const campoTelefoneDigits = document.getElementById("campoContatoTelefoneDigits");
  const campoEnderecoTexto = document.getElementById("campoContatoEnderecoTexto");
  const campoEnderecoObs = document.getElementById("campoContatoEnderecoObs");
  const campoEnderecoLink = document.getElementById("campoContatoEnderecoLink");
  const campoInstagramTexto = document.getElementById("campoContatoInstagramTexto");
  const campoInstagramLink = document.getElementById("campoContatoInstagramLink");

  /* ---------- Acordeão: abrir/fechar as informações de contato do site público ---------- */
  const quadroInfoContato = document.getElementById("quadroInfoContato");
  const corpoInfoContato = document.getElementById("corpoInfoContato");
  document.getElementById("cabecalhoInfoContato").addEventListener("click", () => {
    quadroInfoContato.classList.toggle("aberto");
    corpoInfoContato.classList.toggle("oculto");
  });

  obterConfiguracoesGerais().then((config) => {
    campoTelefoneTexto.value = config.contatoTelefoneTexto || "";
    campoTelefoneDigits.value = config.contatoTelefoneDigits || "";
    campoEnderecoTexto.value = config.contatoEnderecoTexto || "";
    campoEnderecoObs.value = config.contatoEnderecoObs || "";
    campoEnderecoLink.value = config.contatoEnderecoLink || "";
    campoInstagramTexto.value = config.contatoInstagramTexto || "";
    campoInstagramLink.value = config.contatoInstagramLink || "";
  }).catch((err) => console.error(err));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await salvarConfiguracoesGerais({
        contatoTelefoneTexto: campoTelefoneTexto.value.trim(),
        contatoTelefoneDigits: campoTelefoneDigits.value.replace(/\D/g, ""),
        contatoEnderecoTexto: campoEnderecoTexto.value.trim(),
        contatoEnderecoObs: campoEnderecoObs.value.trim(),
        contatoEnderecoLink: campoEnderecoLink.value.trim(),
        contatoInstagramTexto: campoInstagramTexto.value.trim(),
        contatoInstagramLink: campoInstagramLink.value.trim()
      });
      mostrarToast("Informações de contato atualizadas.");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar agora. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar informações de contato";
    }
  });
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
          <button type="button" class="card-contato__editar" data-tel="${escaparHtml(c.telefoneDigits)}" data-nome="${escaparHtml(c.nome)}" data-tel-formatado="${escaparHtml(c.telefone)}" title="Editar cadastro">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
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

    contagemEl.textContent = `${filtrados.length}`;

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

    lista.querySelectorAll(".card-contato__editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        abrirEdicao(btn.dataset.tel, btn.dataset.nome, btn.dataset.telFormatado);
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
      // se a pessoa removida estava com o modal de edição aberto, fecha o modal
      if (telefoneParaRemover === telefoneDigitsEmEdicao) fecharEdicao();
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

  /* ---------- Acordeão: abrir/fechar a lista de pessoas cadastradas ---------- */
  const quadroContatos = document.getElementById("quadroContatos");
  const corpoContatos = document.getElementById("corpoContatos");
  document.getElementById("cabecalhoContatos").addEventListener("click", () => {
    quadroContatos.classList.toggle("aberto");
    corpoContatos.classList.toggle("oculto");
  });

  /* ---------- Formulário: cadastrar nova pessoa ---------- */
  const formContato = document.getElementById("formContato");
  const campoNomeContato = document.getElementById("campoNomeContato");
  const campoTelefoneContato = document.getElementById("campoTelefoneContato");
  const btnSalvarContato = document.getElementById("btnSalvarContato");

  vincularMascaraTelefone(campoTelefoneContato);
  campoNomeContato.addEventListener("blur", () => {
    if (campoNomeContato.value.trim()) campoNomeContato.value = capitalizarNome(campoNomeContato.value.trim());
  });

  formContato.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nomeDigitado = capitalizarNome(campoNomeContato.value.trim());
    if (nomeDigitado.split(" ").filter(Boolean).length < 2) {
      mostrarToast("Digite o nome completo da pessoa.");
      campoNomeContato.focus();
      return;
    }
    // guarda só "nome + primeiro sobrenome" — evita nomes grandes demais nos quadrados da grade
    const nome = reduzirNomeParaExibicao(nomeDigitado);
    const telefoneFormatado = campoTelefoneContato.value.trim();
    if (!telefoneValido(telefoneFormatado)) {
      mostrarToast("Digite um telefone válido, ex: (11) 91234-5678.");
      campoTelefoneContato.focus();
      return;
    }
    const telefoneDigits = telefoneParaDigits(telefoneFormatado);

    btnSalvarContato.disabled = true;
    btnSalvarContato.textContent = "Cadastrando...";
    try {
      const existente = await obterUsuario(telefoneDigits);
      if (existente && existente.nome) {
        mostrarToast(`Esse telefone já está cadastrado para ${existente.nome}. Edite o cadastro existente na lista.`);
        return;
      }
      await cadastrarOuAtualizarUsuario(telefoneDigits, nome, telefoneFormatado);
      mostrarToast("Pessoa cadastrada com sucesso!");
      formContato.reset();
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar o cadastro. Verifique sua conexão.");
    } finally {
      btnSalvarContato.disabled = false;
      btnSalvarContato.textContent = "Cadastrar";
    }
  });

  /* ---------- Padronizar nomes de todos os cadastros (nome + 1º sobrenome) ---------- */
  const btnPadronizarNomes = document.getElementById("btnPadronizarNomes");
  const modalPadronizarNomes = document.getElementById("modalPadronizarNomes");
  const textoPadronizarNomes = document.getElementById("textoPadronizarNomes");
  const btnCancelarPadronizarNomes = document.getElementById("btnCancelarPadronizarNomes");
  const btnConfirmarPadronizarNomes = document.getElementById("btnConfirmarPadronizarNomes");
  const fecharModalPadronizarNomes = document.getElementById("fecharModalPadronizarNomes");
  let candidatosPadronizacao = [];

  btnPadronizarNomes.addEventListener("click", () => {
    candidatosPadronizacao = todosContatos
      .map((c) => ({ ...c, nomeNovo: reduzirNomeParaExibicao(c.nome || "") }))
      .filter((c) => c.nomeNovo && c.nomeNovo !== c.nome);

    if (candidatosPadronizacao.length === 0) {
      mostrarToast("Todos os nomes já estão no formato nome + sobrenome.");
      return;
    }
    const qtd = candidatosPadronizacao.length;
    textoPadronizarNomes.textContent =
      `${qtd} ${qtd === 1 ? "cadastro vai ter o nome reduzido" : "cadastros vão ter o nome reduzido"} ` +
      `para só o primeiro nome e o primeiro sobrenome (ex.: "${candidatosPadronizacao[0].nome}" → "${candidatosPadronizacao[0].nomeNovo}"). Deseja continuar?`;
    abrirModal(modalPadronizarNomes);
  });

  function fecharPadronizarNomes() {
    fecharModal(modalPadronizarNomes);
  }
  btnCancelarPadronizarNomes.addEventListener("click", fecharPadronizarNomes);
  fecharModalPadronizarNomes.addEventListener("click", fecharPadronizarNomes);

  btnConfirmarPadronizarNomes.addEventListener("click", async () => {
    btnConfirmarPadronizarNomes.disabled = true;
    btnConfirmarPadronizarNomes.textContent = "Padronizando...";
    try {
      for (const c of candidatosPadronizacao) {
        await atualizarNomeUsuario(c.telefoneDigits, c.nomeNovo);
        await atualizarNomeEmAgendamentosDoTelefone(c.telefoneDigits, c.nomeNovo);
      }
      mostrarToast(`${candidatosPadronizacao.length} nome(s) padronizado(s) com sucesso!`);
      candidatosPadronizacao = [];
      fecharPadronizarNomes();
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível padronizar todos os nomes. Verifique sua conexão e tente novamente.");
    } finally {
      btnConfirmarPadronizarNomes.disabled = false;
      btnConfirmarPadronizarNomes.textContent = "Padronizar";
    }
  });

  /* ---------- Modal: editar pessoa cadastrada ---------- */
  const modalEditar = document.getElementById("modalEditarContato");
  const formEditarContato = document.getElementById("formEditarContato");
  const campoNomeEditar = document.getElementById("campoNomeEditarContato");
  const campoTelefoneEditar = document.getElementById("campoTelefoneEditarContato");
  const btnSalvarEditar = document.getElementById("btnSalvarEditarContato");
  const btnCancelarEditar = document.getElementById("btnCancelarEditarContato");
  const fecharModalEditar = document.getElementById("fecharModalEditarContato");
  let telefoneDigitsEmEdicao = null;

  vincularMascaraTelefone(campoTelefoneEditar);
  campoNomeEditar.addEventListener("blur", () => {
    if (campoNomeEditar.value.trim()) campoNomeEditar.value = capitalizarNome(campoNomeEditar.value.trim());
  });

  function abrirEdicao(telefoneDigits, nome, telefoneFormatado) {
    telefoneDigitsEmEdicao = telefoneDigits;
    campoNomeEditar.value = nome || "";
    campoTelefoneEditar.value = telefoneFormatado || "";
    abrirModal(modalEditar);
    setTimeout(() => campoNomeEditar.focus(), 300);
  }

  function fecharEdicao() {
    fecharModal(modalEditar);
    telefoneDigitsEmEdicao = null;
  }
  btnCancelarEditar.addEventListener("click", fecharEdicao);
  fecharModalEditar.addEventListener("click", fecharEdicao);

  formEditarContato.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!telefoneDigitsEmEdicao) return;

    const nomeDigitado = capitalizarNome(campoNomeEditar.value.trim());
    if (nomeDigitado.split(" ").filter(Boolean).length < 2) {
      mostrarToast("Digite o nome completo da pessoa.");
      campoNomeEditar.focus();
      return;
    }
    // guarda só "nome + primeiro sobrenome" — evita nomes grandes demais nos quadrados da grade
    const nome = reduzirNomeParaExibicao(nomeDigitado);
    const telefoneFormatado = campoTelefoneEditar.value.trim();
    if (!telefoneValido(telefoneFormatado)) {
      mostrarToast("Digite um telefone válido, ex: (11) 91234-5678.");
      campoTelefoneEditar.focus();
      return;
    }
    const telefoneDigits = telefoneParaDigits(telefoneFormatado);

    btnSalvarEditar.disabled = true;
    btnSalvarEditar.textContent = "Salvando...";
    try {
      // impede sobrescrever sem querer o cadastro de outra pessoa que já usa esse telefone
      if (telefoneDigits !== telefoneDigitsEmEdicao) {
        const existente = await obterUsuario(telefoneDigits);
        if (existente && existente.nome) {
          mostrarToast(`Esse telefone já está cadastrado para ${existente.nome}. Edite o cadastro existente na lista.`);
          return;
        }
      }
      await editarUsuario(telefoneDigitsEmEdicao, telefoneDigits, nome, telefoneFormatado);
      mostrarToast("Cadastro atualizado com sucesso!");
      fecharEdicao();
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar o cadastro. Verifique sua conexão.");
    } finally {
      btnSalvarEditar.disabled = false;
      btnSalvarEditar.textContent = "Salvar alterações";
    }
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

/* ---------------- Banners da página inicial (carrossel) ---------------- */
function configurarBanners() {
  const formNovo = document.getElementById("formNovoBanner");
  const campoImagem = document.getElementById("campoBannerImagem");
  const previewImagemNovo = document.getElementById("previewBannerImagem");
  const campoTexto = document.getElementById("campoBannerTexto");
  const campoDestino = document.getElementById("campoBannerDestino");
  const campoLink = document.getElementById("campoBannerLink");
  const listaBannersAdmin = document.getElementById("listaBannersAdmin");
  const bannerSemBanners = document.getElementById("bannerSemBanners");
  const cabecalhoBannersAdmin = document.getElementById("cabecalhoBannersAdmin");
  const corpoBannersAdmin = document.getElementById("corpoBannersAdmin");

  // abre/fecha a lista de banners cadastrados (fica compacto quando há muitos banners)
  cabecalhoBannersAdmin?.addEventListener("click", () => {
    corpoBannersAdmin.classList.toggle("oculto");
    cabecalhoBannersAdmin.classList.toggle("recolhido");
  });

  // páginas de destino disponíveis pro botão do banner (todas, menos a própria Início —
  // não faz sentido um banner da Home redirecionar pra Home)
  const PAGINAS_DESTINO_BANNER = ORDEM_PAGINAS.filter((p) => p.chave !== "index");

  function preencherSelectDestino(select, valorSelecionado) {
    PAGINAS_DESTINO_BANNER.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.href;
      opt.textContent = p.label;
      if (p.href === valorSelecionado) opt.selected = true;
      select.appendChild(opt);
    });
  }
  preencherSelectDestino(campoDestino);

  // O destino de um banner pode ser uma página do próprio site (select, como sempre foi) OU um
  // link qualquer digitado à mão (site externo, WhatsApp, Instagram...) — os dois casos ficam
  // guardados no mesmo campo "paginaDestino" no banco; um link é só um valor que não bate com
  // nenhuma página conhecida (ver ehLinkPersonalizado/normalizarLink abaixo).
  function ehLinkPersonalizado(valor) {
    return !PAGINAS_DESTINO_BANNER.some((p) => p.href === valor);
  }
  function normalizarLink(valor) {
    const v = (valor || "").trim();
    if (!v || /^https?:\/\//i.test(v)) return v;
    return "https://" + v; // conveniência: digitou só "wa.me/..." ou "instagram.com/..." sem o https://
  }

  // alterna a visibilidade/obrigatoriedade entre o <select> de páginas e o <input> de link,
  // conforme os rádios "Página do site" / "Link personalizado" — reaproveitado tanto pro
  // formulário de novo banner quanto pro formulário de edição de cada banner já cadastrado.
  function configurarAlternanciaDestino(radios, select, linkInput) {
    function atualizar() {
      const modoLink = [...radios].some((r) => r.checked && r.value === "link");
      select.classList.toggle("oculto", modoLink);
      linkInput.classList.toggle("oculto", !modoLink);
      select.required = !modoLink;
      linkInput.required = modoLink;
    }
    radios.forEach((r) => r.addEventListener("change", atualizar));
    atualizar();
    return atualizar;
  }
  const atualizarDestinoNovo = configurarAlternanciaDestino(formNovo.querySelectorAll('input[name=bannerDestinoTipo]'), campoDestino, campoLink);

  campoImagem.addEventListener("change", () => {
    const file = campoImagem.files[0];
    if (!file) { previewImagemNovo.classList.add("oculto"); return; }
    previewImagemNovo.src = URL.createObjectURL(file);
    previewImagemNovo.classList.remove("oculto");
  });

  formNovo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = formNovo.querySelector("button[type=submit]");
    const file = campoImagem.files[0];
    if (!file) { mostrarToast("Selecione uma imagem para o banner."); return; }
    const modoLink = [...formNovo.querySelectorAll('input[name=bannerDestinoTipo]')].some((r) => r.checked && r.value === "link");
    const paginaDestino = modoLink ? normalizarLink(campoLink.value) : campoDestino.value;
    if (modoLink && !paginaDestino) { mostrarToast("Informe o link para onde o banner deve levar."); return; }
    btn.disabled = true;
    try {
      btn.textContent = "Enviando imagem...";
      const imagemUrl = await enviarImagemParaCloudinary(file);
      btn.textContent = "Adicionando...";
      await criarBanner({
        imagemUrl,
        textoBotao: campoTexto.value.trim(),
        paginaDestino
      });
      formNovo.reset();
      previewImagemNovo.classList.add("oculto");
      atualizarDestinoNovo();
      mostrarToast("Banner adicionado!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível adicionar o banner. Verifique a imagem e tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Adicionar banner";
    }
  });

  ouvirBanners((lista) => {
    listaBannersAdmin.innerHTML = "";
    bannerSemBanners.classList.toggle("oculto", lista.length > 0);

    lista.forEach((banner, indice) => {
      const nomeDestino = (PAGINAS_DESTINO_BANNER.find((p) => p.href === banner.paginaDestino) || {}).label || banner.paginaDestino;

      const temBotao = !!(banner.textoBotao && banner.textoBotao.trim());
      const ehLink = ehLinkPersonalizado(banner.paginaDestino);

      const card = document.createElement("div");
      card.className = "cartao-aviso-admin";
      card.innerHTML = `
        <img src="${banner.imagemUrl}" alt="" class="cartao-aviso-admin__img" />
        <div class="cartao-aviso-admin__corpo">
          <div class="cartao-aviso-admin__titulo">${temBotao ? escaparHtml(banner.textoBotao) : '<em style="color:var(--texto-suave); font-style:italic; font-weight:400;">(sem botão)</em>'}</div>
          <p class="cartao-aviso-admin__texto">Leva para: ${escaparHtml(nomeDestino)}</p>
          <div class="cartao-aviso-admin__acoes">
            <button type="button" class="btn btn-contorno btn-pequeno btn-subir-banner" title="Mover para cima" ${indice === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn btn-contorno btn-pequeno btn-descer-banner" title="Mover para baixo" ${indice === lista.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="btn btn-contorno btn-pequeno btn-editar-banner">Editar</button>
            <button type="button" class="btn btn-vermelho btn-pequeno btn-excluir-banner" title="Apagar banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:-2px;"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
              Apagar
            </button>
          </div>
          <form class="form-editar-banner oculto">
            <div class="campo">
              <label>Trocar imagem (opcional)</label>
              <input type="file" class="campo-edit-imagem-banner" accept="image/*" />
            </div>
            <div class="campo">
              <label>Texto do botão (opcional)</label>
              <input type="text" class="campo-edit-texto-banner" value="${escaparHtml(banner.textoBotao || "")}" placeholder="Deixe em branco para não mostrar nenhum botão sobre o banner" />
            </div>
            <div class="campo" style="margin-bottom:0;">
              <label>Para onde o banner leva ao ser tocado</label>
              <div class="banner-destino-tipo">
                <label><input type="radio" name="bannerDestinoTipoEdit${indice}" class="campo-edit-destino-tipo" value="pagina" ${ehLink ? "" : "checked"} /> Página do site</label>
                <label><input type="radio" name="bannerDestinoTipoEdit${indice}" class="campo-edit-destino-tipo" value="link" ${ehLink ? "checked" : ""} /> Link (site externo, WhatsApp, etc.)</label>
              </div>
              <select class="campo-edit-destino-banner"></select>
              <input type="text" class="campo-edit-link-banner oculto" placeholder="Ex: https://wa.me/5511999999999" value="${ehLink ? escaparHtml(banner.paginaDestino || "") : ""}" />
            </div>
            <div class="cartao-aviso-admin__acoes" style="margin-top:12px;">
              <button type="button" class="btn btn-contorno btn-pequeno btn-cancelar-edicao-banner">Cancelar</button>
              <button type="submit" class="btn btn-dourado btn-pequeno">Salvar</button>
            </div>
          </form>
        </div>
      `;
      listaBannersAdmin.appendChild(card);
      preencherSelectDestino(card.querySelector(".campo-edit-destino-banner"), ehLink ? "" : banner.paginaDestino);
      configurarAlternanciaDestino(
        card.querySelectorAll(".campo-edit-destino-tipo"),
        card.querySelector(".campo-edit-destino-banner"),
        card.querySelector(".campo-edit-link-banner")
      );

      const formEdicao = card.querySelector(".form-editar-banner");
      const btnEditar = card.querySelector(".btn-editar-banner");
      const btnExcluir = card.querySelector(".btn-excluir-banner");
      const btnCancelarEdicao = card.querySelector(".btn-cancelar-edicao-banner");
      const btnSubir = card.querySelector(".btn-subir-banner");
      const btnDescer = card.querySelector(".btn-descer-banner");

      btnSubir.addEventListener("click", async () => {
        if (indice === 0) return;
        btnSubir.disabled = true;
        btnDescer.disabled = true;
        try {
          await trocarOrdemBanners(banner, lista[indice - 1]);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível reordenar. Tente novamente.");
        }
      });
      btnDescer.addEventListener("click", async () => {
        if (indice === lista.length - 1) return;
        btnSubir.disabled = true;
        btnDescer.disabled = true;
        try {
          await trocarOrdemBanners(banner, lista[indice + 1]);
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível reordenar. Tente novamente.");
        }
      });

      btnEditar.addEventListener("click", () => formEdicao.classList.remove("oculto"));
      btnCancelarEdicao.addEventListener("click", () => formEdicao.classList.add("oculto"));

      formEdicao.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btnSalvar = formEdicao.querySelector("button[type=submit]");
        btnSalvar.disabled = true;
        try {
          const modoLinkEdit = [...formEdicao.querySelectorAll(".campo-edit-destino-tipo")].some((r) => r.checked && r.value === "link");
          const linkEdit = formEdicao.querySelector(".campo-edit-link-banner").value;
          if (modoLinkEdit && !normalizarLink(linkEdit)) { mostrarToast("Informe o link para onde o banner deve levar."); btnSalvar.disabled = false; btnSalvar.textContent = "Salvar"; return; }
          const dadosSalvar = {
            textoBotao: formEdicao.querySelector(".campo-edit-texto-banner").value.trim(),
            paginaDestino: modoLinkEdit ? normalizarLink(linkEdit) : formEdicao.querySelector(".campo-edit-destino-banner").value
          };
          const fileEdicao = formEdicao.querySelector(".campo-edit-imagem-banner").files[0];
          if (fileEdicao) {
            btnSalvar.textContent = "Enviando imagem...";
            dadosSalvar.imagemUrl = await enviarImagemParaCloudinary(fileEdicao);
          }
          btnSalvar.textContent = "Salvando...";
          await atualizarBanner(banner.id, dadosSalvar);
          mostrarToast("Banner atualizado!");
          formEdicao.classList.add("oculto");
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível salvar. Tente novamente.");
        } finally {
          btnSalvar.disabled = false;
          btnSalvar.textContent = "Salvar";
        }
      });

      btnExcluir.addEventListener("click", async () => {
        btnExcluir.disabled = true;
        try {
          await excluirBanner(banner.id);
          mostrarToast("Banner removido.");
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível remover. Tente novamente.");
          btnExcluir.disabled = false;
        }
      });
    });
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
