import { exigirCadastro } from "./auth.js";
import {
  inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast,
  formatarDataBR, dataParaIso, hojeIso, criarCalendario,
  horariosDoDia, statusMissaEspecifica, CATEGORIAS_INTENCAO
} from "./utils.js";
import { obterConfiguracoesGerais, ouvirConfigIntencoes, ouvirIntencoesDaLista, criarIntencao } from "./dados.js";

inicializarNavegacao("intencoes");
exigirCadastro(); // apenas identificação padrão do site — as intenções em si são anônimas

obterConfiguracoesGerais().then((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl);
});

const dataInput = document.getElementById("dataIntencoesInput");
const calendarioEl = document.getElementById("calendarioIntencoes");
const listaMissasDoDia = document.getElementById("listaMissasDoDia");
const avisoSemMissa = document.getElementById("avisoSemMissaNoDia");
const avisoSelecioneData = document.getElementById("avisoSelecioneData");

function formatarHoraSimples(hora) {
  return `${String(hora).padStart(2, "0")}:00`;
}

let configAtual = null;
let diaSelecionado = null; // nada selecionado até a pessoa escolher no calendário
let pararEscutas = []; // unsubscribes das listas do dia atualmente exibido
let ultimaAssinatura = null; // evita recriar o DOM (e perder o que a pessoa está digitando) sem necessidade

const calendario = criarCalendario(calendarioEl, dataInput, {
  minIso: hojeIso(), // impede selecionar dias que já passaram
  aoSelecionar: (iso) => {
    diaSelecionado = iso;
    renderizarDiaSeNecessario();
  }
});

function pararTodasEscutas() {
  pararEscutas.forEach((parar) => parar());
  pararEscutas = [];
}

function textoStatusFechado(status) {
  if (status.jaAconteceu) return "Esta missa já aconteceu — a lista de intenções está encerrada.";
  return `As intenções para esta missa já fecharam. O preenchimento encerrou às ` +
    `${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.`;
}

function renderizarEntradasNaLista(listaEl, entradas) {
  listaEl.innerHTML = "";
  if (entradas.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "categoria-intencao__vazio";
    vazio.textContent = "Nenhuma intenção adicionada ainda.";
    listaEl.appendChild(vazio);
    return;
  }
  entradas.forEach((it) => {
    const item = document.createElement("div");
    item.className = "intencao-item";
    item.textContent = it.texto;
    listaEl.appendChild(item);
  });
}

const PLACEHOLDERS = {
  gracas: "Escreva aqui sua intenção de agradecimento...",
  alma: "Escreva aqui o nome de quem deseja lembrar...",
  aniversarios: "Escreva aqui o nome de quem está de aniversário..."
};

function criarBlocoCategoria(categoria, rotulo, iso, hora) {
  const bloco = document.createElement("div");
  bloco.className = "categoria-intencao";
  bloco.innerHTML = `
    <h3 class="categoria-intencao__titulo">${rotulo}</h3>
    <div class="categoria-intencao__lista"></div>
    <form class="categoria-intencao__form">
      <textarea rows="2" placeholder="${PLACEHOLDERS[categoria] || ""}" required></textarea>
      <button type="submit" class="btn btn-contorno btn-pequeno">Adicionar</button>
    </form>
  `;
  const listaEl = bloco.querySelector(".categoria-intencao__lista");
  const form = bloco.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = form.querySelector("textarea");
    const texto = textarea.value.trim();
    if (!texto) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      await criarIntencao({ dataMissa: iso, horaMissa: hora, categoria, texto });
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
  return { bloco, listaEl };
}

function criarCardMissaAberta(iso, hora, status) {
  const card = document.createElement("div");
  card.className = "painel";
  card.innerHTML = `
    <div class="painel__titulo"><span class="emoji">🙏</span> Missa das ${formatarHoraSimples(hora)}</div>
    <p class="intencoes-aviso-fecha">Preenchimento aberto até ` +
    `${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.</p>
  `;

  const listasPorCategoria = {};
  CATEGORIAS_INTENCAO.forEach(({ chave, rotulo }) => {
    const { bloco, listaEl } = criarBlocoCategoria(chave, rotulo, iso, hora);
    listasPorCategoria[chave] = listaEl;
    card.appendChild(bloco);
  });

  const parar = ouvirIntencoesDaLista(iso, hora, (entradas) => {
    const porCategoria = { gracas: [], alma: [], aniversarios: [] };
    entradas.forEach((it) => { if (porCategoria[it.categoria]) porCategoria[it.categoria].push(it); });
    Object.entries(porCategoria).forEach(([categoria, itens]) => {
      renderizarEntradasNaLista(listasPorCategoria[categoria], itens);
    });
  });
  pararEscutas.push(parar);

  return card;
}

function criarCardMissaFechada(hora, status) {
  const card = document.createElement("div");
  card.className = "painel";
  card.innerHTML = `
    <div class="painel__titulo"><span class="emoji">🔒</span> Missa das ${formatarHoraSimples(hora)}</div>
    <p style="margin:0; line-height:1.7; color:var(--texto-suave);">${textoStatusFechado(status)}</p>
  `;
  return card;
}

// Só recria o conteúdo quando o dia selecionado ou o status (aberta/fechada) de alguma missa
// realmente muda — assim a pessoa não perde o que já estava digitando a cada checagem periódica.
function renderizarDiaSeNecessario() {
  if (!configAtual) return;

  if (!diaSelecionado) {
    pararTodasEscutas();
    listaMissasDoDia.innerHTML = "";
    avisoSemMissa.classList.add("oculto");
    avisoSelecioneData.classList.remove("oculto");
    ultimaAssinatura = null;
    return;
  }
  avisoSelecioneData.classList.add("oculto");

  const horas = horariosDoDia(configAtual, diaSelecionado);
  const agora = new Date();
  const assinatura = diaSelecionado + "|" + horas
    .map((h) => `${h}:${statusMissaEspecifica(diaSelecionado, h, configAtual.horasAntes, agora).aberta ? "A" : "F"}`)
    .join(",");
  if (assinatura === ultimaAssinatura) return;
  ultimaAssinatura = assinatura;

  pararTodasEscutas();
  listaMissasDoDia.innerHTML = "";
  avisoSemMissa.classList.toggle("oculto", horas.length > 0);

  horas.forEach((hora) => {
    const status = statusMissaEspecifica(diaSelecionado, hora, configAtual.horasAntes, agora);
    const card = status.aberta
      ? criarCardMissaAberta(diaSelecionado, hora, status)
      : criarCardMissaFechada(hora, status);
    listaMissasDoDia.appendChild(card);
  });
}

ouvirConfigIntencoes((config) => {
  configAtual = config;
  renderizarDiaSeNecessario();
});

// reavalia periodicamente para fechar/abrir listas automaticamente sem precisar recarregar a página
setInterval(renderizarDiaSeNecessario, 30000);
