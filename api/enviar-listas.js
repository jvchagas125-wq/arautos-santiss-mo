// API do envio automático de listas de intenção por e-mail (função serverless da Vercel).
//
// Três formas de chamar:
//  1) Agendador (GitHub Actions, a cada ~10 min):  GET/POST com o cabeçalho
//       Authorization: Bearer <CRON_SECRET>
//     → envia todas as listas que já fecharam e ainda não foram enviadas.
//  2) Painel admin, botão "Enviar e-mail de teste":  POST { "acao": "teste", "senha": "..." }
//     → manda um PDF de EXEMPLO pros e-mails cadastrados (não marca nada como enviado).
//  3) Painel admin, botão "Enviar por e-mail" numa lista:
//       POST { "acao": "enviar", "senha": "...", "dataMissa": "aaaa-mm-dd", "horaMissa": 10 }
//     → manda essa lista agora e a marca como enviada (o envio automático não repete).
//
// Variáveis de ambiente (configuradas na Vercel — NUNCA no código):
//   CRON_SECRET       senha do agendador (a mesma guardada no GitHub)
//   SMTP_USER         e-mail remetente (ex.: o Gmail da comunidade)
//   SMTP_PASS         senha de app desse e-mail
//   SMTP_HOST         (opcional) padrão smtp.gmail.com
//   SMTP_PORT         (opcional) padrão 465
//   EMAIL_REMETENTE   (opcional) endereço no "De:"; padrão = SMTP_USER
import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import { firebaseConfig, SENHA_ADMIN_PADRAO } from "../js/firebase-config.js";
import { construirPdfIntencoes, CAMINHOS_FONTE_PDF } from "../js/pdf-intencoes.js";
import {
  criarClienteFirestore, processarListasFechadas, montarEEnviarLista,
  normalizarConfigEnvio, idDocEnvio
} from "../servidor/envio-listas.js";

const RAIZ_PROJETO = join(dirname(fileURLToPath(import.meta.url)), "..");

// Lê as fontes do PDF do disco (uma vez por instância da função) e devolve em base64.
let fontesBase64 = null;
function carregarFontes() {
  if (!fontesBase64) {
    fontesBase64 = Object.fromEntries(
      Object.entries(CAMINHOS_FONTE_PDF).map(([estilo, caminho]) =>
        [estilo, readFileSync(join(RAIZ_PROJETO, caminho)).toString("base64")]
      )
    );
  }
  return fontesBase64;
}

async function gerarPdf(rotulo, itens) {
  const doc = await construirPdfIntencoes(rotulo, itens, { jsPDF, fontesBase64: carregarFontes() });
  return Buffer.from(doc.output("arraybuffer"));
}

function criarEnviadorDeEmail() {
  const usuario = process.env.SMTP_USER;
  const senha = process.env.SMTP_PASS;
  if (!usuario || !senha) {
    const erro = new Error("O envio de e-mail ainda não foi configurado no servidor (faltam SMTP_USER e SMTP_PASS na Vercel).");
    erro.codigo = "SMTP_NAO_CONFIGURADO";
    throw erro;
  }
  const porta = Number(process.env.SMTP_PORT) || 465;
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: porta,
    secure: porta === 465,
    auth: { user: usuario, pass: senha }
  });
  const remetente = process.env.EMAIL_REMETENTE || usuario;
  return async ({ para, assunto, texto, anexo }) => {
    await transporte.sendMail({
      from: `"Arautos do Evangelho – Adoração" <${remetente}>`,
      to: para.join(", "),
      subject: assunto,
      text: texto,
      attachments: [{ filename: anexo.nome, content: anexo.conteudo, contentType: anexo.tipo }]
    });
  };
}

