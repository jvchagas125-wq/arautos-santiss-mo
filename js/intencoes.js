import { exigirCadastro } from "./auth.js";
import {
  inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, abrirModal, fecharModal,
  formatarDataBR, dataParaIso, hojeIso, criarCalendario,
  horariosDoDia, statusMissaEspecifica, CATEGORIAS_INTENCAO
} from "./utils.js";
import {
  obterConfiguracoesGerais, ouvirConfigIntencoes, ouvirIntencoesDaLista, criarIntencao,
  atualizarIntencao, excluirIntencao
} from "./dados.js";

inicializarNavegacao("intencoes");
// identificação padrão do site (mesmo telefone/nome usado em agendamentos etc.) — agora cada
// intenção guarda o nome de quem enviou (ver dados.js), pra aparecer no PDF extraído pelo padre.
const usuarioPromise = exigirCadastro();

// No site público cada pessoa só vê as intenções que ELA MESMA colocou em cada categoria (o
// painel administrativo continua mostrando as de todo mundo, via ouvirTodasIntencoes — não
// mexe nisso). Enquanto a identificação (usuarioPromise) ainda não terminou — ex.: alguém
// preenchendo o cadastro pela primeira vez — não dá pra saber o que é "meu" ainda, então as
// listas ficam vazias/"carregando" até resolver; nesse momento, refaz a exibição de tudo que já
// está montado na tela sem esperar um novo evento do Firestore.
let usuarioAtual = null;
let blocosAtivos = []; // funções de re-render dos blocos de categoria (categoria-intencao) na tela agora
usuarioPromise.then((usuario) => {
  usuarioAtual = usuario;
  blocosAtivos.forEach((reRenderizar) => reRenderizar());
});

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

/* ---------- Confirmação de intenção repetida ----------
   Quando a pessoa já tem uma intenção enviada nessa mesma categoria, para essa mesma missa,
   pergunta se ela quer mesmo enviar de novo (em vez de simplesmente bloquear) — evita repetições
   sem querer (ex.: duplo clique) sem impedir quem realmente quer adicionar mais de uma. */
const modalIntencaoRepetida = document.getElementById("modalIntencaoRepetida");
const categoriaRepetidaEl = document.getElementById("categoriaIntencaoRepetida");
const btnCancelarIntencaoRepetida = document.getElementById("btnCancelarIntencaoRepetida");
const btnConfirmarIntencaoRepetida = document.getElementById("btnConfirmarIntencaoRepetida");
let resolverConfirmacaoRepetida = null;

function confirmarEnvioRepetido(rotuloCategoria) {
  categoriaRepetidaEl.textContent = rotuloCategoria;
  abrirModal(modalIntencaoRepetida);
  return new Promise((resolve) => { resolverConfirmacaoRepetida = resolve; });
}
btnCancelarIntencaoRepetida.addEventListener("click", () => {
  fecharModal(modalIntencaoRepetida);
  resolverConfirmacaoRepetida?.(false);
  resolverConfirmacaoRepetida = null;
});
btnConfirmarIntencaoRepetida.addEventListener("click", () => {
  fecharModal(modalIntencaoRepetida);
  resolverConfirmacaoRepetida?.(true);
  resolverConfirmacaoRepetida = null;
});

/* ---------- Confirmação de exclusão (apagar uma intenção que eu mesmo coloquei) ---------- */
const modalApagarIntencao = document.getElementById("modalApagarIntencao");
const btnCancelarApagarIntencao = document.getElementById("btnCancelarApagarIntencao");
const btnConfirmarApagarIntencao = document.getElementById("btnConfirmarApagarIntencao");
let resolverConfirmacaoApagar = null;

function confirmarExclusaoIntencao() {
  abrirModal(modalApagarIntencao);
  return new Promise((resolve) => { resolverConfirmacaoApagar = resolve; });
}
btnCancelarApagarIntencao.addEventListener("click", () => {
  fecharModal(modalApagarIntencao);
  resolverConfirmacaoApagar?.(false);
  resolverConfirmacaoApagar = null;
});
btnConfirmarApagarIntencao.addEventListener("click", () => {
  fecharModal(modalApagarIntencao);
  resolverConfirmacaoApagar?.(true);
  resolverConfirmacaoApagar = null;
});

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
  blocosAtivos = [];
}

function textoStatusFechado(status) {
  if (status.jaAconteceu) return "Esta missa já aconteceu — a lista de intenções está encerrada.";
  return `As intenções para esta missa já fecharam. O preenchimento encerrou às ` +
    `${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.`;
}

