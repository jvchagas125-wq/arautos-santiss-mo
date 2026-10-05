// Senhas das contas do painel administrativo — compartilhado entre o navegador e o servidor.
//
// A senha NUNCA é guardada (nem no Firestore, nem no aparelho). O que existe é:
//  - "sal": texto aleatório próprio de cada conta (guardado no Firestore);
//  - "chave": resultado de uma conta matemática lenta (PBKDF2) feita com a senha + o sal. É um
//    segredo derivado da senha; fica só no aparelho de quem entrou (pra continuar logado) e é
//    o que o painel manda pro servidor pra provar quem é;
//  - "verificador": uma "impressão digital" (SHA-256) da chave, guardada no Firestore. Dá pra
//    conferir se uma chave/senha está certa comparando com ele, mas não dá pra voltar dele até
//    a senha nem até a chave.
const ITERACOES = 150000;

const paraHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

export function gerarSal() {
  return paraHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivarChave(senha, salHex) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: deHex(salHex), iterations: ITERACOES, hash: "SHA-256" }, material, 256
  );
  return paraHex(bits);
}

export async function verificadorDaChave(chaveHex) {
  return paraHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chaveHex)));
}

// Credenciais novas pra uma senha: { sal, verificador, chave }. (guarda sal + verificador no Firestore)
export async function criarCredenciais(senha) {
  const sal = gerarSal();
  const chave = await derivarChave(senha, sal);
  return { sal, verificador: await verificadorDaChave(chave), chave };
}

// A senha digitada é a dessa conta? Devolve a chave (pra guardar na sessão) ou null.
export async function conferirSenha(senha, conta) {
  if (!conta || !conta.sal || !conta.verificador) return null;
  const chave = await derivarChave(senha, conta.sal);
  return (await verificadorDaChave(chave)) === conta.verificador ? chave : null;
}

// A chave guardada na sessão ainda é a dessa conta?
export async function chaveConfere(chaveHex, conta) {
  if (!chaveHex || !conta || !conta.verificador) return false;
  return (await verificadorDaChave(String(chaveHex))) === conta.verificador;
}

export const TAMANHO_MINIMO_SENHA = 6;
