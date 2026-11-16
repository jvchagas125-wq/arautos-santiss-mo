// Lógica do "cookie de sessão" do site público (roda no SERVIDOR, na Vercel — quem chama é api/sessao.js).
//
// Para que quem já se identificou (telefone + nome) não precise digitar o telefone de novo, o servidor guarda um
// cookie com o telefone da pessoa. Diferente do que o próprio site grava no aparelho (localStorage etc., que o
// Safari do iPhone apaga depois de 7 dias sem uso), um cookie definido pelo SERVIDOR dura bem mais (400 dias).
// A identificação do site sempre foi só o telefone (sem senha), então este cookie não dá poder nenhum a mais:
// ele só "lembra" o telefone que a pessoa já tinha digitado. "Sair" apaga o cookie.
export const NOME_COOKIE = "arautos_sessao";
export const SEGUNDOS_COOKIE = 400 * 24 * 60 * 60;

const REGEX_TELEFONE = /^\d{10,13}$/;

export function lerCookie(cabecalho, nome = NOME_COOKIE) {
  const par = String(cabecalho || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(nome + "="));
  if (!par) return "";
  try { return decodeURIComponent(par.slice(nome.length + 1)); } catch { return ""; }
}

export function cookieDaSessao(telefoneDigits) {
  return `${NOME_COOKIE}=${telefoneDigits}; Max-Age=${SEGUNDOS_COOKIE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
export function cookieApagado() {
  return `${NOME_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function telefoneBonito(d) {
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d;
}

function usuarioDoCadastro(digits, dados) {
  return { nome: String(dados.nome), telefone: String(dados.telefone || telefoneBonito(digits)), telefoneDigits: digits };
}

// metodo: "GET" (quem sou eu?), "POST" (lembrar este telefone) ou "DELETE" (sair).
// dependencias.lerUsuario(digits) devolve os dados do cadastro (coleção "usuarios") ou null.
// Devolve { status, json, setCookie? }.
export async function processarSessao({ metodo, cabecalhoCookie, corpo }, { lerUsuario }) {
  const m = String(metodo || "").toUpperCase();

  if (m === "DELETE") return { status: 200, json: { ok: true }, setCookie: cookieApagado() };

  if (m === "GET") {
    const digits = lerCookie(cabecalhoCookie);
    if (!REGEX_TELEFONE.test(digits)) return { status: 200, json: { ok: false } };
    const dados = await lerUsuario(digits);
    if (!dados || !dados.nome) return { status: 200, json: { ok: false }, setCookie: cookieApagado() }; // cadastro removido
    return { status: 200, json: { ok: true, usuario: usuarioDoCadastro(digits, dados) }, setCookie: cookieDaSessao(digits) }; // renova o prazo
  }

  if (m === "POST") {
    const digits = String(corpo && corpo.telefoneDigits || "");
    if (!REGEX_TELEFONE.test(digits)) return { status: 400, json: { ok: false } };
    const dados = await lerUsuario(digits);
    if (!dados || !dados.nome) return { status: 200, json: { ok: false } };
    return { status: 200, json: { ok: true }, setCookie: cookieDaSessao(digits) };
  }

  return { status: 405, json: { ok: false } };
}