const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>`;
const ICONE_LIXEIRA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;

// Renderiza a lista de intenções da pessoa nesta categoria — como agora cada pessoa só vê as
// próprias (ver usuarioAtual acima), toda intenção aqui é dela, então todas recebem os botões
// de editar/apagar. "onSalvar"/"onApagar" cuidam de persistir no Firestore.
function renderizarEntradasNaLista(listaEl, entradas, { categoria, onSalvar, onApagar }) {
  listaEl.innerHTML = "";
  if (entradas.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "categoria-intencao__vazio";
    vazio.textContent = usuarioAtual
      ? "Você ainda não colocou nenhuma intenção aqui."
      : "Carregando suas intenções...";
    listaEl.appendChild(vazio);
    return;
  }
  entradas.forEach((it) => {
    const item = document.createElement("div");
    item.className = "intencao-item";

    function mostrarVisualizacao() {
      item.className = "intencao-item";
      item.innerHTML = `
        <span class="intencao-item__texto"></span>
        <span class="intencao-item__acoes">
          <button type="button" class="intencao-item__btn intencao-item__btn--editar" title="Editar" aria-label="Editar esta intenção">${ICONE_LAPIS}</button>
          <button type="button" class="intencao-item__btn intencao-item__btn--apagar" title="Apagar" aria-label="Apagar esta intenção">${ICONE_LIXEIRA}</button>
        </span>
      `;
      item.querySelector(".intencao-item__texto").textContent = it.texto;
      item.querySelector(".intencao-item__btn--editar").addEventListener("click", mostrarEdicao);
      item.querySelector(".intencao-item__btn--apagar").addEventListener("click", async () => {
        const confirmar = await confirmarExclusaoIntencao();
        if (confirmar) onApagar(it.id);
      });
    }

    function mostrarEdicao() {
      item.className = "intencao-item intencao-item--editando";
      item.innerHTML = `
        <form class="intencao-item__editar-form">
          ${categoria === "gracas" ? `<textarea rows="2" required></textarea>` : `<input type="text" required />`}
          <span class="intencao-item__editar-acoes">
            <button type="submit" class="btn btn-dourado btn-pequeno">Salvar</button>
            <button type="button" class="btn btn-contorno btn-pequeno intencao-item__cancelar">Cancelar</button>
          </span>
        </form>
      `;
      // valor preenchido via propriedade (não interpolado no HTML) — assim nomes com aspas,
      // "&" etc. nunca correm risco de quebrar o atributo/tag.
      item.querySelector("textarea, input").value = it.texto || "";
      item.querySelector(".intencao-item__cancelar").addEventListener("click", mostrarVisualizacao);
      item.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const campoTexto = form.querySelector("textarea, input");
        const texto = campoTexto.value.trim();
        if (!texto) return;
        const btn = form.querySelector("button[type=submit]");
        btn.disabled = true;
        btn.textContent = "Salvando...";
        try {
          await onSalvar(it.id, { texto });
          mostrarToast("Intenção atualizada!");
        } catch (err) {
          console.error(err);
          mostrarToast("Não foi possível salvar. Verifique sua conexão.");
          btn.disabled = false;
          btn.textContent = "Salvar";
        }
      });
    }

    mostrarVisualizacao();
    listaEl.appendChild(item);
  });
}

const PLACEHOLDERS = {
  gracas: "Escreva aqui sua intenção, do jeito que preferir...",
  saude: "Digite um nome e toque em Adicionar",
  alma: "Digite um nome e toque em Adicionar (pode colocar entre parênteses há quantos meses ou anos faleceu, se quiser)",
  aniversarios: "Digite um nome e toque em Adicionar (pode colocar entre parênteses quantos anos completa, se quiser)"
};

// "Pela Recuperação e Saúde de", "Por alma" e "Aniversários" são preenchidos um nome de cada vez
// (a pessoa digita, toca em "Adicionar", o campo limpa e ela pode digitar o próximo) — fica mais
// fácil de usar do que um texto só com vários nomes juntos, e cada nome vira uma intenção
// separada no banco. "gracas" continua sendo um texto livre (pode ser uma frase mais longa),
// sem nenhuma opção fixa de tipo.
function criarBlocoCategoria(categoria, rotulo, iso, hora) {
  const ehNome = categoria !== "gracas";
  const bloco = document.createElement("div");
  bloco.className = "categoria-intencao";
  bloco.innerHTML = `
    <h3 class="categoria-intencao__titulo">${rotulo}</h3>
    <div class="categoria-intencao__lista"></div>
    <form class="categoria-intencao__form">
      ${ehNome
        ? `<input type="text" placeholder="${PLACEHOLDERS[categoria] || ""}" required />`
        : `<textarea rows="2" placeholder="${PLACEHOLDERS[categoria] || ""}" required></textarea>`}
      <button type="submit" class="btn btn-contorno btn-pequeno">Adicionar</button>
    </form>
  `;
  const listaEl = bloco.querySelector(".categoria-intencao__lista");
  const form = bloco.querySelector("form");

  // guarda TODAS as entradas atuais dessa categoria (atualizadas a cada snapshot em tempo real),
  // mesmo sendo de outras pessoas — precisa da lista inteira pra checar, na hora de enviar, se
  // essa mesma pessoa já colocou algo aqui antes (duplicidade é checada na categoria inteira, não
  // só no que é exibido). O que é EXIBIDO, por sua vez, é só o que pertence a quem está vendo a
  // página agora (ver usuarioAtual/reRenderizar abaixo).
  let entradasAtuais = [];

  function reRenderizar() {
    const minhas = usuarioAtual
      ? entradasAtuais.filter((it) => it.telefoneDigits && it.telefoneDigits === usuarioAtual.telefoneDigits)
      : [];
    renderizarEntradasNaLista(listaEl, minhas, {
      categoria,
      onSalvar: (id, dadosParciais) => atualizarIntencao(id, dadosParciais),
      onApagar: (id) => excluirIntencao(id).catch((err) => {
        console.error(err);
        mostrarToast("Não foi possível apagar. Verifique sua conexão.");
      })
    });
  }
  blocosAtivos.push(reRenderizar);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const campoTexto = form.querySelector("textarea, input");
    const texto = campoTexto.value.trim();
    if (!texto) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      const usuario = await usuarioPromise;
      // "por alma"/"aniversários" são vários nomes, um por intenção — não faz sentido avisar de
      // duplicidade a cada nome novo que a pessoa acrescenta, então só pergunta pra "gracas".
      if (!ehNome) {
        const jaTem = entradasAtuais.some((it) => it.telefoneDigits && it.telefoneDigits === usuario.telefoneDigits);
        if (jaTem) {
          const confirmar = await confirmarEnvioRepetido(rotulo);
          if (!confirmar) return;
        }
      }
      await criarIntencao({
        dataMissa: iso, horaMissa: hora, categoria, texto,
        nome: usuario.nome, telefoneDigits: usuario.telefoneDigits
      });
      campoTexto.value = "";
      campoTexto.focus();
      mostrarToast("Intenção adicionada!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível enviar. Verifique sua conexão.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Adicionar";
    }
  });

  return {
    bloco,
    atualizarEntradas(entradas) {
      entradasAtuais = entradas;
      reRenderizar();
    }
  };
}

function criarCardMissaAberta(iso, hora, status) {
  const card = document.createElement("div");
  card.className = "painel";
  card.innerHTML = `
    <div class="painel__titulo"><span class="emoji">🙏</span> Missa das ${formatarHoraSimples(hora)}</div>
    <p class="intencoes-aviso-fecha">Preenchimento aberto até ` +
    `${formatarHoraSimples(status.fechamento.getHours())} de ${formatarDataBR(dataParaIso(status.fechamento))}.</p>
  `;

  const blocosPorCategoria = {};
  CATEGORIAS_INTENCAO.forEach(({ chave, rotulo }) => {
    const { bloco, atualizarEntradas } = criarBlocoCategoria(chave, rotulo, iso, hora);
    blocosPorCategoria[chave] = atualizarEntradas;
    card.appendChild(bloco);
  });

  const parar = ouvirIntencoesDaLista(iso, hora, (entradas) => {
    // monta a partir de CATEGORIAS_INTENCAO (em vez de uma lista fixa aqui) pra uma categoria
    // nova adicionada ali já funcionar aqui também, sem precisar lembrar de mexer nos dois lugares.
    const porCategoria = {};
    CATEGORIAS_INTENCAO.forEach(({ chave }) => { porCategoria[chave] = []; });
    entradas.forEach((it) => { if (porCategoria[it.categoria]) porCategoria[it.categoria].push(it); });
    Object.entries(porCategoria).forEach(([categoria, itens]) => {
      blocosPorCategoria[categoria](itens);
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


