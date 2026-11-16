// Painel administrativo: aba "Simpósio" dentro de Avisos. Cadastra os cursos e eventos que aparecem na
// página pública "Simpósio" (banner 1200 × 600, título, descrição e link opcional), com listas fechadas
// que só abrem quando a pessoa clica.
import { mostrarToast, abrirModal, fecharModal, normalizarLinkSimposio } from "./utils.js";
import {
  ouvirSimposio, criarItemSimposio, atualizarItemSimposio, trocarOrdemSimposio, excluirItemSimposio
} from "./dados.js";

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function campo(rotulo, controle, ajuda) {
  const c = criar("div", "campo");
  const l = criar("label", "", rotulo);
  c.append(l, controle);
  if (ajuda) { const a = criar("span", "campo-ajuda"); a.innerHTML = ajuda; c.appendChild(a); }
  return c;
}

// dependências: enviarImagem(arquivo) → URL; ligarListaFechada(idCabecalho, idCorpo)
export function iniciarSimposioAdmin({ enviarImagem, ligarListaFechada }) {
  /* ---------- abas Avisos | Simpósio ---------- */
  const abas = document.querySelectorAll("#abasAvisos .aba-secao");
  const paineis = { avisos: document.getElementById("abaAvisosAvisos"), simposio: document.getElementById("abaAvisosSimposio") };
  abas.forEach((aba) => aba.addEventListener("click", () => {
    abas.forEach((b) => b.classList.toggle("ativa", b === aba));
    Object.entries(paineis).forEach(([chave, el]) => el.classList.toggle("oculto", chave !== aba.dataset.abaAvisos));
  }));

  ligarListaFechada("cabecalhoNovoSimposio", "corpoNovoSimposio");
  ligarListaFechada("cabecalhoSimposioPublicados", "corpoSimposioPublicados");

  /* ---------- cadastrar ---------- */
  const form = document.getElementById("formNovoSimposio");
  const campoImagem = document.getElementById("campoSimposioImagem");
  const preview = document.getElementById("previewSimposioImagem");
  const campoTitulo = document.getElementById("campoSimposioTitulo");
  const campoDescricao = document.getElementById("campoSimposioDescricao");
  const campoLink = document.getElementById("campoSimposioLink");
  const campoLinkTexto = document.getElementById("campoSimposioLinkTexto");

  campoImagem.addEventListener("change", () => {
    const arquivo = campoImagem.files[0];
    if (!arquivo) { preview.classList.add("oculto"); return; }
    preview.src = URL.createObjectURL(arquivo);
    preview.classList.remove("oculto");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = campoTitulo.value.trim();
    if (!titulo) { mostrarToast("Escreva o título."); return; }
    const link = normalizarLinkSimposio(campoLink.value);
    if (link === null) { mostrarToast("O link não parece válido. Use um endereço (https://...) ou o nome de uma página do site."); campoLink.focus(); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      let imagemUrl = "";
      const arquivo = campoImagem.files[0];
      if (arquivo) {
        btn.textContent = "Enviando banner...";
        imagemUrl = await enviarImagem(arquivo);
      }
      btn.textContent = "Publicando...";
      await criarItemSimposio({
        titulo, descricao: campoDescricao.value.trim(), imagemUrl,
        linkUrl: link, linkTexto: link ? campoLinkTexto.value.trim() : ""
      });
      form.reset();
      preview.classList.add("oculto");
      mostrarToast("Publicado no Simpósio!");
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível publicar. Verifique o banner e tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Publicar no Simpósio";
    }
  });

  /* ---------- lista dos publicados ---------- */
  const listaEl = document.getElementById("listaSimposioAdmin");
  const avisoVazio = document.getElementById("avisoSemSimposio");
  const modalExcluir = document.getElementById("modalExcluirSimposio");
  const nomeExcluir = document.getElementById("nomeExcluirSimposio");
  let itemParaExcluir = null;
  let ultimos = [];
  const emEdicao = new Set(); // ids com o formulário de edição aberto (a lista não se redesenha por cima)
  let pendente = false;

  function renderizar() {
    pendente = false;
    listaEl.innerHTML = "";
    avisoVazio.classList.toggle("oculto", ultimos.length > 0);
    ultimos.forEach((item, indice) => listaEl.appendChild(criarCartao(item, indice)));
  }

  function criarCartao(item, indice) {
    const card = criar("div", "cartao-aviso-admin");
    if (item.imagemUrl) {
      const img = criar("img", "cartao-simposio-admin__img");
      img.src = item.imagemUrl;
      img.alt = "";
      card.appendChild(img);
    }
    const corpo = criar("div", "cartao-aviso-admin__corpo");
    corpo.appendChild(criar("div", "cartao-aviso-admin__titulo", item.titulo || ""));
    if (item.descricao) corpo.appendChild(criar("p", "cartao-aviso-admin__texto", item.descricao));
    if (item.linkUrl) corpo.appendChild(criar("div", "cartao-simposio-admin__link", `🔗 ${item.linkTexto || "Saiba mais"} → ${item.linkUrl}`));

    const acoes = criar("div", "cartao-aviso-admin__acoes");
    const btnSubir = criar("button", "btn btn-contorno btn-pequeno", "↑");
    btnSubir.type = "button"; btnSubir.title = "Mover para cima"; btnSubir.disabled = indice === 0;
    const btnDescer = criar("button", "btn btn-contorno btn-pequeno", "↓");
    btnDescer.type = "button"; btnDescer.title = "Mover para baixo"; btnDescer.disabled = indice === ultimos.length - 1;
    const btnEditar = criar("button", "btn btn-contorno btn-pequeno", "Editar");
    btnEditar.type = "button";
    const btnExcluir = criar("button", "btn btn-vermelho btn-pequeno", "Excluir");
    btnExcluir.type = "button";
    acoes.append(btnSubir, btnDescer, btnEditar, btnExcluir);
    corpo.appendChild(acoes);

    // formulário de edição
    const formEd = criar("form", "form-editar-aviso oculto");
    const edTitulo = criar("input"); edTitulo.type = "text"; edTitulo.maxLength = 120; edTitulo.required = true; edTitulo.value = item.titulo || "";
    const edDescricao = criar("textarea"); edDescricao.rows = 5; edDescricao.value = item.descricao || "";
    const edLink = criar("input"); edLink.type = "text"; edLink.maxLength = 500; edLink.value = item.linkUrl || ""; edLink.placeholder = "Ex: https://forms.gle/... ou cursos"; edLink.autocomplete = "off";
    const edLinkTexto = criar("input"); edLinkTexto.type = "text"; edLinkTexto.maxLength = 40; edLinkTexto.value = item.linkTexto || ""; edLinkTexto.placeholder = "Saiba mais";
    const edImagem = criar("input"); edImagem.type = "file"; edImagem.accept = "image/*";
    formEd.append(
      campo("Título", edTitulo),
      campo("Descrição", edDescricao),
      campo("Link para outra página (opcional)", edLink, "Endereço de um site/formulário, ou o nome de uma página do site (ex.: <strong>cursos</strong>)."),
      campo("Texto do botão do link (opcional)", edLinkTexto),
      campo("Trocar banner (opcional)", edImagem, "📐 Tamanho ideal: <strong>1200 × 600 px</strong> (horizontal).")
    );
    const acoesEd = criar("div", "cartao-aviso-admin__acoes");
    const btnCancelar = criar("button", "btn btn-contorno btn-pequeno", "Cancelar");
    btnCancelar.type = "button";
    const btnSalvar = criar("button", "btn btn-dourado btn-pequeno", "Salvar");
    btnSalvar.type = "submit";
    acoesEd.append(btnCancelar, btnSalvar);
    formEd.appendChild(acoesEd);
    corpo.appendChild(formEd);
    card.appendChild(corpo);

    const fecharEdicao = () => {
      emEdicao.delete(item.id);
      formEd.classList.add("oculto");
      acoes.classList.remove("oculto");
      if (pendente && emEdicao.size === 0) renderizar();
    };
    btnEditar.addEventListener("click", () => { emEdicao.add(item.id); formEd.classList.remove("oculto"); acoes.classList.add("oculto"); });
    btnCancelar.addEventListener("click", fecharEdicao);

    btnSubir.addEventListener("click", async () => {
      if (indice === 0) return;
      btnSubir.disabled = true; btnDescer.disabled = true;
      try { await trocarOrdemSimposio(item, ultimos[indice - 1]); }
      catch (err) { console.error(err); mostrarToast("Não foi possível reordenar. Tente novamente."); }
    });
    btnDescer.addEventListener("click", async () => {
      if (indice === ultimos.length - 1) return;
      btnSubir.disabled = true; btnDescer.disabled = true;
      try { await trocarOrdemSimposio(item, ultimos[indice + 1]); }
      catch (err) { console.error(err); mostrarToast("Não foi possível reordenar. Tente novamente."); }
    });
    btnExcluir.addEventListener("click", () => {
      itemParaExcluir = item.id;
      nomeExcluir.textContent = item.titulo || "este item";
      abrirModal(modalExcluir);
    });

    formEd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = edTitulo.value.trim();
      if (!titulo) { mostrarToast("Escreva o título."); return; }
      const link = normalizarLinkSimposio(edLink.value);
      if (link === null) { mostrarToast("O link não parece válido. Use um endereço (https://...) ou o nome de uma página do site."); edLink.focus(); return; }
      btnSalvar.disabled = true;
      try {
        const dados = { titulo, descricao: edDescricao.value.trim(), linkUrl: link, linkTexto: link ? edLinkTexto.value.trim() : "" };
        const arquivo = edImagem.files[0];
        if (arquivo) {
          btnSalvar.textContent = "Enviando banner...";
          dados.imagemUrl = await enviarImagem(arquivo);
        }
        btnSalvar.textContent = "Salvando...";
        await atualizarItemSimposio(item.id, dados);
        mostrarToast("Simpósio atualizado!");
        fecharEdicao();
      } catch (err) {
        console.error(err);
        mostrarToast("Não foi possível salvar. Tente novamente.");
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
      }
    });
    return card;
  }

  ouvirSimposio((itens) => {
    ultimos = itens;
    if (emEdicao.size > 0) { pendente = true; return; } // quem está editando não perde o que digitou
    renderizar();
  });

  document.getElementById("fecharModalExcluirSimposio").addEventListener("click", () => fecharModal(modalExcluir));
  document.getElementById("btnVoltarExcluirSimposio").addEventListener("click", () => fecharModal(modalExcluir));
  document.getElementById("btnConfirmarExcluirSimposio").addEventListener("click", async (e) => {
    if (!itemParaExcluir) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Apagando...";
    try {
      await excluirItemSimposio(itemParaExcluir);
      emEdicao.delete(itemParaExcluir);
      mostrarToast("Apagado do Simpósio.");
      fecharModal(modalExcluir);
    } catch (err) {
      console.error(err);
      mostrarToast("Não foi possível apagar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Apagar";
    }
  });
}
