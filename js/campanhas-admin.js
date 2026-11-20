// Painel: "Campanhas" (Contatos > Campanhas). O administrador escreve uma mensagem, e o painel mostra a lista de
// pessoas cadastradas com um botão que abre a conversa do WhatsApp JÁ com a mensagem pronta. A cada clique a
// pessoa é marcada como "enviada" e sai da lista. Tudo fica guardado no Firestore (ver "Campanhas" em js/dados.js).
//
// O WhatsApp só entende: *negrito*, _itálico_ e ~tachado~ (além de emojis e links, que ele reconhece sozinho).
// Sublinhado e cores não existem em mensagens do WhatsApp — por isso o editor só oferece o que realmente funciona.

const EMOJIS = ["🙏", "✝️", "⛪", "🕊️", "❤️", "💛", "🌹", "🌷", "✨", "🔥", "📿", "🕯️", "👼", "🙌", "👏", "😊", "😇", "🥰",
  "📅", "⏰", "📍", "📢", "📣", "✅", "➡️", "⭐", "🎉", "🎶", "📖", "🍞", "🍷", "💒", "🤝", "🎁"];
const TITULOS_QUE_ACOMPANHAM = ["pe", "padre", "dr", "dra", "sr", "sra", "irma", "irmao", "frei", "dom"];

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const semAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// nomes que começam com "Pe." (padres)
export const ehPadre = (nome) => /^\s*(pe\.\s*|pe\s+|padre\s+)/i.test(String(nome || ""));

// "Maria Silva" → "Maria"; "Pe. João Batista" → "Pe. João"
export function primeiroNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeira = semAcento(partes[0]).replace(/[^a-z]/g, "");
  return TITULOS_QUE_ACOMPANHAM.includes(primeira) && partes[1] ? `${partes[0]} ${partes[1]}` : partes[0];
}

export const mensagemParaPessoa = (modelo, nome) => String(modelo || "").replace(/\{nome\}/gi, primeiroNome(nome));

export function linkWhatsapp(telefoneDigits, mensagem) {
  let num = String(telefoneDigits || "").replace(/\D/g, "");
  if (num.length <= 11) num = "55" + num;
  return `https://wa.me/${num}` + (mensagem ? `?text=${encodeURIComponent(mensagem)}` : "");
}

// Texto com marcas do WhatsApp → HTML (só para a pré-visualização)
export function previaWhatsapp(texto) {
  let h = esc(texto);
  h = h.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, '<span class="camp-link">$1</span>');
  // a marca só vale colada no texto, e não no meio de uma palavra (como no WhatsApp)
  h = h.replace(/(^|[^\p{L}\p{N}*])\*([^*\n]+)\*(?![\p{L}\p{N}])/gu, "$1<strong>$2</strong>");
  h = h.replace(/(^|[^\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}])/gu, "$1<em>$2</em>");
  h = h.replace(/(^|[^\p{L}\p{N}~])~([^~\n]+)~(?![\p{L}\p{N}])/gu, "$1<s>$2</s>");
  return h.replace(/\n/g, "<br>");
}

const ICONE_WHATS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 10.5c.3 2.4 2.1 4.2 4.5 4.5"/></svg>';