// Compara dois textos sem vazar (por tempo de resposta) quanto do começo está certo.
function textosIguais(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

const ITENS_DE_EXEMPLO = [
  { categoria: "gracas", texto: "Família Exemplo" },
  { categoria: "saude", texto: "Maria da Silva" },
  { categoria: "alma", texto: "José de Souza (3 anos)" },
  { categoria: "aniversarios", texto: "Ana Paula" }
];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const firestore = criarClienteFirestore({ projectId: firebaseConfig.projectId, apiKey: firebaseConfig.apiKey });

  try {
    const cabecalho = String(req.headers.authorization || "");
    const segredo = process.env.CRON_SECRET;
    const veioDoAgendador = !!segredo && textosIguais(cabecalho, `Bearer ${segredo}`);

    /* ---------- 1) agendador ---------- */
    if (veioDoAgendador) {
      // o enviador de e-mail só é criado (e só exige SMTP_USER/SMTP_PASS) quando de fato houver lista pra enviar
      let enviador = null;
      const enviarEmail = async (dados) => { enviador ||= criarEnviadorDeEmail(); return enviador(dados); };
      const dependencias = { firestore, gerarPdf, enviarEmail };
      const resultado = await processarListasFechadas({ agora: new Date() }, dependencias);
      return res.status(200).json({ ok: true, ...resultado });
    }

    /* ---------- 2) e 3) painel admin ---------- */
    if (req.method !== "POST") return res.status(401).json({ ok: false, erro: "Não autorizado." });
    const corpo = lerCorpo(req);

    const docAdmin = await firestore.lerDocumento("configuracoes/admin");
    const senhaCorreta = docAdmin?.dados?.senha || SENHA_ADMIN_PADRAO;
    if (!corpo.senha || !textosIguais(corpo.senha, senhaCorreta)) {
      await new Promise((r) => setTimeout(r, 800)); // dificulta tentar adivinhar a senha
      return res.status(401).json({ ok: false, erro: "Senha do painel incorreta." });
    }

    const docEnvio = await firestore.lerDocumento("configuracoes/envioIntencoes");
    const configEnvio = normalizarConfigEnvio(docEnvio?.dados);
    if (configEnvio.emails.length === 0) {
      return res.status(400).json({ ok: false, erro: "Cadastre pelo menos um e-mail no painel e clique em Salvar antes." });
    }
    const dependencias = { firestore, gerarPdf, enviarEmail: criarEnviadorDeEmail() };

    if (corpo.acao === "teste") {
      const hoje = new Date().toISOString().slice(0, 10);
      const { rotulo } = await montarEEnviarLista(
        { dataMissa: hoje, horaMissa: 10, destinatarios: configEnvio.emails, teste: true, itens: ITENS_DE_EXEMPLO },
        dependencias
      );
      return res.status(200).json({ ok: true, destinatarios: configEnvio.emails, rotulo });
    }

    if (corpo.acao === "enviar") {
      const dataMissa = String(corpo.dataMissa || "");
      const horaMissa = Number(corpo.horaMissa);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataMissa) || !Number.isInteger(horaMissa) || horaMissa < 0 || horaMissa > 23) {
        return res.status(400).json({ ok: false, erro: "Lista inválida." });
      }
      const { rotulo, total } = await montarEEnviarLista(
        { dataMissa, horaMissa, destinatarios: configEnvio.emails },
        dependencias
      );
      // marca como enviada — assim o envio automático não manda a mesma lista de novo
      const id = idDocEnvio(dataMissa, horaMissa);
      const dadosEnvio = {
        status: "enviado", total, enviadoEm: new Date().toISOString(), destinatarios: configEnvio.emails,
        erro: "", semEnvio: false, manual: true, dataMissa, horaMissa
      };
      const criou = await firestore.criarSeNaoExiste("configuracoes", id, { ...dadosEnvio, tentativas: 0 });
      if (!criou) await firestore.atualizar(`configuracoes/${id}`, dadosEnvio);
      return res.status(200).json({ ok: true, destinatarios: configEnvio.emails, rotulo, total });
    }

    return res.status(400).json({ ok: false, erro: "Ação desconhecida." });
  } catch (erro) {
    console.error("[enviar-listas]", erro?.message || erro);
    const status = erro?.codigo === "SMTP_NAO_CONFIGURADO" ? 500 : 502;
    return res.status(status).json({ ok: false, erro: String(erro?.message || "Falha ao enviar.").slice(0, 300) });
  }
}
