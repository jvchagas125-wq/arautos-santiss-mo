import { exigirCadastro } from "./auth.js";
import { inicializarNavegacao, aplicarLogo, aplicarFundo, mostrarToast, normalizarFormularioIntencoes } from "./utils.js";
import { ouvirConfiguracoesGerais, ouvirFormularioIntencoes } from "./dados.js";

inicializarNavegacao("contatos");

exigirCadastro().then(() => {
  // usuário identificado — nada mais a fazer aqui, a navegação já foi liberada
});

ouvirConfiguracoesGerais((config) => {
  aplicarLogo(config.logoUrl);
  aplicarFundo(config.fundoUrl, config.fundoPcUrl || "");
  aplicarInformacoesDeContato(config);
});

function aplicarInformacoesDeContato(config) {
  const elEnderecoTexto = document.getElementById("contatoEnderecoTexto");
  const elEnderecoObs = document.getElementById("contatoEnderecoObs");
  const linkEndereco = document.getElementById("linkEndereco");
  const elTelefoneTexto = document.getElementById("contatoTelefoneTexto");
  const linkLigar = document.getElementById("linkLigar");
  const linkWhatsapp = document.getElementById("linkWhatsapp");
  const elInstagramTexto = document.getElementById("contatoInstagramTexto");
  const linkInstagram = document.getElementById("linkInstagram");

  if (elEnderecoTexto) elEnderecoTexto.textContent = config.contatoEnderecoTexto || "";
  // no cartão quadrado cabe só o começo do endereço (rua e número); o endereço inteiro fica logo abaixo
  const elEnderecoCurto = document.getElementById("contatoEnderecoCurto");
  if (elEnderecoCurto) elEnderecoCurto.textContent = String(config.contatoEnderecoTexto || "").split(/\s[—–-]\s/)[0];
  if (elEnderecoObs) elEnderecoObs.textContent = config.contatoEnderecoObs || "";
  if (linkEndereco) linkEndereco.href = config.contatoEnderecoLink || "#";

  if (elTelefoneTexto) elTelefoneTexto.textContent = config.contatoTelefoneTexto || "";
  const digitos = (config.contatoTelefoneDigits || "").replace(/\D/g, "");
  if (linkLigar) linkLigar.href = digitos ? `tel:+${digitos}` : "#";
  if (linkWhatsapp) linkWhatsapp.href = digitos ? `https://wa.me/${digitos}` : "#";

  if (elInstagramTexto) elInstagramTexto.textContent = config.contatoInstagramTexto || "";
  if (linkInstagram) linkInstagram.href = config.contatoInstagramLink || "#";
}

/* ---------- Faça a Sua Contribuição! (PIX) ----------
   Dados editados no painel administrativo (configuracoes/intencoesForm.pix). Guardamos a última
   versão vista neste aparelho pra o quadro já aparecer na hora, sem esperar a rede. */
const CHAVE_CACHE_PIX = "arautos_pix_cache";
const el = (id) => document.getElementById(id);
let pixAtual = null;

function aplicarPix(p) {
  pixAtual = p;
  const configurado = !!(p && (p.qrCodeUrl || p.chave));
  el("painelContribuicao").classList.toggle("oculto", !configurado);
  if (!configurado) return;
  // respeita as quebras de linha escritas no painel (cada linha = uma linha na tela)
  el("pixMensagem").textContent = String(p.mensagem || "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const img = el("pixQrCode");
  if (p.qrCodeUrl) {
    if (img.getAttribute("src") !== p.qrCodeUrl) img.src = p.qrCodeUrl;
    img.classList.remove("oculto");
  } else { img.removeAttribute("src"); img.classList.add("oculto"); }
  const ben = el("pixBeneficiario");
  ben.textContent = p.beneficiario || "";
  ben.classList.toggle("oculto", !p.beneficiario);
  el("pixChave").textContent = p.chave;
  el("pixChaveCaixa").classList.toggle("oculto", !p.chave);
}

try {
  const bruto = localStorage.getItem(CHAVE_CACHE_PIX);
  if (bruto) aplicarPix(normalizarFormularioIntencoes({ pix: JSON.parse(bruto) }).pix);
} catch { /* sem cache: espera a rede */ }

ouvirFormularioIntencoes((f) => {
  try { localStorage.setItem(CHAVE_CACHE_PIX, JSON.stringify(f.pix)); } catch { /* ignora */ }
  aplicarPix(f.pix);
});

let temporizadorCopiado = null;
function marcarPixCopiado() {
  const btn = el("btnCopiarPix");
  btn.textContent = "✓ Código copiado!";
  btn.classList.add("btn-copiado");
  mostrarToast("Código PIX copiado! Cole no seu aplicativo do banco.");
  clearTimeout(temporizadorCopiado);
  temporizadorCopiado = setTimeout(() => {
    btn.textContent = "Copiar PIX copia e cola";
    btn.classList.remove("btn-copiado");
  }, 3000);
}
// toque no botão = código copiado na hora. Se o aparelho bloquear a cópia automática, o código
// aparece na tela já selecionado, pra pessoa só copiar.
el("btnCopiarPix").addEventListener("click", async () => {
  const texto = pixAtual?.chave || "";
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    marcarPixCopiado();
    return;
  } catch { /* tenta o jeito antigo abaixo */ }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, texto.length);
    const copiou = document.execCommand("copy");
    campo.remove();
    if (copiou) { marcarPixCopiado(); return; }
  } catch { /* cai no último recurso */ }
  const caixa = el("pixChave");
  caixa.classList.remove("oculto");
  const range = document.createRange();
  range.selectNodeContents(caixa);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  mostrarToast("Não consegui copiar sozinho — o código está selecionado, é só copiar.");
});