/* opcoes: { raiz, ouvir, salvar, marcar, excluir, novoId, abrirWhatsapp, toast, confirmar } */
export function criarCampanhas(opcoes) {
  const { raiz } = opcoes;
  let campanhas = [];
  let contatos = [];
  let idAtual = null; // null = lista de campanhas; "nova" = ainda não salva; senão, o id
  let ativo = false;
  let escutando = false;
  // o que está sendo editado agora
  let edicao = { id: null, nome: "", mensagem: "", ocultarPadres: false, excluidos: new Set() };
  const ui = { busca: "", mostrarEnviados: false, mostrarRemovidos: false };

  const abrirLink = opcoes.abrirWhatsapp || ((url) => window.open(url, "_blank", "noopener"));
  const campanhaSalva = (id) => campanhas.find((c) => c.id === id);

  /* ---------- lista de campanhas ---------- */
  function desenharLista() {
    idAtual = null;
    const cartoes = campanhas.map((c) => {
      const enviados = Object.keys(c.enviados || {}).length;
      const quando = c.criadoEmMs ? new Date(c.criadoEmMs).toLocaleDateString("pt-BR") : "";
      return `
        <div class="camp-cartao">
          <div class="camp-cartao__info">
            <div class="camp-cartao__nome">${esc(c.nome || "Campanha sem nome")}</div>
            <div class="camp-cartao__meta">${quando ? `Criada em ${quando} · ` : ""}${enviados} ${enviados === 1 ? "mensagem enviada" : "mensagens enviadas"}</div>
          </div>
          <div class="camp-cartao__acoes">
            <button type="button" class="btn btn-contorno btn-pequeno" data-abrir="${esc(c.id)}">Abrir</button>
            <button type="button" class="btn btn-contorno btn-pequeno camp-perigo" data-apagar="${esc(c.id)}">Excluir</button>
          </div>
        </div>`;
    }).join("");
    raiz.innerHTML = `
      <p class="formulario-intro">Crie uma mensagem e envie, pessoa por pessoa, pelo WhatsApp. Quem já recebeu sai da lista sozinho.</p>
      <button type="button" class="btn btn-dourado btn-pequeno" id="campNova">＋ Nova campanha</button>
      <div class="camp-lista">${cartoes || '<p class="mensagem-vazia">Nenhuma campanha criada ainda.</p>'}</div>`;
    raiz.querySelector("#campNova").addEventListener("click", () => abrirEditor("nova"));
    raiz.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", () => abrirEditor(b.dataset.abrir)));
    // exclusão em dois cliques (o primeiro só pede a confirmação)
    raiz.querySelectorAll("[data-apagar]").forEach((b) => {
      let armado = false, tempo = null;
      b.addEventListener("click", async () => {
        if (!armado) {
          armado = true; b.textContent = "Clique de novo para excluir";
          tempo = setTimeout(() => { armado = false; b.textContent = "Excluir"; }, 4000);
          return;
        }
        clearTimeout(tempo);
        try { await opcoes.excluir(b.dataset.apagar); opcoes.toast?.("Campanha excluída."); }
        catch (e) { console.error(e); opcoes.toast?.("Não foi possível excluir agora."); armado = false; b.textContent = "Excluir"; }
      });
    });
  }

  /* ---------- editor de uma campanha ---------- */
  function abrirEditor(id) {
    idAtual = id;
    ui.busca = ""; ui.mostrarEnviados = false; ui.mostrarRemovidos = false;
    const c = id === "nova" ? null : campanhaSalva(id);
    edicao = {
      id: id === "nova" ? null : id,
      nome: c?.nome || "",
      mensagem: c?.mensagem || "",
      ocultarPadres: !!c?.ocultarPadres,
      excluidos: new Set(c?.excluidos || [])
    };
    raiz.innerHTML = `
      <button type="button" class="btn btn-contorno btn-pequeno" id="campVoltar">← Todas as campanhas</button>

      <div class="campo" style="margin-top:14px;">
        <label for="campNome">Nome da campanha</label>
        <input type="text" id="campNome" placeholder="Ex.: Convite para a festa do padroeiro" autocomplete="off" maxlength="80" />
      </div>

      <div class="campo">
        <label for="campMensagem">Mensagem</label>
        <div class="camp-barra" role="toolbar" aria-label="Formatação da mensagem">
          <button type="button" data-fmt="*" title="Negrito"><b>N</b></button>
          <button type="button" data-fmt="_" title="Itálico"><i>I</i></button>
          <button type="button" data-fmt="~" title="Tachado"><s>T</s></button>
          <button type="button" id="campBtnEmoji" title="Emoji">😊</button>
          <button type="button" id="campBtnLink" title="Link">🔗</button>
          <button type="button" id="campBtnNome" title="Inserir o primeiro nome da pessoa">{nome}</button>
        </div>
        <div class="camp-emojis oculto" id="campEmojis">${EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join("")}</div>
        <div class="camp-linkbox oculto" id="campLinkBox">
          <input type="text" id="campLinkTexto" placeholder="Texto antes do link (opcional)" autocomplete="off" />
          <input type="url" id="campLinkUrl" placeholder="https://..." autocomplete="off" />
          <button type="button" class="btn btn-dourado btn-pequeno" id="campLinkOk">Inserir link</button>
        </div>
        <textarea id="campMensagem" rows="7" placeholder="Escreva aqui a mensagem. Use {nome} para colocar o primeiro nome de cada pessoa."></textarea>
        <p class="campo-ajuda">O WhatsApp aceita <strong>negrito</strong>, <em>itálico</em>, <s>tachado</s>, emojis e links. Sublinhado e cores não existem nas mensagens do WhatsApp.</p>
      </div>

      <div class="camp-previa-titulo">Como a pessoa vai ver</div>
      <div class="camp-previa" id="campPrevia"></div>

      <div class="camp-acoes-salvar">
        <button type="button" class="btn btn-dourado" id="campSalvar">Salvar campanha</button>
        <span class="camp-estado" id="campEstado"></span>
      </div>

      <div class="camp-filtros">
        <h4 class="camp-subtitulo">Quem vai receber</h4>
        <input type="search" id="campBusca" placeholder="Buscar por nome ou telefone..." autocomplete="off" />
        <label class="camp-check"><input type="checkbox" id="campPadres" /> Tirar os padres da lista (nomes que começam com “Pe.”)</label>
      </div>
      <div class="camp-resumo" id="campResumo"></div>
      <div id="campParaEnviar"></div>
      <div id="campEnviados"></div>
      <div id="campRemovidos"></div>`;

    const $ = (s) => raiz.querySelector(s);
    const campoNome = $("#campNome"), campoMsg = $("#campMensagem");
    campoNome.value = edicao.nome;
    campoMsg.value = edicao.mensagem;
    $("#campPadres").checked = edicao.ocultarPadres;

    $("#campVoltar").addEventListener("click", () => desenharLista());
    campoNome.addEventListener("input", () => { edicao.nome = campoNome.value; marcarSujo(); });
    campoMsg.addEventListener("input", () => { edicao.mensagem = campoMsg.value; atualizarPrevia(); marcarSujo(); });
    $("#campBusca").addEventListener("input", (e) => { ui.busca = e.target.value; desenharPessoas(); });
    $("#campPadres").addEventListener("change", (e) => { edicao.ocultarPadres = e.target.checked; marcarSujo(); desenharPessoas(); if (edicao.id) salvarSilencioso(); });

    // formatação: envolve o texto selecionado com a marca do WhatsApp
    raiz.querySelectorAll("[data-fmt]").forEach((b) => b.addEventListener("click", () => envolver(b.dataset.fmt)));
    function inserir(texto) {
      const ini = campoMsg.selectionStart ?? campoMsg.value.length;
      const fim = campoMsg.selectionEnd ?? ini;
      campoMsg.setRangeText(texto, ini, fim, "end");
      campoMsg.focus();
      campoMsg.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function envolver(marca) {
      const ini = campoMsg.selectionStart ?? 0, fim = campoMsg.selectionEnd ?? 0;
      const selecionado = campoMsg.value.slice(ini, fim);
      if (selecionado) {
        campoMsg.setRangeText(`${marca}${selecionado}${marca}`, ini, fim, "end");
      } else {
        campoMsg.setRangeText(`${marca}${marca}`, ini, fim, "end");
        campoMsg.setSelectionRange(ini + 1, ini + 1);
      }
      campoMsg.focus();
      campoMsg.dispatchEvent(new Event("input", { bubbles: true }));
    }
    $("#campBtnEmoji").addEventListener("click", () => $("#campEmojis").classList.toggle("oculto"));
    raiz.querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => inserir(b.dataset.emoji)));
    $("#campBtnNome").addEventListener("click", () => inserir("{nome}"));
    $("#campBtnLink").addEventListener("click", () => $("#campLinkBox").classList.toggle("oculto"));
    $("#campLinkOk").addEventListener("click", () => {
      let url = $("#campLinkUrl").value.trim();
      if (!url) { opcoes.toast?.("Digite o endereço do link."); return; }
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      const rotulo = $("#campLinkTexto").value.trim();
      const antes = campoMsg.value.slice(0, campoMsg.selectionStart ?? 0);
      inserir((antes && !/\s$/.test(antes) ? " " : "") + (rotulo ? rotulo + " " : "") + url);
      $("#campLinkTexto").value = ""; $("#campLinkUrl").value = "";
      $("#campLinkBox").classList.add("oculto");
    });

    $("#campSalvar").addEventListener("click", salvarCampanhaAtual);
    atualizarPrevia();
    desenharPessoas();
  }

  let sujo = false;
  function marcarSujo() {
    sujo = true;
    const e = raiz.querySelector("#campEstado");
    if (e) e.textContent = "Alterações ainda não salvas";
  }
  function atualizarPrevia() {
    const el = raiz.querySelector("#campPrevia");
    if (!el) return;
    const exemplo = mensagemParaPessoa(edicao.mensagem, "Maria Silva");
    el.innerHTML = exemplo.trim() ? previaWhatsapp(exemplo) : '<span class="camp-previa-vazia">A mensagem aparece aqui enquanto você escreve.</span>';
  }

  // salva (cria se for nova). Devolve o id.
  async function salvarCampanhaAtual() {
    const nome = edicao.nome.trim();
    if (!nome) { opcoes.toast?.("Dê um nome para a campanha."); raiz.querySelector("#campNome")?.focus(); return null; }
    if (!edicao.mensagem.trim()) { opcoes.toast?.("Escreva a mensagem da campanha."); raiz.querySelector("#campMensagem")?.focus(); return null; }
    const id = edicao.id || opcoes.novoId();
    const campos = {
      nome, mensagem: edicao.mensagem, ocultarPadres: edicao.ocultarPadres, excluidos: [...edicao.excluidos]
    };
    if (!edicao.id) campos.criadoEmMs = Date.now();
    try {
      await opcoes.salvar(id, campos);
      edicao.id = id; idAtual = id; sujo = false;
      const e = raiz.querySelector("#campEstado");
      if (e) e.textContent = "Campanha salva ✓";
      return id;
    } catch (err) {
      console.error(err);
      opcoes.toast?.("Não foi possível salvar agora. Verifique a conexão.");
      return null;
    }
  }
  async function salvarSilencioso() { if (edicao.nome.trim() && edicao.mensagem.trim()) await salvarCampanhaAtual(); }

  /* ---------- a lista de pessoas ---------- */
  function desenharPessoas() {
    const paraEnviar = raiz.querySelector("#campParaEnviar");
    if (!paraEnviar) return;
    const salva = edicao.id ? campanhaSalva(edicao.id) : null;
    const enviados = salva?.enviados || {};
    const filtro = semAcento(ui.busca);
    const filtroDigitos = ui.busca.replace(/\D/g, "");
    const casa = (c) => !filtro || semAcento(c.nome).includes(filtro) || (filtroDigitos !== "" && String(c.telefoneDigits || "").includes(filtroDigitos));

    const base = contatos.filter((c) => c.telefoneDigits && !(edicao.ocultarPadres && ehPadre(c.nome)));
    const removidos = base.filter((c) => edicao.excluidos.has(c.telefoneDigits));
    const elegiveis = base.filter((c) => !edicao.excluidos.has(c.telefoneDigits));
    const jaEnviados = elegiveis.filter((c) => enviados[c.telefoneDigits]);
    const faltam = elegiveis.filter((c) => !enviados[c.telefoneDigits]);

    raiz.querySelector("#campResumo").innerHTML =
      `<span><strong>${faltam.length}</strong> para enviar</span><span><strong>${jaEnviados.length}</strong> já enviados</span><span><strong>${removidos.length}</strong> tirados da campanha</span>`;

    const linha = (c, acoes) => `
      <div class="card-contato camp-pessoa">
        <div><div class="card-contato__nome">${esc(c.nome)}</div><div class="card-contato__tel">${esc(c.telefone)}</div></div>
        <div class="card-contato__acoes">${acoes}</div>
      </div>`;

    const lista1 = faltam.filter(casa);
    paraEnviar.innerHTML = `<h4 class="camp-subtitulo">Para enviar (${lista1.length}${filtro ? ` de ${faltam.length}` : ""})</h4>` +
      (lista1.length
        ? lista1.map((c) => linha(c, `
            <button type="button" class="camp-enviar" data-enviar="${esc(c.telefoneDigits)}" title="Abrir a conversa no WhatsApp com a mensagem pronta">${ICONE_WHATS}<span>Enviar</span></button>
            <button type="button" class="card-contato__excluir" data-tirar="${esc(c.telefoneDigits)}" title="Tirar esta pessoa da campanha">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>`)).join("")
        : `<p class="mensagem-vazia">${faltam.length === 0 ? (elegiveis.length ? "Todas as pessoas já receberam a mensagem. 🎉" : "Nenhuma pessoa na lista.") : "Ninguém encontrado para essa busca."}</p>`);

    const secao = (alvo, chave, titulo, lista, acoesFn) => {
      const el = raiz.querySelector(alvo);
      if (!lista.length) { el.innerHTML = ""; return; }
      el.innerHTML = `<button type="button" class="camp-alternar" data-alt="${chave}">${ui[chave] ? "▾" : "▸"} ${titulo} (${lista.length})</button>` +
        (ui[chave] ? lista.map((c) => linha(c, acoesFn(c))).join("") : "");
    };
    secao("#campEnviados", "mostrarEnviados", "Já enviados", jaEnviados.filter(casa), (c) =>
      `<span class="camp-feito">${new Date(enviados[c.telefoneDigits]).toLocaleDateString("pt-BR")}</span>
       <button type="button" class="btn btn-contorno btn-pequeno" data-desfazer="${esc(c.telefoneDigits)}">Voltar para a lista</button>`);
    secao("#campRemovidos", "mostrarRemovidos", "Tirados desta campanha", removidos.filter(casa), (c) =>
      `<button type="button" class="btn btn-contorno btn-pequeno" data-restaurar="${esc(c.telefoneDigits)}">Colocar de volta</button>`);

    raiz.querySelectorAll("[data-alt]").forEach((b) => b.addEventListener("click", () => { ui[b.dataset.alt] = !ui[b.dataset.alt]; desenharPessoas(); }));
    raiz.querySelectorAll("[data-enviar]").forEach((b) => b.addEventListener("click", () => enviar(b.dataset.enviar)));
    raiz.querySelectorAll("[data-tirar]").forEach((b) => b.addEventListener("click", () => { edicao.excluidos.add(b.dataset.tirar); desenharPessoas(); salvarSilencioso(); }));
    raiz.querySelectorAll("[data-restaurar]").forEach((b) => b.addEventListener("click", () => { edicao.excluidos.delete(b.dataset.restaurar); desenharPessoas(); salvarSilencioso(); }));
    raiz.querySelectorAll("[data-desfazer]").forEach((b) => b.addEventListener("click", async () => {
      try { await opcoes.marcar(edicao.id, b.dataset.desfazer, false); } catch (e) { console.error(e); opcoes.toast?.("Não foi possível desfazer agora."); }
    }));
  }

  // clique em "Enviar": abre o WhatsApp na hora (precisa ser no próprio clique, senão o navegador bloqueia),
  // e só depois guarda que essa pessoa já recebeu.
  async function enviar(telefoneDigits) {
    const pessoa = contatos.find((c) => c.telefoneDigits === telefoneDigits);
    if (!pessoa) return;
    if (!edicao.mensagem.trim()) { opcoes.toast?.("Escreva a mensagem da campanha antes de enviar."); return; }
    if (!edicao.nome.trim()) { opcoes.toast?.("Dê um nome para a campanha antes de enviar."); raiz.querySelector("#campNome")?.focus(); return; }
    abrirLink(linkWhatsapp(telefoneDigits, mensagemParaPessoa(edicao.mensagem, pessoa.nome)));
    const id = (sujo || !edicao.id) ? await salvarCampanhaAtual() : edicao.id;
    if (!id) return;
    try { await opcoes.marcar(id, telefoneDigits, true); }
    catch (e) { console.error(e); opcoes.toast?.("A conversa foi aberta, mas não foi possível registrar o envio."); }
  }

  /* ---------- ligação com o resto do painel ---------- */
  function atualizarTela() {
    if (!ativo) return;
    if (idAtual === null) { desenharLista(); return; }
    desenharPessoas();
  }

  const resumoEl = opcoes.resumo || null;
  return {
    // chamado quando o quadro é aberto pela primeira vez (só então começa a ler do banco)
    ativar() {
      if (ativo) return;
      ativo = true;
      desenharLista();
      if (!escutando) {
        escutando = true;
        opcoes.ouvir((lista) => {
          campanhas = lista;
          if (resumoEl) resumoEl.textContent = String(lista.length);
          // se estiver editando uma campanha salva, mantém os campos que está digitando
          atualizarTela();
        });
      }
    },
    definirContatos(lista) { contatos = Array.isArray(lista) ? lista : []; if (ativo && idAtual !== null) desenharPessoas(); }
  };
}
