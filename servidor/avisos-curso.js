// Envio de um aviso do quadro de avisos de um curso para todos os inscritos que informaram e-mail.
// Roda no servidor (chamado por api/enviar-listas.js, ação "avisoCurso").
import { normalizarCurso, emailsDosInscritos } from "../js/cursos-comum.js";

const TAMANHO_LOTE = 40; // destinatários por e-mail (em cópia oculta)

const limpar = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

// dependencias: { firestore, criarEnviador }  (criarEnviador só é chamado quando há mesmo o que enviar)
export async function enviarAvisoDoCurso({ avisoId }, { firestore, criarEnviador }) {
  const id = String(avisoId || "");
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(id)) return { ok: false, erro: "Aviso inválido." };

  const docAviso = await firestore.lerDocumento(`avisosCursos/${id}`);
  if (!docAviso) return { ok: false, erro: "Aviso não encontrado. Ele pode ter sido apagado." };
  const aviso = docAviso.dados;
  const cursoId = String(aviso.cursoId || "");
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(cursoId)) return { ok: false, erro: "Aviso sem curso." };

  const docCurso = await firestore.lerDocumento(`cursos/${cursoId}`);
  if (!docCurso) return { ok: false, erro: "O curso deste aviso não existe mais." };
  const curso = normalizarCurso(cursoId, docCurso.dados);

  const inscricoes = await firestore.consultarColecao("inscricoes", "cursoId", cursoId);
  const emails = emailsDosInscritos(inscricoes);
  const semEmail = inscricoes.length - inscricoes.filter((i) => emailsDosInscritos([i]).length > 0).length;
  if (inscricoes.length === 0) return { ok: false, erro: "Este curso ainda não tem inscritos." };
  if (emails.length === 0) {
    return { ok: false, erro: "Nenhum inscrito informou e-mail. Peça o e-mail no formulário do curso para poder enviar avisos." };
  }

  const titulo = limpar(aviso.titulo, 200) || "Aviso";
  const corpo = String(aviso.texto || "").trim();
  const texto = [
    `Paz de Cristo!`,
    ``,
    `Aviso sobre: ${curso.nome}`,
    ``,
    titulo,
    ``,
    corpo,
    ``,
    `— Arautos do Evangelho, Campos dos Goytacazes`,
    `Você recebeu este e-mail porque se inscreveu em "${curso.nome}".`
  ].join("\n");

  const enviar = criarEnviador();
  const nomeRemetente = `Arautos do Evangelho Campos - ${limpar(curso.nome, 80)}`;
  for (let i = 0; i < emails.length; i += TAMANHO_LOTE) {
    await enviar({
      copiaOculta: emails.slice(i, i + TAMANHO_LOTE),
      assunto: `${limpar(curso.nome, 80)}: ${titulo}`.slice(0, 200),
      texto,
      nomeRemetente
    });
  }

  await firestore.atualizar(`avisosCursos/${id}`, { emailEnviadoEm: new Date().toISOString(), emailTotal: emails.length });
  return { ok: true, total: emails.length, semEmail };
}
