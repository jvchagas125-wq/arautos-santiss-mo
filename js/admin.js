import { inicializarNavegacao, aplicarLogo, mostrarToast, abrirModal, fecharModal,
  formatarDataBR, formatarHora, vincularOlhoSenha, criarCalendario } from "./utils.js";
import {
  obterConfiguracoesGerais, salvarConfiguracoesGerais,
  obterDiasHorarios, salvarDiasHorarios,
  obterSenhaAdmin, salvarSenhaAdmin,
  ouvirTodosAgendamentos, ouvirTodosUsuarios, excluirUsuario
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
  const listaAgendados = document.getElementById("listaAgendados");
  const listaCancelados = document.getElementById("listaCancelados");
  const modalMotivo = document.getElementById("modalMotivo");
  const textoMotivo = document.getElementById("textoMotivo");

  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      abas.forEach((a) => a.classList.toggle("ativa", a === aba));
      listaAgendados.classList.toggle("oculto", aba.dataset.aba !== "agendados");
      listaCancelados.classList.toggle("oculto", aba.dataset.aba !== "cancelados");
    });
  });

  document.getElementById("fecharModalMotivo").addEventListener("click", () => fecharModal(modalMotivo));
  document.getElementById("btnFecharMotivo").addEventListener("click", () => fecharModal(modalMotivo));

  function cardAgendado(a) {
    return `
      <div class="card-agendamento">
        <div class="card-agendamento__status">Confirmado</div>
        <div class="card-agendamento__pessoa">${escaparHtml(a.nome)}</div>
        <div class="card-agendamento__tel">${escaparHtml(a.telefone)}</div>
        <div class="card-agendamento__data">${formatarDataBR(a.data)}</div>
        <div class="card-agendamento__hora">${formatarHora(a.hora)}</div>
      </div>`;
  }
  function cardCancelado(a) {
    return `
      <div class="card-agendamento" style="opacity:.75;">
        <div class="card-agendamento__status">Cancelado</div>
        <div class="card-agendamento__pessoa">${escaparHtml(a.nome)}</div>
        <div class="card-agendamento__tel">${escaparHtml(a.telefone)}</div>
        <div class="card-agendamento__data">${formatarDataBR(a.data)}</div>
        <div class="card-agendamento__hora">${formatarHora(a.hora)}</div>
        <div class="card-agendamento__acoes">
          <button class="btn btn-contorno" data-motivo="${escaparHtml(a.motivoCancelamento || "Nenhum motivo informado.")}">Ver motivo</button>
        </div>
      </div>`;
  }

  ouvirTodosAgendamentos("agendado", (lista) => {
    listaAgendados.innerHTML = lista.length
      ? lista.map(cardAgendado).join("")
      : '<p class="mensagem-vazia">Nenhum agendamento no momento.</p>';
  });

  ouvirTodosAgendamentos("cancelado", (lista) => {
    listaCancelados.innerHTML = lista.length
      ? lista.map(cardCancelado).join("")
      : '<p class="mensagem-vazia">Nenhum cancelamento registrado.</p>';
    listaCancelados.querySelectorAll("[data-motivo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        textoMotivo.textContent = btn.dataset.motivo;
        abrirModal(modalMotivo);
      });
    });
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
