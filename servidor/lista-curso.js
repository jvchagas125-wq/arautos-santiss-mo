// Envio por e-mail da LISTA DE INSCRITOS de um curso (Excel, Word e PDF) — roda no SERVIDOR (Vercel).
// Dois jeitos de disparar (quem chama é api/enviar-listas.js):
//  1) Automático: o agendador (cron-job.org, a cada 5 min; os cursos são conferidos a cada ~15 min) chama processarCursosEncerrados, que procura
//     cursos cujas inscrições encerraram (na data programada ou "na mão" pelo painel) e ainda não tiveram a lista
//     enviada, e manda para os e-mails cadastrados em Inscritos (CRM) > E-mails que recebem a lista de inscritos.
//     Cada encerramento é enviado uma única vez (o "carimbo" fica em configuracoes/envioCurso_<id>).
//  2) Manual: botão "Enviar por e-mail" no painel (Inscrições de cursos > Inscritos) -> enviarListaDoCurso.
// Tudo que fala com o mundo de fora (Firestore, geração dos arquivos, e-mail) entra por parâmetro, para poder
// ser testado sem internet.
import { normalizarCurso, chaveEncerramento } from "../js/cursos-comum.js";
import { normalizarConfigEnvio } from "./envio-listas.js";

const MAX_TENTATIVAS = 5;
const ENVIANDO_EXPIRA_MINUTOS = 15;
const DESLOCAMENTO_BRASILIA_HORAS = -3;

