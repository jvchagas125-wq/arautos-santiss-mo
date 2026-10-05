// API do envio automático de listas de intenção por e-mail (função serverless da Vercel).
//
// Três formas de chamar:
//  1) Agendador (GitHub Actions, a cada ~10 min):  GET/POST com o cabeçalho
//       Authorization: Bearer <CRON_SECRET>
//     → envia todas as listas que já fecharam e ainda não foram enviadas.
//  2) Painel admin, botão "Enviar e-mail de teste":  POST { "acao": "teste", "usuarioId": "...", "chave": "..." }
//     → manda um documento Word de EXEMPLO pros e-mails cadastrados (não marca nada como enviado).
//     (usuarioId/chave identificam a conta de quem está logado no painel — ver js/contas.js — e a
//      conta precisa ter acesso à parte correspondente de "Intenções" — ver js/acessos.js.)
//  3) Painel admin, botão "Enviar por e-mail" numa lista:
//       POST { "acao": "enviar", "usuarioId": "...", "chave": "...", "dataMissa": "aaaa-mm-dd", "horaMissa": 10 }
//     → manda essa lista agora e a marca como enviada (o envio automático não repete).
//
// Variáveis de ambiente (configuradas na Vercel — NUNCA no código):
//   CRON_SECRET       senha do agendador (a mesma guardada no GitHub)
//   SMTP_USER         e-mail remetente (ex.: o Gmail da comunidade)
//   SMTP_PASS         senha de app desse e-mail
//   SMTP_HOST         (opcional) padrão smtp.gmail.com
//   SMTP_PORT         (opcional) padrão 465
//   EMAIL_REMETENTE   (opcional) endereço no "De:"; padrão = SMTP_USER
import { createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import * as docx from "docx";
import { firebaseConfig } from "../js/firebase-config.js";
import { temAcesso } from "../js/acessos.js";
import { construirDocxIntencoes } from "../js/docx-intencoes.js";
import {
  criarClienteFirestore, processarListasFechadas, montarEEnviarLista,
  normalizarConfigEnvio, idDocEnvio
} from "../servidor/envio-listas.js";

async function gerarDocumento(rotulo, itens) {
  return docx.Packer.toBuffer(construirDocxIntencoes(rotulo, itens, { docx }));
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
      from: `"Arautos do Evangelho - Intenções para a Santa Missa" <${remetente}>`,
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

// Confere id + chave com a conta guardada no Firestore (coleção "administradores").
// Devolve a conta (aprovada ou principal) ou null.
async function contaAutenticada(firestore, usuarioId, chave) {
  const id = String(usuarioId || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(id) || !/^[0-9a-f]{64}$/.test(String(chave || ""))) return null;
  const doc = await firestore.lerDocumento(`administradores/${id}`);
  const dados = doc?.dados;
  if (!dados || !dados.verificador) return null;
  const verificador = createHash("sha256").update(String(chave)).digest("hex");
  if (!textosIguais(verificador, dados.verificador)) return null;
  const conta = { id, ...dados };
  if (!conta.principal && conta.status !== "aprovado") return null;
  return conta;
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
      const dependencias = { firestore, gerarDocumento, enviarEmail };
      const resultado = await processarListasFechadas({ agora: new Date() }, dependencias);
      return res.status(200).json({ ok: true, ...resultado });
    }

    /* ---------- 2) e 3) painel admin ---------- */
    if (req.method !== "POST") return res.status(401).json({ ok: false, erro: "Não autorizado." });
    const corpo = lerCorpo(req);

    // quem chamou? o painel manda o id da conta e a "chave" derivada da senha (nunca a senha em si)
    const conta = await contaAutenticada(firestore, corpo.usuarioId, corpo.chave);
    if (!conta) {
      await new Promise((r) => setTimeout(r, 800)); // dificulta tentar adivinhar
      return res.status(401).json({ ok: false, erro: "Sessão inválida. Entre de novo no painel." });
    }
    const parteNecessaria = corpo.acao === "teste" ? "email" : "listas";
    if (!temAcesso(conta, "intencoes", parteNecessaria)) {
      return res.status(403).json({ ok: false, erro: "Você não tem permissão para usar esta função." });
    }

    const docEnvio = await firestore.lerDocumento("configuracoes/envioIntencoes");
    const configEnvio = normalizarConfigEnvio(docEnvio?.dados);
    if (configEnvio.emails.length === 0) {
      return res.status(400).json({ ok: false, erro: "Cadastre pelo menos um e-mail no painel e clique em Salvar antes." });
    }
    const dependencias = { firestore, gerarDocumento, enviarEmail: criarEnviadorDeEmail() };

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
