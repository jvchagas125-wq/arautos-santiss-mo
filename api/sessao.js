// API do "lembrar quem sou" do site público (função serverless da Vercel). Veja servidor/sessao.js.
//   GET    → devolve { ok, usuario } se este navegador tem o cookie de uma pessoa cadastrada
//   POST   → { telefoneDigits } guarda o cookie (se o telefone tem cadastro)
//   DELETE → apaga o cookie (botão "Sair")
import { firebaseConfig } from "../js/firebase-config.js";
import { criarClienteFirestore } from "../servidor/envio-listas.js";
import { processarSessao } from "../servidor/sessao.js";

function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const firestore = criarClienteFirestore({ projectId: firebaseConfig.projectId, apiKey: firebaseConfig.apiKey });
    const resultado = await processarSessao(
      { metodo: req.method, cabecalhoCookie: req.headers.cookie, corpo: lerCorpo(req) },
      { lerUsuario: async (digits) => (await firestore.lerDocumento(`usuarios/${digits}`))?.dados || null }
    );
    if (resultado.setCookie) res.setHeader("Set-Cookie", resultado.setCookie);
    return res.status(resultado.status).json(resultado.json);
  } catch (err) {
    console.error("Erro na API de sessão:", err);
    return res.status(500).json({ ok: false });
  }
}
