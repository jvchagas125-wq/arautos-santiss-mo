import { exigirCadastro } from "./auth.js";
import {
  inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast,
  formatarDataBR, dataParaIso, calcularListaIntencoesAtual
} from "./utils.js";
import { obterConfiguracoesGerais, ouvirConfigIntencoes, ouvirIntencoesDaLista, criarIntencao } from "./dados.js";

inicializarNavegacao("intencoes");
exigirCadastro(); // apenas identificação padrão do site — as intenções em si são anônimas

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
});

const elCarregando = document.getElementById("intencoesCarregando");
const painelAberta = document.getElementById("painelIntencoesAberta");
const painelFechada = document.getElementById("painelIntencoesFechada");
const intencoesTitulo = document.getElementById("intencoesTitulo");
const intencoesAvisoFecha = document.getElementById("intencoesAvisoFecha");
const textoFechado = document.getElementById("textoFechado");

const LISTAS_EL = {
  gracas: document.getElementById("listaGracas"),
  alma: document.getElementById("listaAlma"),
  aniversarios: document.getElementById("listaAniversarios")
};

function formatarHoraSimples(hora) {
  return `${String(hora).padStart(2, "0")}:00`;
}

let configAtual = null;
let chaveListaAtual = null; // "dataMissa-horaMissa" da lista atualmente exibida
let pararEscutaLista = null;
let intervaloChecagem = null;

function renderizarEntradas(entradas) {
  Object.values(LISTAS_EL).forEach((el) => { el.innerHTML = ""; });
  const porCategoria = { gracas: [], alma: [], aniversarios: [] };
  entradas.forEach((it) => {
    if (porCategoria[it.categoria]) porCategoria[it.categoria].push(it);
  });
  Object.entries(porCategoria).forEach(([categoria, itens]) => {
    const el = LISTAS_EL[categoria];
    if (itens.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "categoria-intencao__vazio";
      vazio.textContent = "Nenhuma intenção adicionada ainda.";
      el.appendChild(vazio);
      return;
    }
    itens.forEach((it) => {
      const item = document.createElement("div");
      item.className = "intencao-item";
      item.textContent = it.texto;
      el.appendChild(item);
    });
  });
}

function atualizarTela() {
  if (!configAtual) return;
  const status = calcularListaIntencoesAtual(configAtual, new Date());
  elCarregando.classList.add("oculto");

  if (!status.dataMissa) {
    painelAberta.classList.add("oculto");
    painelFechada.classList.remove("oculto");
    textoFechado.textContent = "Nenhum horário de missa está configurado no momento.";
    return;
  }

  if (!status.aberta) {
    painelAberta.classList.add("oculto");
    painelFechada.classList.remove("oculto");
    textoFechado.textContent =
      `As intenções estão fechadas para preenchimento agora. A lista abre automaticamente às ` +
      `${formatarHoraSimples(status.proximaMissa.getHours())} de ${formatarDataBR(dataParaIso(status.proximaMissa))}.`;
    if (pararEscutaLista) { pararEscutaLista(); pararEscutaLista = null; }
    chaveListaAtual = null;
    return;
  }

  painelFechada.classList.add("oculto");
  painelAberta.classList.remove("oculto");
  intencoesTitulo.textContent = `Intenções para a missa de ${formatarDataBR(status.dataMissa)} às ${formatarHoraSimples(status.horaMissa)}`;
  intencoesAvisoFecha.textContent = `Preenchimento aberto até ${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.`;

  const novaChave = `${status.dataMissa}|${status.horaMissa}`;
  if (novaChave !== chaveListaAtual) {
    chaveListaAtual = novaChave;
    if (pararEscutaLista) pararEscutaLista();
    pararEscutaLista = ouvirIntencoesDaLista(status.dataMissa, status.horaMissa, renderizarEntradas);
  }
}

ouvirConfigIntencoes((config) => {
  configAtual = config;
  atualizarTela();
});

// reavalia periodicamente para trocar de lista automaticamente sem precisar recarregar a página
intervaloChecagem = setInterval(atualizarTela, 30000);

document.querySelectorAll(".categoria-intencao__form").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!chaveListaAtual) return;
    const [dataMissa, horaMissaStr] = chaveListaAtual.split("|");
    const horaMissa = Number(horaMissaStr);
    const categoria = form.dataset.categoria;
    const textarea = form.querySelector("textarea");
    const texto = textarea.value.trim();
    if (!texto) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      await criarIntencao({ dataMissa, horaMissa, categoria, texto });
      textarea.value = "";
      mostrarToast("Intenção adicionada!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível enviar. Verifique sua conexão.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Adicionar";
    }
  });
});
