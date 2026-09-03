import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  formatarDataComDiaSemana, formatarHora } from "./utils.js";
import { obterConfiguracoesGerais, ouvirAgendamentosDoUsuario, cancelarAgendamento } from "./dados.js";

inicializarNavegacao("meus-agendamentos");

const listaContainer = document.getElementById("listaContainer");
const modalCancelar = document.getElementById("modalCancelar");
const cancelarInfo = document.getElementById("cancelarInfo");
const motivoCancelamento = document.getElementById("motivoCancelamento");
const btnConfirmarCancelamento = document.getElementById("btnConfirmarCancelamento");

let agendamentoParaCancelar = null;

function iconeAgendamento() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`;
}

function renderizarLista(agendamentos) {
  if (agendamentos.length === 0) {
    listaContainer.innerHTML = `
      <div class="card-vazio">
        <img class="selo-decorativo" src="assets/selo-adoracao.png" alt="" style="margin:0 auto 14px;" />
        <p>Você ainda não tem nenhum agendamento.<br/>Que tal reservar um tempo com Nosso Senhor?</p>
      </div>`;
    return;
  }

  // agendados primeiro (mais próximos), depois cancelados
  const ativos = agendamentos.filter((a) => a.status === "agendado");
  const cancelados = agendamentos.filter((a) => a.status === "cancelado");
  ativos.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  cancelados.sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));

  const ordenados = [...ativos, ...cancelados];

  listaContainer.innerHTML = ordenados.map((a) => cardHtml(a)).join("");

  listaContainer.querySelectorAll("[data-cancelar]").forEach((btn) => {
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

async function iniciar() {
  const usuario = await exigirCadastro();

  const config = await obterConfiguracoesGerais();
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);

  ouvirAgendamentosDoUsuario(usuario.telefoneDigits, renderizarLista);
}

iniciar();