const doisDigitos = (n) => String(n).padStart(2, "0");
// "dd/mm/aaaa" no horário de Brasília
export function dataDeHoje(agora = new Date()) {
  const d = new Date(agora.getTime() + DESLOCAMENTO_BRASILIA_HORAS * 3600000);
  return `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
export const idDocEnvioCurso = (cursoId) => `envioCurso_${cursoId}`;
const limpar = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const ID_VALIDO = /^[A-Za-z0-9_-]{4,60}$/;

// Gera os 3 arquivos com as bibliotecas do npm (carregadas só quando há mesmo o que enviar).
// Devolve [{ nome, conteudo, tipo }] — é o "gerarAnexos" que a API entrega às funções abaixo.
export async function gerarAnexosDaLista(curso, inscricoes, { docx, hoje }) {
  const { default: ExcelJS } = await import("exceljs");
  const modPdf = await import("jspdf");
  const jsPDF = modPdf.jsPDF || modPdf.default?.jsPDF;
  const modTabela = await import("jspdf-autotable");
  const autoTableFn = [modTabela.default, modTabela.default?.default, modTabela.autoTable].find((f) => typeof f === "function");
  if (!jsPDF || !autoTableFn) throw new Error("Não foi possível carregar o gerador de PDF no servidor.");
  const { construirExcel, construirWord, construirPdf } = await import("../js/inscritos-documentos.js");
  const { tabelaDeInscritos } = await import("../js/cursos-comum.js");

  const slug = String(curso.nome || "curso").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "curso";
  const wb = construirExcel(curso, tabelaDeInscritos(curso, inscricoes), { ExcelJS, hoje });
  const doc = construirWord(curso, inscricoes, { docx, hoje });
  const pdf = construirPdf(curso, inscricoes, { jsPDF, autoTable: (d, o) => autoTableFn(d, o), hoje });
  return [
    { nome: `inscritos-${slug}.xlsx`, conteudo: Buffer.from(await wb.xlsx.writeBuffer()), tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { nome: `lista-presenca-${slug}.docx`, conteudo: Buffer.from(await docx.Packer.toBuffer(doc)), tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { nome: `lista-presenca-${slug}.pdf`, conteudo: Buffer.from(pdf.output("arraybuffer")), tipo: "application/pdf" }
  ];
}

// Monta o e-mail (com os 3 anexos) e envia. dependencias = { firestore, gerarAnexos(curso, inscricoes), enviarEmail }.
export async function enviarListaDoCurso({ cursoId, destinatarios, encerramento = true }, dependencias, agora = new Date()) {
  const { firestore, gerarAnexos, enviarEmail } = dependencias;
  const id = String(cursoId || "");
  if (!ID_VALIDO.test(id)) throw new Error("Curso inválido.");
  const docCurso = await firestore.lerDocumento(`cursos/${id}`);
  if (!docCurso) throw new Error("O curso não existe mais.");
  const curso = normalizarCurso(id, docCurso.dados);
  const inscricoes = await firestore.consultarColecao("inscricoes", "cursoId", id);
  const total = inscricoes.length;
  const anexos = await gerarAnexos(curso, inscricoes, { hoje: dataDeHoje(agora) });
  const comAceite = curso.pedirAceiteContato ? inscricoes.filter((i) => i.aceitaContato === true).length : null;
  const nome = limpar(curso.nome, 120);
  const assunto = encerramento
    ? `Inscrições encerradas — ${nome} (${total} ${total === 1 ? "inscrito" : "inscritos"})`
    : `Lista de inscritos — ${nome} (${total} ${total === 1 ? "inscrito" : "inscritos"})`;
  const texto = [
    "Paz de Cristo!",
    "",
    encerramento ? `As inscrições de "${nome}" foram encerradas.` : `Lista de inscritos de "${nome}".`,
    total === 0 ? "Ninguém se inscreveu neste curso." : `${total} ${total === 1 ? "pessoa inscrita" : "pessoas inscritas"}.`,
    ...(comAceite !== null ? [`${comAceite} ${comAceite === 1 ? "aceitou" : "aceitaram"} receber convites e informativos.`] : []),
    "",
    "Em anexo:",
    "• Excel — todos os dados e respostas dos inscritos;",
    "• Word e PDF — lista de presença (uma pessoa por linha, com caixa para marcar), mais uma folha em branco para cadastrar pessoas na hora.",
    "",
    "— Arautos do Evangelho Campos (envio automático)"
  ].join("\n");
  await enviarEmail({ para: destinatarios, assunto, texto, anexos, nomeRemetente: `Arautos do Evangelho Campos - ${limpar(curso.nome, 80)}` });
  return { total, curso };
}

// Rotina do agendador: envia a lista de cada curso que encerrou e ainda não foi enviada.
export async function processarCursosEncerrados({ agora = new Date() } = {}, dependencias) {
  const { firestore } = dependencias;
  const docEnvio = await firestore.lerDocumento("configuracoes/envioIntencoes");
  const configEnvio = normalizarConfigEnvio(docEnvio?.dados);
  const cursos = (await firestore.listarColecao("cursos")).map((c) => normalizarCurso(c.id, c));
  const relatorio = [];
  const candidatos = cursos.filter((c) => c.nome && ID_VALIDO.test(c.id) && chaveEncerramento(c, agora.getTime()));
  if (candidatos.length === 0) return { relatorio, mensagem: "Nenhum curso com inscrições recém-encerradas." };
  if (configEnvio.emailsInscritos.length === 0) return { relatorio, mensagem: "Nenhum e-mail cadastrado em Inscritos (CRM) > E-mails que recebem a lista de inscritos." };

  for (const curso of candidatos) {
    const chave = chaveEncerramento(curso, agora.getTime());
    const idDoc = idDocEnvioCurso(curso.id);
    const caminho = `configuracoes/${idDoc}`;
    const item = { cursoId: curso.id, curso: curso.nome };
    let reservou = false; // só depois de reservar é que um erro pode marcar o registro como "erro" (ver servidor/envio-listas.js)
    try {
      const existente = await firestore.lerDocumento(caminho);
      if (!existente) {
        const criou = await firestore.criarSeNaoExiste("configuracoes", idDoc, { status: "enviando", chave, tentativas: 1, iniciadoEm: agora.toISOString(), cursoId: curso.id });
        if (!criou) { relatorio.push({ ...item, resultado: "ignorada (outra execução já reservou)" }); continue; }
        reservou = true;
      } else {
        const d = existente.dados;
        const mesmoEncerramento = d.chave === chave;
        // "enviadoEm" nunca é apagado: mesmo que o status tenha sido sobrescrito por engano, esta lista já saiu.
        if (mesmoEncerramento && d.status !== "enviado" && d.enviadoEm) {
          try { await firestore.atualizar(caminho, { status: "enviado" }); } catch { /* só correção do registro */ }
          relatorio.push({ ...item, resultado: "já enviada" }); continue;
        }
        if (mesmoEncerramento && d.status === "enviado") { relatorio.push({ ...item, resultado: "já enviada" }); continue; }
        if (mesmoEncerramento && d.status === "enviando" && agora - new Date(d.iniciadoEm || 0) < ENVIANDO_EXPIRA_MINUTOS * 60000) { relatorio.push({ ...item, resultado: "em andamento" }); continue; }
        if (mesmoEncerramento && (d.tentativas || 0) >= MAX_TENTATIVAS) { relatorio.push({ ...item, resultado: "desistiu após várias tentativas" }); continue; }
        const conseguiu = await firestore.atualizar(caminho, {
          status: "enviando", chave, tentativas: mesmoEncerramento ? (d.tentativas || 0) + 1 : 1, iniciadoEm: agora.toISOString(), erro: ""
        }, existente.updateTime);
        if (!conseguiu) { relatorio.push({ ...item, resultado: "ignorada (outra execução já reservou)" }); continue; }
        reservou = true;
      }
      const { total } = await enviarListaDoCurso({ cursoId: curso.id, destinatarios: configEnvio.emailsInscritos, encerramento: true }, dependencias, agora);
      await firestore.atualizar(caminho, { status: "enviado", total, enviadoEm: new Date().toISOString(), destinatarios: configEnvio.emailsInscritos, erro: "" });
      relatorio.push({ ...item, resultado: "enviada", total });
    } catch (erro) {
      const mensagem = String(erro?.message || erro).slice(0, 300);
      if (reservou) {
        try { await firestore.atualizar(caminho, { status: "erro", erro: mensagem }); } catch { /* não derruba a rodada */ }
      }
      relatorio.push({ ...item, resultado: "erro", erro: mensagem });
    }
  }
  return { relatorio };
}

