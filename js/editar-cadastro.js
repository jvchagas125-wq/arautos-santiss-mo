// "Editar meu cadastro": a própria pessoa corrige o nome e/ou o telefone pelo menu do perfil.
// Carregado só na hora do clique (ver inicializarNavegacao em js/utils.js).
import { atualizarMeuCadastro } from "./dados.js";
import {
  capitalizarNome, reduzirNomeParaExibicao, vincularMascaraTelefone, telefoneValido, telefoneParaDigits,
  obterUsuarioSessao, salvarUsuarioSessao, abrirModal, fecharModal, mostrarToast
} from "./utils.js";

const CHAVE_ULTIMO_TELEFONE = "arautos_ultimo_telefone";

const MODAL_HTML = `
<div class="modal-overlay" id="modalEditarCadastro">
  <div class="modal">
    <button class="modal--fechar" id="fecharEditarCadastro" aria-label="Fechar">×</button>
    <h3>Editar meu cadastro</h3>
    <p>Corrija seu nome ou telefone. Seus agendamentos e inscrições continuam com você.</p>
    <form id="formEditarCadastro" novalidate>
      <div class="campo" id="campoEditarNome">
        <label for="inputEditarNome">Nome e sobrenome</label>
        <input type="text" id="inputEditarNome" placeholder="Ex: Maria Silva" autocomplete="name" />
        <span class="campo-erro">Por favor, digite seu nome e sobrenome.</span>
      </div>
      <div class="campo" id="campoEditarTelefone">
        <label for="inputEditarTelefone">Telefone (WhatsApp)</label>
        <input type="tel" id="inputEditarTelefone" placeholder="(00) 00000-0000" inputmode="numeric" autocomplete="tel" />
        <span class="campo-erro" id="erroEditarTelefone">Digite um telefone válido, ex: (11) 91234-5678.</span>
      </div>
      <button type="submit" class="btn btn-dourado btn-full" id="btnSalvarEditarCadastro">Salvar</button>
      <button type="button" class="btn btn-contorno btn-full" id="btnCancelarEditarCadastro" style="margin-top:10px;">Cancelar</button>
    </form>
  </div>
</div>`;

export function abrirEdicaoCadastro() {
  const usuario = obterUsuarioSessao();
  if (!usuario || !usuario.telefoneDigits) { mostrarToast("Faça seu cadastro primeiro."); return; }

  let modal = document.getElementById("modalEditarCadastro");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
    modal = document.getElementById("modalEditarCadastro");
    ligar(modal);
  }
  modal.querySelector("#inputEditarNome").value = usuario.nome || "";
  modal.querySelector("#inputEditarTelefone").value = usuario.telefone || "";
  modal.querySelector("#campoEditarNome").classList.remove("invalido");
  modal.querySelector("#campoEditarTelefone").classList.remove("invalido");
  modal.querySelector("#erroEditarTelefone").textContent = "Digite um telefone válido, ex: (11) 91234-5678.";
  abrirModal(modal);
  setTimeout(() => modal.querySelector("#inputEditarNome").focus(), 350);
}

function ligar(modal) {
  const form = modal.querySelector("#formEditarCadastro");
  const inputNome = modal.querySelector("#inputEditarNome");
  const inputTelefone = modal.querySelector("#inputEditarTelefone");
  const campoNome = modal.querySelector("#campoEditarNome");
  const campoTelefone = modal.querySelector("#campoEditarTelefone");
  const erroTelefone = modal.querySelector("#erroEditarTelefone");
  const btnSalvar = modal.querySelector("#btnSalvarEditarCadastro");
  const fechar = () => fecharModal(modal);

  vincularMascaraTelefone(inputTelefone);
  inputNome.addEventListener("blur", () => { if (inputNome.value.trim()) inputNome.value = capitalizarNome(inputNome.value.trim()); });
  modal.querySelector("#fecharEditarCadastro").addEventListener("click", fechar);
  modal.querySelector("#btnCancelarEditarCadastro").addEventListener("click", fechar);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const atual = obterUsuarioSessao();
    if (!atual) { fechar(); return; }

    const nomeDigitado = capitalizarNome(inputNome.value.trim());
    if (nomeDigitado.split(" ").filter(Boolean).length < 2) { campoNome.classList.add("invalido"); return; }
    campoNome.classList.remove("invalido");
    const nome = reduzirNomeParaExibicao(nomeDigitado);

    const telefone = inputTelefone.value.trim();
    if (!telefoneValido(telefone)) {
      erroTelefone.textContent = "Digite um telefone válido, ex: (11) 91234-5678.";
      campoTelefone.classList.add("invalido");
      return;
    }
    campoTelefone.classList.remove("invalido");
    const telefoneDigits = telefoneParaDigits(telefone);

    if (nome === atual.nome && telefoneDigits === atual.telefoneDigits) { fechar(); mostrarToast("Nada foi alterado."); return; }

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    try {
      await atualizarMeuCadastro({ telefoneDigitsAntigo: atual.telefoneDigits, nome, telefone, telefoneDigits });
      salvarUsuarioSessao({ nome, telefone, telefoneDigits });
      try { localStorage.setItem(CHAVE_ULTIMO_TELEFONE, telefone); } catch { /* ok */ }
      const nomeEl = document.getElementById("perfilNome");
      const telEl = document.getElementById("perfilTelefone");
      if (nomeEl) nomeEl.textContent = nome;
      if (telEl) telEl.textContent = telefone;
      fechar();
      mostrarToast("Cadastro atualizado!");
      // recarrega para que a página passe a usar o telefone novo (agendamentos, intenções, inscrições...)
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      console.error(err);
      if (err && err.codigo === "telefone-em-uso") {
        erroTelefone.textContent = "Esse telefone já está cadastrado em outro cadastro.";
        campoTelefone.classList.add("invalido");
      } else {
        mostrarToast("Não foi possível salvar agora. Verifique sua conexão e tente de novo.");
      }
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar";
    }
  });
}
