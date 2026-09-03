// Cadastro (nome + telefone) na primeira visita e login automático nas seguintes
import { cadastrarOuAtualizarUsuario } from "./dados.js";
import {
  capitalizarNome, vincularMascaraTelefone, telefoneValido, telefoneParaDigits,
  obterUsuarioSessao, salvarUsuarioSessao, abrirModal, fecharModal, mostrarToast
} from "./utils.js";

const MODAL_HTML = `
<div class="modal-overlay" id="modalCadastro">
  <div class="modal">
    <div class="modal__icone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14.5 L7 18 L9 12 L4 8 L10 8 Z"/></svg>
    </div>
    <h3>Seja bem-vindo(a)</h3>
    <p>Para agendar a sua adoração ao Santíssimo Sacramento, por favor, identifique-se.</p>
    <form id="formCadastro" novalidate>
      <div class="campo" id="campoNome">
        <label for="inputNome">Nome completo</label>
        <input type="text" id="inputNome" placeholder="Digite seu nome" autocomplete="name" required />
        <span class="campo-erro">Por favor, digite seu nome completo.</span>
      </div>
      <div class="campo" id="campoTelefone">
        <label for="inputTelefone">Telefone (WhatsApp)</label>
        <input type="tel" id="inputTelefone" placeholder="(00) 00000-0000" inputmode="numeric" autocomplete="tel" required />
        <span class="campo-erro">Digite um telefone válido, ex: (11) 91234-5678.</span>
      </div>
      <button type="submit" class="btn btn-dourado btn-full">Entrar e continuar</button>
    </form>
  </div>
</div>`;

export function exigirCadastro() {
  return new Promise((resolve) => {
    const usuarioExistente = obterUsuarioSessao();
    if (usuarioExistente && usuarioExistente.nome && usuarioExistente.telefone) {
      resolve(usuarioExistente);
      return;
    }

    document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
    const modal = document.getElementById("modalCadastro");
    const form = document.getElementById("formCadastro");
    const inputNome = document.getElementById("inputNome");
    const inputTelefone = document.getElementById("inputTelefone");
    const campoNome = document.getElementById("campoNome");
    const campoTelefone = document.getElementById("campoTelefone");

    vincularMascaraTelefone(inputTelefone);
    inputNome.addEventListener("blur", () => {
      if (inputNome.value.trim()) inputNome.value = capitalizarNome(inputNome.value.trim());
    });

    abrirModal(modal);
    setTimeout(() => inputNome.focus(), 350);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = capitalizarNome(inputNome.value.trim());
      const telefoneFormatado = inputTelefone.value.trim();

      let valido = true;
      if (nome.split(" ").filter(Boolean).length < 2) {
        campoNome.classList.add("invalido");
        valido = false;
      } else {
        campoNome.classList.remove("invalido");
      }
      if (!telefoneValido(telefoneFormatado)) {
        campoTelefone.classList.add("invalido");
        valido = false;
      } else {
        campoTelefone.classList.remove("invalido");
      }
      if (!valido) return;

      const btnSubmit = form.querySelector("button[type=submit]");
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Aguarde...";

      const telefoneDigits = telefoneParaDigits(telefoneFormatado);
      try {
        await cadastrarOuAtualizarUsuario(telefoneDigits, nome, telefoneFormatado);
        const usuario = { nome, telefone: telefoneFormatado, telefoneDigits };
        salvarUsuarioSessao(usuario);
        fecharModal(modal);
        setTimeout(() => modal.remove(), 400);
        mostrarToast(`Seja bem-vindo(a), ${nome.split(" ")[0]}!`);
        resolve(usuario);
      } catch (err) {
        console.error(err);
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Entrar e continuar";
        mostrarToast("Não foi possível concluir o cadastro. Verifique sua conexão.");
      }
    });
  });
}
