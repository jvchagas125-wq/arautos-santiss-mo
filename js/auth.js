// Identificação por telefone: login automático para quem já tem cadastro,
// e cadastro (nome + telefone) apenas na primeira vez que aquele número aparece.
import { cadastrarOuAtualizarUsuario, obterUsuario } from "./dados.js";
import {
  capitalizarNome, vincularMascaraTelefone, telefoneValido, telefoneParaDigits,
  obterUsuarioSessao, salvarUsuarioSessao, abrirModal, fecharModal, mostrarToast
} from "./utils.js";

const CHAVE_ULTIMO_TELEFONE = "arautos_ultimo_telefone";

const MODAL_HTML = `
<div class="modal-overlay" id="modalCadastro">
  <div class="modal">
    <div class="modal__icone">
      <img src="assets/emblema.png" alt="Arautos do Evangelho" />
    </div>
    <h3 id="tituloCadastro">Bem-vindo(a)</h3>
    <p id="textoCadastro">Digite seu telefone para entrar.</p>
    <form id="formCadastro" novalidate>
      <div class="campo" id="campoTelefone">
        <label for="inputTelefone">Telefone (WhatsApp)</label>
        <input type="tel" id="inputTelefone" placeholder="(00) 00000-0000" inputmode="numeric" autocomplete="tel" required />
        <span class="campo-erro">Digite um telefone válido, ex: (11) 91234-5678.</span>
      </div>
      <div class="campo oculto" id="campoNome">
        <label for="inputNome">Nome completo</label>
        <input type="text" id="inputNome" placeholder="Digite seu nome" autocomplete="name" />
        <span class="campo-erro">Por favor, digite seu nome completo.</span>
      </div>
      <button type="submit" class="btn btn-dourado btn-full">Continuar</button>
      <button type="button" class="btn btn-contorno btn-full oculto" id="btnTrocarNumero" style="margin-top:10px;">← Usar outro número</button>
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
    const titulo = document.getElementById("tituloCadastro");
    const texto = document.getElementById("textoCadastro");
    const inputNome = document.getElementById("inputNome");
    const inputTelefone = document.getElementById("inputTelefone");
    const campoNome = document.getElementById("campoNome");
    const campoTelefone = document.getElementById("campoTelefone");
    const btnSubmit = form.querySelector("button[type=submit]");
    const btnTrocarNumero = document.getElementById("btnTrocarNumero");

    let fase = "telefone"; // "telefone" | "nome"

    vincularMascaraTelefone(inputTelefone);
    inputNome.addEventListener("blur", () => {
      if (inputNome.value.trim()) inputNome.value = capitalizarNome(inputNome.value.trim());
    });

    // conveniência: pré-preenche com o último telefone usado neste aparelho (mesmo após sair)
    const ultimoTelefone = localStorage.getItem(CHAVE_ULTIMO_TELEFONE);
    if (ultimoTelefone) inputTelefone.value = ultimoTelefone;

    abrirModal(modal);
    setTimeout(() => inputTelefone.focus(), 350);

    function voltarParaTelefone() {
      fase = "telefone";
      campoNome.classList.add("oculto");
      btnTrocarNumero.classList.add("oculto");
      inputTelefone.readOnly = false;
      inputTelefone.closest(".campo").classList.remove("invalido");
      titulo.textContent = "Bem-vindo(a)";
      texto.textContent = "Digite seu telefone para entrar.";
      btnSubmit.textContent = "Continuar";
      setTimeout(() => inputTelefone.focus(), 50);
    }
    btnTrocarNumero.addEventListener("click", voltarParaTelefone);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const telefoneFormatado = inputTelefone.value.trim();

      if (!telefoneValido(telefoneFormatado)) {
        campoTelefone.classList.add("invalido");
        return;
      }
      campoTelefone.classList.remove("invalido");
      const telefoneDigits = telefoneParaDigits(telefoneFormatado);

      if (fase === "telefone") {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Verificando...";
        try {
          const usuario = await obterUsuario(telefoneDigits);
          if (usuario && usuario.nome) {
            // já tem cadastro com esse número -> login direto, sem duplicar
            const sessao = { nome: usuario.nome, telefone: usuario.telefone || telefoneFormatado, telefoneDigits };
            localStorage.setItem(CHAVE_ULTIMO_TELEFONE, sessao.telefone);
            salvarUsuarioSessao(sessao);
            fecharModal(modal);
            setTimeout(() => modal.remove(), 400);
            mostrarToast(`Bem-vindo(a) de volta, ${sessao.nome.split(" ")[0]}!`);
            resolve(sessao);
            return;
          }
          // número novo -> pede o nome para completar o cadastro
          fase = "nome";
          inputTelefone.readOnly = true;
          campoNome.classList.remove("oculto");
          btnTrocarNumero.classList.remove("oculto");
          titulo.textContent = "Primeiro acesso";
          texto.textContent = "Não encontramos esse número. Complete seu cadastro para continuar.";
          btnSubmit.disabled = false;
          btnSubmit.textContent = "Concluir cadastro";
          setTimeout(() => inputNome.focus(), 50);
        } catch (err) {
          console.error(err);
          btnSubmit.disabled = false;
          btnSubmit.textContent = "Continuar";
          mostrarToast("Não foi possível verificar seu cadastro. Verifique sua conexão.");
        }
        return;
      }

      // fase === "nome": concluir o cadastro novo
      const nome = capitalizarNome(inputNome.value.trim());
      if (nome.split(" ").filter(Boolean).length < 2) {
        campoNome.classList.add("invalido");
        return;
      }
      campoNome.classList.remove("invalido");

      btnSubmit.disabled = true;
      btnSubmit.textContent = "Aguarde...";
      try {
        await cadastrarOuAtualizarUsuario(telefoneDigits, nome, telefoneFormatado);
        const sessao = { nome, telefone: telefoneFormatado, telefoneDigits };
        localStorage.setItem(CHAVE_ULTIMO_TELEFONE, telefoneFormatado);
        salvarUsuarioSessao(sessao);
        fecharModal(modal);
        setTimeout(() => modal.remove(), 400);
        mostrarToast(`Seja bem-vindo(a), ${nome.split(" ")[0]}!`);
        resolve(sessao);
      } catch (err) {
        console.error(err);
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Concluir cadastro";
        mostrarToast("Não foi possível concluir o cadastro. Verifique sua conexão.");
      }
    });
  });
}
