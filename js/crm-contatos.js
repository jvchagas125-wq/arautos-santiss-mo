// CRM de contatos do painel administrativo (dentro do "Histórico de listas (arquivo)").
// Junta, numa base só, todas as pessoas que já enviaram intenções: quantas vezes participaram,
// o que enviaram, anotações e etiquetas próprias, botão do WhatsApp e exportação para planilha.
// Toda a leitura vem das intenções já salvas — este módulo só acrescenta a camada de anotações
// (coleção "contatosCrm"), que nunca aparece no site público.
import { formatarDataBR, aplicarMascaraTelefone, mostrarToast } from "./utils.js";

const ETIQUETAS_SUGERIDAS = ["Benfeitor", "Aniversariante", "Voluntário", "Família", "Visitante"];
const POR_PAGINA = 40;
const CHAVE_MSG = "arautos-crm-mensagem-whatsapp";

const ICONE_ZAP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 0 0-8.47 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.03.8.81-2.95-.2-.31a8.2 8.2 0 1 1 6.9 3.78Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.12-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.56.67 2.17.73 2.95.61.48-.07 1.46-.6 1.67-1.17.2-.58.2-1.07.14-1.17-.06-.1-.23-.16-.48-.28Z"/></svg>';
const ICONE_SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

function semAcento(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function idDoContato(tel, nome) {
  if (tel) return tel;
  return "sem-telefone-" + (semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "anonimo");
}

// número para o link do WhatsApp (wa.me): só dígitos, com 55 na frente quando for número brasileiro
export function numeroWhatsApp(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return "";
}

function telefoneBonito(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`; // fixo
  return aplicarMascaraTelefone(local);
}

function celulaCsv(valor) {
  let t = String(valor ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(t)) t = "'" + t; // evita que a planilha trate o texto como fórmula
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * opcoes:
 *  raiz            elemento onde a tela do CRM é montada
 *  obterEntradas() intenções já enviadas (todas as listas)
 *  ehArquivada(dataMissa, hora)  true se a lista está no Histórico (arquivo)
 *  obterUsuarios() pessoas cadastradas no site ({nome, telefoneDigits})
 *  obterCategorias() categorias do formulário ([{chave, rotulo}])
 *  rotuloLista(dataMissa, hora)  texto da lista ("Missa de ... às 08:00")
 *  salvarContato(id, {notas, etiquetas})
 */
export function criarCrm(opcoes) {
  const { raiz } = opcoes;
  let anotacoes = {}; // id -> { notas, etiquetas }
  let contatos = [];
  const abertos = new Set();
  let limite = POR_PAGINA;
  let pendente = false;
  let ativo = false;

  const filtro = { busca: "", etiqueta: "", escopo: "todas", ordem: "recente" };

  raiz.innerHTML = `
    <p class="formulario-intro">
      Todas as pessoas que já enviaram intenções, reunidas em uma base só. Abra um contato para ver tudo o que ele enviou
      e para guardar <strong>anotações</strong> e <strong>etiquetas</strong> (só você vê — não aparecem no site).
      O botão verde abre a conversa dele no WhatsApp.
    </p>
    <div class="crm-resumo" id="crmResumo"></div>
    <div class="crm-barra">
      <input type="search" class="crm-busca" id="crmBusca" placeholder="Buscar por nome, telefone, etiqueta ou anotação..." autocomplete="off" />
      <div class="crm-filtros">
        <select id="crmEscopo" aria-label="Quais listas considerar">
          <option value="todas">Todas as listas</option>
          <option value="arquivadas">Só listas do arquivo</option>
        </select>
        <select id="crmEtiqueta" aria-label="Filtrar por etiqueta"><option value="">Todas as etiquetas</option></select>
        <select id="crmOrdem" aria-label="Ordenar">
          <option value="recente">Participou há menos tempo</option>
          <option value="antigo">Sem participar há mais tempo</option>
          <option value="mais">Mais intenções</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
      </div>
      <div class="crm-acoes-topo">
        <button type="button" class="btn btn-contorno btn-pequeno" id="crmExportar">Baixar planilha (CSV)</button>
      </div>
    </div>
    <div class="campo crm-mensagem">
      <label for="crmMensagem">Mensagem inicial do WhatsApp (opcional)</label>
      <input type="text" id="crmMensagem" maxlength="300" autocomplete="off"
        placeholder="Ex.: Salve Maria, {nome}! Aqui é da equipe dos Arautos." />
      <span class="campo-dica">Use <strong>{nome}</strong> para colocar o primeiro nome da pessoa. Ao tocar no botão verde, a conversa abre já com essa mensagem — você só confere e envia.</span>
    </div>
    <div id="crmLista"></div>
  `;

  const el = (id) => raiz.querySelector("#" + id);
  const resumo = el("crmResumo");
  const lista = el("crmLista");
  const campoBusca = el("crmBusca");
  const selEscopo = el("crmEscopo");
  const selEtiqueta = el("crmEtiqueta");
  const selOrdem = el("crmOrdem");
  const campoMensagem = el("crmMensagem");

  try { campoMensagem.value = localStorage.getItem(CHAVE_MSG) || ""; } catch (e) { /* sem armazenamento */ }
  campoMensagem.addEventListener("input", () => {
    try { localStorage.setItem(CHAVE_MSG, campoMensagem.value); } catch (e) { /* ok */ }
  });

  /* ---------- montagem da base ---------- */
  function montarContatos() {
    const usuarios = new Map((opcoes.obterUsuarios() || []).map((u) => [String(u.telefoneDigits || ""), u]));
    const mapa = new Map();
    const entradas = [...opcoes.obterEntradas()].sort((a, b) =>
      `${a.dataMissa}|${String(a.horaMissa).padStart(2, "0")}`.localeCompare(`${b.dataMissa}|${String(b.horaMissa).padStart(2, "0")}`));
    entradas.forEach((it) => {
      if (filtro.escopo === "arquivadas" && !opcoes.ehArquivada(it.dataMissa, it.horaMissa)) return;
      const tel = String(it.telefoneDigits || "").replace(/\D/g, "");
      const nomeItem = (it.nome || "").trim();
      if (!tel && !nomeItem) return;
      const id = idDoContato(tel, nomeItem);
      let c = mapa.get(id);
      if (!c) {
        c = { id, tel, nome: nomeItem, itens: [], listas: new Set(), primeira: it.dataMissa, ultima: it.dataMissa };
        mapa.set(id, c);
      }
      if (nomeItem) c.nome = nomeItem; // fica o nome da participação mais recente
      c.itens.push(it);
      c.listas.add(`${it.dataMissa}|${it.horaMissa}`);
      if (it.dataMissa < c.primeira) c.primeira = it.dataMissa;
      if (it.dataMissa > c.ultima) c.ultima = it.dataMissa;
    });
    mapa.forEach((c) => {
      const u = usuarios.get(c.tel);
      if (u && u.nome) c.nome = u.nome; // o cadastro do site é a fonte mais cuidada do nome
      if (!c.nome) c.nome = "(sem nome)";
      c.itens.reverse(); // mais recentes primeiro
    });
    contatos = [...mapa.values()];
  }

  function anotacaoDe(c) {
    const a = anotacoes[c.id] || {};
    return { notas: a.notas || "", etiquetas: Array.isArray(a.etiquetas) ? a.etiquetas : [] };
  }

  function todasEtiquetas() {
    const s = new Set();
    Object.values(anotacoes).forEach((a) => (a.etiquetas || []).forEach((e) => s.add(e)));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function filtrados() {
    const termo = semAcento(filtro.busca.trim());
    const termoDigitos = filtro.busca.replace(/\D/g, "");
    let r = contatos.filter((c) => {
      const a = anotacaoDe(c);
      if (filtro.etiqueta && !a.etiquetas.includes(filtro.etiqueta)) return false;
      if (!termo) return true;
      if (semAcento(c.nome).includes(termo)) return true;
      if (termoDigitos.length >= 3 && c.tel.includes(termoDigitos)) return true;
      if (a.etiquetas.some((e) => semAcento(e).includes(termo))) return true;
      return semAcento(a.notas).includes(termo);
    });
    const porNome = (x, y) => x.nome.localeCompare(y.nome, "pt-BR");
    if (filtro.ordem === "nome") r.sort(porNome);
    else if (filtro.ordem === "mais") r.sort((x, y) => y.itens.length - x.itens.length || porNome(x, y));
    else if (filtro.ordem === "antigo") r.sort((x, y) => x.ultima.localeCompare(y.ultima) || porNome(x, y));
    else r.sort((x, y) => y.ultima.localeCompare(x.ultima) || porNome(x, y));
    return r;
  }

  /* ---------- WhatsApp ---------- */
  function linkWhatsApp(c) {
    const num = numeroWhatsApp(c.tel);
    if (!num) return "";
    const primeiro = (c.nome.split(/\s+/)[0] || "").trim();
    const msg = campoMensagem.value.trim().replace(/\{nome\}/gi, primeiro);
    return `https://wa.me/${num}` + (msg ? `?text=${encodeURIComponent(msg)}` : "");
  }

  /* ---------- salvar anotações ---------- */
  async function gravar(c, notas, etiquetas) {
    try {
      await opcoes.salvarContato(c.id, { notas, etiquetas });
      anotacoes[c.id] = { ...(anotacoes[c.id] || {}), notas, etiquetas };
      return true;
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível salvar a anotação. Tente novamente.");
      return false;
    }
  }

  /* ---------- desenho ---------- */
  function criarChip(texto, aoRemover) {
    const chip = document.createElement("span");
    chip.className = "crm-etiqueta";
    chip.textContent = texto;
    if (aoRemover) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "crm-etiqueta__x";
      x.setAttribute("aria-label", `Remover etiqueta ${texto}`);
      x.textContent = "×";
      x.addEventListener("click", (e) => { e.stopPropagation(); aoRemover(); });
      chip.appendChild(x);
    }
    return chip;
  }

  function criarDetalhes(c) {
    const det = document.createElement("div");
    det.className = "crm-detalhes";
    const a = anotacaoDe(c);
    let etiquetas = [...a.etiquetas];

    // etiquetas
    const blocoEt = document.createElement("div");
    blocoEt.className = "crm-bloco";
    blocoEt.innerHTML = '<p class="campo-legenda">Etiquetas</p>';
    const chips = document.createElement("div");
    chips.className = "crm-etiquetas";
    const desenharChips = () => {
      chips.innerHTML = "";
      if (!etiquetas.length) {
        const v = document.createElement("span");
        v.className = "crm-vazio";
        v.textContent = "Nenhuma etiqueta ainda.";
        chips.appendChild(v);
      }
      etiquetas.forEach((e) => chips.appendChild(criarChip(e, async () => {
        const antes = etiquetas;
        etiquetas = etiquetas.filter((x) => x !== e);
        desenharChips();
        if (!(await gravar(c, campoNotas.value.trim(), etiquetas))) { etiquetas = antes; desenharChips(); }
      })));
    };
    const linhaNova = document.createElement("div");
    linhaNova.className = "crm-nova-etiqueta";
    const idLista = "crmSugestoes-" + c.id;
    const novaEt = document.createElement("input");
    novaEt.type = "text";
    novaEt.maxLength = 30;
    novaEt.placeholder = "Nova etiqueta (ex.: Benfeitor)";
    novaEt.setAttribute("list", idLista);
    novaEt.autocomplete = "off";
    const dl = document.createElement("datalist");
    dl.id = idLista;
    [...new Set([...ETIQUETAS_SUGERIDAS, ...todasEtiquetas()])].forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      dl.appendChild(o);
    });
    const btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "btn btn-contorno btn-pequeno";
    btnAdd.textContent = "Adicionar";
    const adicionar = async () => {
      const t = novaEt.value.trim().replace(/\s+/g, " ");
      if (!t) return;
      if (etiquetas.some((e) => semAcento(e) === semAcento(t))) { novaEt.value = ""; return; }
      const antes = etiquetas;
      etiquetas = [...etiquetas, t];
      novaEt.value = "";
      desenharChips();
      if (!(await gravar(c, campoNotas.value.trim(), etiquetas))) { etiquetas = antes; desenharChips(); }
    };
    btnAdd.addEventListener("click", adicionar);
    novaEt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } });
    linhaNova.append(novaEt, dl, btnAdd);
    blocoEt.append(chips, linhaNova);

    // anotações
    const blocoNotas = document.createElement("div");
    blocoNotas.className = "crm-bloco";
    blocoNotas.innerHTML = '<p class="campo-legenda">Anotações</p>';
    const campoNotas = document.createElement("textarea");
    campoNotas.rows = 3;
    campoNotas.maxLength = 2000;
    campoNotas.placeholder = "Ex.: prefere ser contatada à tarde; ajuda nas campanhas; aniversário em março...";
    campoNotas.value = a.notas;
    const btnSalvar = document.createElement("button");
    btnSalvar.type = "button";
    btnSalvar.className = "btn btn-vermelho btn-pequeno";
    btnSalvar.textContent = "Salvar anotação";
    btnSalvar.addEventListener("click", async () => {
      btnSalvar.disabled = true;
      if (await gravar(c, campoNotas.value.trim(), etiquetas)) mostrarToast("Anotação salva.");
      btnSalvar.disabled = false;
    });
    blocoNotas.append(campoNotas, btnSalvar);

    // histórico
    const blocoHist = document.createElement("div");
    blocoHist.className = "crm-bloco";
    blocoHist.innerHTML = `<p class="campo-legenda">Tudo o que enviou (${c.itens.length})</p>`;
    const ul = document.createElement("ul");
    ul.className = "crm-historico";
    const rotulos = new Map((opcoes.obterCategorias() || []).map((k) => [k.chave, k.rotulo]));
    c.itens.forEach((it) => {
      const li = document.createElement("li");
      const quando = document.createElement("span");
      quando.className = "crm-historico__quando";
      quando.textContent = `${formatarDataBR(it.dataMissa)} · ${String(it.horaMissa).padStart(2, "0")}h`;
      const cat = document.createElement("strong");
      cat.textContent = (rotulos.get(it.categoria) || "Outras intenções") + ": ";
      const txt = document.createElement("span");
      const base = (it.texto || "").trim();
      txt.textContent = it.tempo ? `${base} (${it.tempo})` : base;
      const corpo = document.createElement("span");
      corpo.className = "crm-historico__texto";
      corpo.append(cat, txt);
      li.append(quando, corpo);
      ul.appendChild(li);
    });
    blocoHist.appendChild(ul);

    desenharChips();
    det.append(blocoEt, blocoNotas, blocoHist);
    return det;
  }

  function criarCartao(c) {
    const aberto = abertos.has(c.id);
    const a = anotacaoDe(c);
    const cartao = document.createElement("div");
    cartao.className = "crm-contato" + (aberto ? " aberto" : "");

    const topo = document.createElement("div");
    topo.className = "crm-contato__topo";
    topo.setAttribute("role", "button");
    topo.tabIndex = 0;
    topo.setAttribute("aria-expanded", String(aberto));

    const seta = document.createElement("span");
    seta.className = "crm-contato__seta";
    seta.innerHTML = ICONE_SETA;

    const info = document.createElement("div");
    info.className = "crm-contato__info";
    const nome = document.createElement("strong");
    nome.className = "crm-contato__nome";
    nome.textContent = c.nome;
    const fone = document.createElement("span");
    fone.className = "crm-contato__fone";
    fone.textContent = telefoneBonito(c.tel) || "sem telefone";
    const meta = document.createElement("span");
    meta.className = "crm-contato__meta";
    const nI = c.itens.length;
    const nL = c.listas.size;
    meta.textContent = `${nI} ${nI === 1 ? "intenção" : "intenções"} em ${nL} ${nL === 1 ? "lista" : "listas"} · última em ${formatarDataBR(c.ultima)}`;
    info.append(nome, fone, meta);
    if (a.etiquetas.length) {
      const linha = document.createElement("div");
      linha.className = "crm-etiquetas";
      a.etiquetas.forEach((e) => linha.appendChild(criarChip(e)));
      info.appendChild(linha);
    }
    topo.append(seta, info);

    const link = linkWhatsApp(c);
    const zap = document.createElement(link ? "a" : "span");
    zap.className = "crm-zap" + (link ? "" : " desativado");
    zap.innerHTML = ICONE_ZAP;
    if (link) {
      zap.href = link;
      zap.target = "_blank";
      zap.rel = "noopener";
      zap.title = "Abrir conversa no WhatsApp";
      zap.setAttribute("aria-label", `Abrir WhatsApp de ${c.nome}`);
      zap.addEventListener("click", (e) => e.stopPropagation());
    } else {
      zap.title = "Sem número válido para WhatsApp";
    }
    topo.appendChild(zap);

    const alternar = () => {
      if (abertos.has(c.id)) abertos.delete(c.id); else abertos.add(c.id);
      desenhar();
    };
    topo.addEventListener("click", alternar);
    topo.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === topo) { e.preventDefault(); alternar(); }
    });
    cartao.appendChild(topo);
    if (aberto) cartao.appendChild(criarDetalhes(c));
    return cartao;
  }

  function desenhar() {
    // o filtro de etiquetas acompanha as etiquetas que realmente existem
    const atual = filtro.etiqueta;
    const ets = todasEtiquetas();
    selEtiqueta.innerHTML = '<option value="">Todas as etiquetas</option>';
    ets.forEach((e) => {
      const o = document.createElement("option");
      o.value = e;
      o.textContent = e;
      selEtiqueta.appendChild(o);
    });
    if (atual && !ets.includes(atual)) filtro.etiqueta = "";
    selEtiqueta.value = filtro.etiqueta;

    const r = filtrados();
    const comZap = contatos.filter((c) => numeroWhatsApp(c.tel)).length;
    const totalIntencoes = contatos.reduce((s, c) => s + c.itens.length, 0);
    resumo.innerHTML = "";
    [[contatos.length, contatos.length === 1 ? "pessoa" : "pessoas"],
     [totalIntencoes, totalIntencoes === 1 ? "intenção" : "intenções"],
     [comZap, "com WhatsApp"]].forEach(([n, t]) => {
      const s = document.createElement("span");
      s.className = "crm-resumo__item";
      s.innerHTML = `<strong>${n}</strong> ${t}`;
      resumo.appendChild(s);
    });

    lista.innerHTML = "";
    if (!contatos.length) {
      const v = document.createElement("p");
      v.className = "mensagem-vazia";
      v.textContent = filtro.escopo === "arquivadas"
        ? "Ainda não há pessoas nas listas do arquivo."
        : "Ainda não há pessoas com intenções enviadas.";
      lista.appendChild(v);
      return;
    }
    if (!r.length) {
      const v = document.createElement("p");
      v.className = "mensagem-vazia";
      v.textContent = "Nenhum contato encontrado com esse filtro.";
      lista.appendChild(v);
      return;
    }
    const contagem = document.createElement("p");
    contagem.className = "crm-contagem";
    contagem.textContent = r.length === contatos.length ? "" : `Mostrando ${r.length} de ${contatos.length}`;
    if (contagem.textContent) lista.appendChild(contagem);
    r.slice(0, limite).forEach((c) => lista.appendChild(criarCartao(c)));
    if (r.length > limite) {
      const mais = document.createElement("button");
      mais.type = "button";
      mais.className = "btn btn-contorno btn-pequeno crm-mais";
      mais.textContent = `Mostrar mais (${r.length - limite} restantes)`;
      mais.addEventListener("click", () => { limite += POR_PAGINA; desenhar(); });
      lista.appendChild(mais);
    }
  }

  /* ---------- eventos ---------- */
  campoBusca.addEventListener("input", () => { filtro.busca = campoBusca.value; limite = POR_PAGINA; desenhar(); });
  selEtiqueta.addEventListener("change", () => { filtro.etiqueta = selEtiqueta.value; limite = POR_PAGINA; desenhar(); });
  selOrdem.addEventListener("change", () => { filtro.ordem = selOrdem.value; desenhar(); });
  selEscopo.addEventListener("change", () => { filtro.escopo = selEscopo.value; limite = POR_PAGINA; montarContatos(); desenhar(); });
  // as mensagens prontas mudam o link do botão verde
  campoMensagem.addEventListener("change", desenhar);

  el("crmExportar").addEventListener("click", () => {
    const r = filtrados();
    if (!r.length) { mostrarToast("Não há contatos para exportar com esse filtro."); return; }
    const cab = ["Nome", "Telefone", "WhatsApp", "Intenções", "Listas", "Primeira participação", "Última participação", "Etiquetas", "Anotações"];
    const linhas = [cab.map(celulaCsv).join(";")];
    r.forEach((c) => {
      const a = anotacaoDe(c);
      const num = numeroWhatsApp(c.tel);
      linhas.push([
        c.nome, telefoneBonito(c.tel), num ? `https://wa.me/${num}` : "",
        c.itens.length, c.listas.size, formatarDataBR(c.primeira), formatarDataBR(c.ultima),
        a.etiquetas.join(", "), a.notas
      ].map(celulaCsv).join(";"));
    });
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatos-arautos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    mostrarToast(`${r.length} ${r.length === 1 ? "contato exportado" : "contatos exportados"}.`);
  });

  // se a pessoa está digitando numa anotação, os dados que chegam do banco esperam ela terminar
  raiz.addEventListener("focusout", () => {
    setTimeout(() => {
      if (pendente && !emEdicao()) { pendente = false; montarContatos(); desenhar(); }
    }, 0);
  });
  function emEdicao() {
    const f = document.activeElement;
    return !!(f && raiz.contains(f) && f.matches("textarea, .crm-nova-etiqueta input"));
  }

  return {
    // chamado quando as intenções, os cadastros ou as anotações mudam
    atualizar() {
      if (!ativo) { pendente = true; return; }
      if (emEdicao()) { pendente = true; return; }
      pendente = false;
      montarContatos();
      desenhar();
    },
    definirAnotacoes(mapa) {
      anotacoes = mapa || {};
      this.atualizar();
    },
    // a aba do CRM foi aberta/fechada: só desenha quando está visível
    definirAtivo(v) {
      ativo = v;
      if (v) { pendente = false; montarContatos(); desenhar(); }
    }
  };
}
