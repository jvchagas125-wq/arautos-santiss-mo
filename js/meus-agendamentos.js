import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  formatarDataComDiaSemana, formatarHora } from "./utils.js";
import { obterConfiguracoesGerais, ouvirAgendamentosDoUsuario, cancelarAgendamento, limparAgendamentosCancelados } from "./dados.js";

inicializarNavegacao("meus-agendamentos");

const abas = document.querySelectorAll(".aba");
const painelAgendados = document.getElementById("painelAgendados");
const painelCancelados = document.getElementById("painelCancelados");
const listaAgendados = document.getElementById("listaAgendados");
const listaCancelados = document.getElementById("listaCancelados");
const btnLimparCancelados = document.getElementById("btnLimparCancelados");
const modalCancelar = document.getElementById("modalCancelar");
const cancelarInfo = document.getElementById("cancelarInfo");
const motivoCancelamento = document.getElementById("motivoCancelamento");
const btnConfirmarCancelamento = document.getElementById("btnConfirmarCancelamento");
const modalLimparCancelados = document.getElementById("modalLimparCancelados");

let agendamentoParaCancelar = null;
let usuarioAtual = null;

abas.forEach((aba) => {
  aba.addEventListener("click", () => {
    abas.forEach((a) => a.classList.toggle("ativa", a === aba));
    painelAgendados.classList.toggle("oculto", aba.dataset.aba !== "agendados");
    painelCancelados.classList.toggle("oculto", aba.dataset.aba !== "cancelados");
  });
});

function iconeAgendamento() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`;
}

function renderizarLista(agendamentos) {
  const ativos = agendamentos.filter((a) => a.status === "agendado");
  const cancelados = agendamentos.filter((a) => a.status === "cancelado");
  ativos.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  cancelados.sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));

  listaAgendados.innerHTML = ativos.length
    ? ativos.map((a) => cardHtml(a)).join("")
    : `
      <div class="card-vazio">
        <img class="selo-decorativo" src="assets/selo-adoracao.png" alt="" style="margin:0 auto 14px;" />
        <p>Você ainda não tem nenhum agendamento.<br/>Que tal reservar um tempo com Nosso Senhor?</p>
      </div>`;

  listaCancelados.innerHTML = cancelados.length
    ? cancelados.map((a) => cardHtml(a)).join("")
    : '<p class="mensagem-vazia">Nenhum agendamento cancelado.</p>';

  btnLimparCancelados.classList.toggle("oculto", cancelados.length === 0);

  listaAgendados.querySelectorAll("[data-cancelar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCancelamento(agendamentos.find((a) => a.id === btn.dataset.cancelar)));
  });
}

function cardHtml(a) {
  const cancelado = a.status === "cancelado";
  return `
    <div class="card-agendamento" style="${cancelado ? "opacity:.65;" : ""}">
      <div class="card-agendamento__status">${cancelado ? "Cancelado" : "Confirmado"}</div>
      <div class="card-agendamento__data">${iconeAgendamento()} &nbsp;${formatarDataComDiaSemana(a.data)}</div>
      <div class="card-agendamento__hora">${formatarHora(a.hora)}</div>
      ${cancelado && a.motivoCancelamento ? `<div class="card-agendamento__hora">Motivo: ${escaparHtml(a.motivoCancelamento)}</div>` : ""}
      ${!cancelado ? `
        <div class="card-agendamento__acoes">
          <button class="btn btn-contorno" data-cancelar="${a.id}">Cancelar agendamento</button>
        </div>` : ""}
    </div>`;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function abrirModalCancelamento(agendamento) {
  agendamentoParaCancelar = agendamento;
  cancelarInfo.textContent = `${formatarDataComDiaSemana(agendamento.data)} — ${formatarHora(agendamento.hora)}`;
  motivoCancelamento.value = "";
  abrirModal(modalCancelar);
}

document.getElementById("fecharModalCancelar").addEventListener("click", () => fecharModal(modalCancelar));
document.getElementById("btnVoltarModal").addEventListener("click", () => fecharModal(modalCancelar));

btnConfirmarCancelamento.addEventListener("click", async () => {
  if (!agendamentoParaCancelar) return;
  btnConfirmarCancelamento.disabled = true;
  btnConfirmarCancelamento.textContent = "Cancelando...";
  try {
    await cancelarAgendamento(
      agendamentoParaCancelar.id,
      agendamentoParaCancelar.data,
      agendamentoParaCancelar.hora,
      motivoCancelamento.value.trim()
    );
    fecharModal(modalCancelar);
    mostrarToast("Agendamento cancelado. O horário foi liberado.");
  } catch (err) {
    console.error(err);
    mostrarToast("Não foi possível cancelar agora. Tente novamente.");
  } finally {
    btnConfirmarCancelamento.disabled = false;
    btnConfirmarCancelamento.textContent = "Cancelar horário";
    agendamentoParaCancelar = null;
  }
});

document.getElementById("fecharModalLimparCancelados").addEventListener("click", () => fecharModal(modalLimparCancelados));
document.getElementById("btnVoltarLimparCancelados").addEventListener("click", () => fecharModal(modalLimparCancelados));

btnLimparCancelados.addEventListener("click", () => abrirModal(modalLimparCancelados));

document.getElementById("btnConfirmarLimparCancelados").addEventListener("click", async (e) => {
  if (!usuarioAtual) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Limpando...";
  try {
    await limparAgendamentosCancelados(usuarioAtual.telefoneDigits);
    mostrarToast("Histórico de cancelados limpo.");
    fecharModal(modalLimparCancelados);
  } catch (err) {
    console.error(err);
    mostrarToast("Não foi possível limpar agora. Tente novamente.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Limpar cancelados";
  }
});

async function iniciar() {
  const usuario = await exigirCadastro();
  usuarioAtual = usuario;

  const config = await obterConfiguracoesGerais();
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);

  ouvirAgendamentosDoUsuario(usuario.telefoneDigits, renderizarLista);
}

iniciar();
