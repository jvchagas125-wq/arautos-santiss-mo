// Lógica do envio automático das listas de intenção por e-mail (roda no SERVIDOR, na Vercel —
// quem chama é api/enviar-listas.js). Fica separada do "handler" pra poder ser testada sem
// internet: tudo que fala com o mundo de fora (Firestore, geração do documento, e-mail) entra por
// parâmetro (veja "dependencias" em processarListasFechadas).
//
// Como funciona, resumindo: a cada 5 minutos o agendador (cron-job.org) chama a API; a API olha os
// horários de missa configurados no painel, descobre quais listas JÁ fecharam (horário da missa
// menos "horas antes") e ainda não foram enviadas, gera o documento Word de cada uma e manda por e-mail
// pros endereços cadastrados no painel administrativo. Cada lista é enviada uma única vez —
// o "carimbo" de envio fica guardado no Firestore (coleção configuracoes, doc "envio_DATA_HORA").
import {
  horariosDoDia, normalizarConfigIntencoes, normalizarFormularioIntencoes, categoriasPermitidasDaMissa,
  regraDeFechamentoDaMissa, momentoDeFechamento
} from "../js/utils.js";
import { rotuloListaIntencao, nomeArquivoDocx } from "../js/docx-intencoes.js";

// Brasil não tem mais horário de verão desde 2019: Brasília é sempre UTC-3.
const DESLOCAMENTO_BRASILIA_HORAS = -3;
const HORAS_ANTES_PADRAO = 3;
// Depois da missa, ainda por quanto tempo vale a pena enviar a lista que "ficou pra trás"
// (ex.: o agendador atrasou). Passou disso, a lista é considerada perdida e não é mais enviada.
const FOLGA_APOS_MISSA_HORAS = 2;
const MAX_TENTATIVAS = 5;
const PRAZO_FIRESTORE_MS = 8000;
const ENVIANDO_EXPIRA_MINUTOS = 15;

/* ---------------- Datas (sempre no horário de Brasília) ---------------- */

const doisDigitos = (n) => String(n).padStart(2, "0");

// "Data de hoje no Brasil" a partir de um instante qualquer (UTC), como componentes.
function dataNoBrasil(instante) {
  const d = new Date(instante.getTime() + DESLOCAMENTO_BRASILIA_HORAS * 3600000);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

export function isoDe({ ano, mes, dia }) {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

// Soma dias a uma data ISO (aaaa-mm-dd), sem depender do fuso do servidor.
function somarDiasIso(iso, dias) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return isoDe({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() });
}

// Instante (UTC) exato em que a missa de "iso" às "hora" (horário de Brasília) começa.
export function instanteDaMissa(iso, hora, minuto = 0) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, Number(hora) - DESLOCAMENTO_BRASILIA_HORAS, Number(minuto), 0, 0));
}

// Instante (UTC) em que a lista da missa de "iso" às "hora" fecha, seguindo a regra que vale para ela
// (horas antes ou horário fixo — veja regraDeFechamentoDaMissa em js/utils.js). Nunca depois da missa.
export function instanteDeFechamento(config, iso, hora) {
  const missa = instanteDaMissa(iso, hora);
  const { regra } = regraDeFechamentoDaMissa(config, iso, hora);
  const momento = momentoDeFechamento(regra, iso);
  const fechamento = momento.horasAntes != null
    ? new Date(missa.getTime() - momento.horasAntes * 3600000)
    : instanteDaMissa(momento.iso, momento.hora, momento.minuto);
  return fechamento > missa ? missa : fechamento;
}

/* ---------------- Configurações ---------------- */

// A leitura da configuração (aceita os formatos novo e antigo) é a mesma do navegador: vive em js/utils.js.
export { normalizarConfigIntencoes };

const REGEX_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function normalizarConfigEnvio(dados) {
  const emails = Array.isArray(dados?.emails)
    ? dados.emails.map((e) => String(e || "").trim()).filter((e) => REGEX_EMAIL.test(e))
    : [];
  const emailsInscritos = Array.isArray(dados?.emailsInscritos)
    ? dados.emailsInscritos.map((e) => String(e || "").trim()).filter((e) => REGEX_EMAIL.test(e))
    : [];
  return {
    ativo: dados?.ativo === true,
    emails: [...new Set(emails)],
    emailsInscritos: [...new Set(emailsInscritos)],
    enviarVazias: dados?.enviarVazias === true
  };
}

/* ---------------- Quais listas já fecharam? ---------------- */

// Devolve as listas (data + hora) cujo fechamento já passou e cuja missa ainda não está "velha
// demais" pra valer o envio. Olha de ontem até uma semana à frente (uma lista pode fechar dias antes da
// missa, se o horário de fechamento for na véspera ou antes).
export function listasParaEnviar(config, agora = new Date()) {
  const hoje = isoDe(dataNoBrasil(agora));
  const resultado = [];
  for (let delta = -1; delta <= 8; delta++) {
    const iso = somarDiasIso(hoje, delta);
    for (const hora of horariosDoDia(config, iso)) {
      const missa = instanteDaMissa(iso, hora);
      const fechamento = instanteDeFechamento(config, iso, hora);
      const limite = new Date(missa.getTime() + FOLGA_APOS_MISSA_HORAS * 3600000);
      if (agora >= fechamento && agora < limite) resultado.push({ dataMissa: iso, horaMissa: Number(hora) });
    }
  }
  return resultado;
}

/* ---------------- Firestore via REST ---------------- */
// O site já fala com o Firestore direto do navegador usando a chave pública do firebaseConfig;
// o servidor usa exatamente a mesma chave e as mesmas regras — não precisa de nenhuma credencial
// extra do Firebase.

export function criarClienteFirestore({ projectId, apiKey, fetchFn = fetch }) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const sufixoChave = `key=${encodeURIComponent(apiKey)}`;

  function decodificar(valor) {
    if (valor == null) return null;
    if ("stringValue" in valor) return valor.stringValue;
    if ("integerValue" in valor) return Number(valor.integerValue);
    if ("doubleValue" in valor) return Number(valor.doubleValue);
    if ("booleanValue" in valor) return valor.booleanValue;
    if ("timestampValue" in valor) return valor.timestampValue;
    if ("arrayValue" in valor) return (valor.arrayValue.values || []).map(decodificar);
    if ("mapValue" in valor) return decodificarCampos(valor.mapValue.fields || {});
    return null;
  }
  function decodificarCampos(campos) {
    return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, decodificar(v)]));
  }
  function codificar(valor) {
    if (valor === null || valor === undefined) return { nullValue: null };
    if (typeof valor === "string") return { stringValue: valor };
    if (typeof valor === "boolean") return { booleanValue: valor };
    if (typeof valor === "number") {
      return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
    }
    if (Array.isArray(valor)) return { arrayValue: { values: valor.map(codificar) } };
    return { mapValue: { fields: codificarCampos(valor) } };
  }
  function codificarCampos(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, codificar(v)]));
  }

  // Toda chamada tem prazo: sem isso, uma resposta que nunca chega deixa a função pendurada até a Vercel derrubá-la —
  // possivelmente DEPOIS do e-mail já ter saído e ANTES de registrar "enviado" (a lista seria reenviada 15 min depois).
  async function chamar(url, opcoes = {}) {
    const resposta = await fetchFn(url, { ...opcoes, signal: AbortSignal.timeout(PRAZO_FIRESTORE_MS) });
    const texto = await resposta.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
    return { status: resposta.status, ok: resposta.ok, json };
  }

  return {
    // Lê um documento. Devolve null se não existir; senão { dados, updateTime }.
    async lerDocumento(caminho) {
      const r = await chamar(`${base}/${caminho}?${sufixoChave}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Firestore (ler ${caminho}) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
      return { dados: decodificarCampos(r.json.fields || {}), updateTime: r.json.updateTime };
    },

    // Cria um documento SÓ se ele ainda não existir. Devolve true se criou, false se já existia
    // (é isso que impede dois envios simultâneos da mesma lista).
    async criarSeNaoExiste(colecao, idDoc, dados) {
      const r = await chamar(`${base}/${colecao}?documentId=${encodeURIComponent(idDoc)}&${sufixoChave}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: codificarCampos(dados) })
      });
      if (r.status === 409) return false;
      if (!r.ok) throw new Error(`Firestore (criar ${colecao}/${idDoc}) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
      return true;
    },

    // Atualiza só os campos informados. Se "updateTimeEsperado" vier, só atualiza se ninguém mexeu
    // no documento nesse meio tempo (devolve false se mexeram).
    async atualizar(caminho, dados, updateTimeEsperado) {
      const mascara = Object.keys(dados).map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join("&");
      const precondicao = updateTimeEsperado ? `&currentDocument.updateTime=${encodeURIComponent(updateTimeEsperado)}` : "";
      const r = await chamar(`${base}/${caminho}?${mascara}${precondicao}&${sufixoChave}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: codificarCampos(dados) })
      });
      if (r.status === 409 || (r.status === 400 && /FAILED_PRECONDITION/.test(r.json?.error?.status || ""))) return false;
      if (!r.ok) throw new Error(`Firestore (atualizar ${caminho}) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
      return true;
    },

    // Todos os documentos de uma coleção em que "campo" == valor (texto). Devolve [{ id, ...dados }].
    async consultarColecao(colecao, campo, valor) {
      const r = await chamar(`${base}:runQuery?${sufixoChave}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: colecao }],
            where: { fieldFilter: { field: { fieldPath: campo }, op: "EQUAL", value: { stringValue: String(valor) } } }
          }
        })
      });
      if (!r.ok) throw new Error(`Firestore (consultar ${colecao}) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
      return (r.json || []).filter((x) => x.document).map((x) => ({
        id: String(x.document.name || "").split("/").pop(),
        ...decodificarCampos(x.document.fields || {})
      }));
    },

    // Todos os documentos de uma coleção (de página em página). Devolve [{ id, ...dados }].
    async listarColecao(colecao) {
      const todos = [];
      let pagina = "";
      for (let i = 0; i < 20; i++) {
        const r = await chamar(`${base}/${colecao}?pageSize=100${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}&${sufixoChave}`);
        if (!r.ok) throw new Error(`Firestore (listar ${colecao}) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
        (r.json?.documents || []).forEach((d) => todos.push({ id: String(d.name || "").split("/").pop(), ...decodificarCampos(d.fields || {}) }));
        pagina = r.json?.nextPageToken || "";
        if (!pagina) break;
      }
      return todos;
    },

    // Todas as intenções de uma lista (data + hora).
    async intencoesDaLista(dataMissa, horaMissa) {
      const r = await chamar(`${base}:runQuery?${sufixoChave}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "intencoes" }],
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  { fieldFilter: { field: { fieldPath: "dataMissa" }, op: "EQUAL", value: { stringValue: dataMissa } } },
                  { fieldFilter: { field: { fieldPath: "horaMissa" }, op: "EQUAL", value: { integerValue: String(horaMissa) } } }
                ]
              }
            }
          }
        })
      });
      if (!r.ok) throw new Error(`Firestore (consultar intenções) respondeu ${r.status}: ${r.json?.error?.message || ""}`);
      // "rascunho" é o que a pessoa ainda não enviou (ver js/dados.js) — nunca entra na lista da missa.
      return (r.json || []).filter((x) => x.document).map((x) => decodificarCampos(x.document.fields || {}))
        .filter((it) => it.tipo !== "rascunho");
    }
  };
}

/* ---------------- Envio de UMA lista ---------------- */

export function idDocEnvio(dataMissa, horaMissa) {
  return `envio_${dataMissa}_${doisDigitos(horaMissa)}`;
}

// Monta o documento Word e o e-mail de uma lista e envia. "dependencias" = { firestore, gerarDocumento, enviarEmail }.
export async function montarEEnviarLista({ dataMissa, horaMissa, destinatarios, teste = false, itens: itensProntos = null }, dependencias) {
  const { firestore, gerarDocumento, enviarEmail } = dependencias;
  const itens = itensProntos || (await firestore.intencoesDaLista(dataMissa, horaMissa));
  const rotulo = rotuloListaIntencao(dataMissa, horaMissa);
  // categorias editáveis no painel (configuracoes/intencoesForm); se não der pra ler, usa as de fábrica
  let categorias;
  try {
    const docForm = await firestore.lerDocumento("configuracoes/intencoesForm");
    categorias = normalizarFormularioIntencoes(docForm?.dados).categorias;
  } catch { categorias = normalizarFormularioIntencoes(null).categorias; }
  // categorias liberadas só para esta missa (dias com horário diferente); sem restrição = todas
  let categoriasPermitidas = null;
  try {
    const docConfigMissa = await firestore.lerDocumento("configuracoes/intencoes");
    categoriasPermitidas = categoriasPermitidasDaMissa(normalizarConfigIntencoes(docConfigMissa?.dados), dataMissa, horaMissa);
  } catch { categoriasPermitidas = null; }
  const arquivo = await gerarDocumento(rotulo, itens, { categorias, categoriasPermitidas });
  const liberadas = categoriasPermitidas ? new Set(categoriasPermitidas) : null;
  const total = liberadas ? itens.filter((it) => liberadas.has(it.categoria)).length : itens.length;
  const assunto = `${teste ? "[TESTE] " : ""}Intenções da Santa Missa — ${rotulo}`;
  const texto = [
    teste ? "Este é um e-mail de TESTE (a lista abaixo é só um exemplo)." : "A lista de intenções abaixo acabou de fechar.",
    "",
    `${rotulo}`,
    total === 0 ? "Ninguém enviou intenções para esta missa." : `${total} ${total === 1 ? "intenção enviada" : "intenções enviadas"}.`,
    "",
    "O documento Word com as intenções está em anexo — pode editar e imprimir.",
    "",
    "— Arautos do Evangelho Campos (envio automático)"
  ].join("\n");
  await enviarEmail({
    para: destinatarios,
    assunto,
    texto,
    anexo: { nome: nomeArquivoDocx(rotulo), conteudo: arquivo, tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
  });
  return { rotulo, total };
}

// Grava no Firestore tentando de novo se falhar (instabilidade, cota...). Usado para registrar "enviado" logo
// depois que o e-mail SAIU: se esse registro se perdesse, a próxima rodada mandaria a mesma lista outra vez.
export async function atualizarComRetentativas(firestore, caminho, dados, esperasMs = [0, 700, 1800, 4000]) {
  let ultimoErro;
  for (const espera of esperasMs) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try { await firestore.atualizar(caminho, dados); return; } catch (erro) { ultimoErro = erro; }
  }
  throw ultimoErro;
}

/* ---------------- Rotina principal (chamada pelo agendador) ---------------- */

// Percorre as listas que já fecharam e envia cada uma que ainda não foi enviada.
// Devolve um relatório (um item por lista) — a API devolve isso como JSON, e o histórico do
// cron-job.org mostra o que aconteceu a cada rodada.
export async function processarListasFechadas({ agora = new Date() } = {}, dependencias, opcoes = {}) {
  const { firestore } = dependencias;
  const esperas = opcoes.esperasMs; // (testes) intervalos entre tentativas de gravação

  const docEnvio = await firestore.lerDocumento("configuracoes/envioIntencoes");
  const configEnvio = normalizarConfigEnvio(docEnvio?.dados);
  if (!configEnvio.ativo) return { ativo: false, relatorio: [], mensagem: "Envio automático desligado no painel." };
  if (configEnvio.emails.length === 0) return { ativo: true, relatorio: [], mensagem: "Nenhum e-mail cadastrado no painel." };

  const docConfig = await firestore.lerDocumento("configuracoes/intencoes");
  const config = normalizarConfigIntencoes(docConfig?.dados);
  const relatorio = [];

  for (const { dataMissa, horaMissa } of listasParaEnviar(config, agora)) {
    const id = idDocEnvio(dataMissa, horaMissa);
    const caminho = `configuracoes/${id}`;
    const item = { dataMissa, horaMissa };
    // "emailSaiu": o e-mail já foi aceito pelo servidor de e-mail. Daí em diante nada pode marcar a lista como
    // "erro" (isso faria a próxima rodada mandar tudo de novo) — só registrar que foi enviada.
    let emailSaiu = false, totalEnviado = 0;
    // "reservou": ESTA rodada já reservou a lista (criou ou atualizou o registro). Só então um erro pode marcar a lista
    // como "erro". Antes disso (por exemplo, se a leitura do registro falhar por cota estourada) o registro não é tocado:
    // senão um "enviado" viraria "erro" e a rodada seguinte mandaria a mesma lista de novo.
    let reservou = false;
    let enviosAnteriores = [];
    const deps = { ...dependencias, enviarEmail: async (dados) => { await dependencias.enviarEmail(dados); emailSaiu = true; } };
    try {
      const existente = await firestore.lerDocumento(caminho);

      // 1) "reserva" a lista antes de enviar: só quem conseguir reservar envia.
      if (!existente) {
        const criou = await firestore.criarSeNaoExiste("configuracoes", id, {
          status: "enviando", tentativas: 1, iniciadoEm: agora.toISOString(), dataMissa, horaMissa
        });
        if (!criou) { relatorio.push({ ...item, resultado: "ignorada (outra execução já reservou)" }); continue; }
        reservou = true;
      } else {
        const d = existente.dados;
        enviosAnteriores = Array.isArray(d.envios) ? d.envios.filter((x) => typeof x === "string") : [];
        const ehEnviado = d.status === "enviado";
        // "enviadoEm" só é gravado depois que o e-mail SAIU e nunca é apagado. Se o status foi sobrescrito por engano
        // (ex.: "erro" gravado numa rodada em que o banco falhou), a lista continua contando como enviada: o envio
        // automático nunca manda a mesma lista duas vezes. (Reenviar é sempre uma decisão do painel.)
        if (!ehEnviado && d.enviadoEm) {
          try { await firestore.atualizar(caminho, { status: "enviado" }); } catch { /* só correção do registro */ }
          relatorio.push({ ...item, resultado: "já enviada" });
          continue;
        }
        const emAndamentoRecente = d.status === "enviando" &&
          agora - new Date(d.iniciadoEm || 0) < ENVIANDO_EXPIRA_MINUTOS * 60000;
        if (ehEnviado) { relatorio.push({ ...item, resultado: "já enviada" }); continue; }
        if (emAndamentoRecente) { relatorio.push({ ...item, resultado: "em andamento" }); continue; }
        if ((d.tentativas || 0) >= MAX_TENTATIVAS) { relatorio.push({ ...item, resultado: "desistiu após várias tentativas" }); continue; }
        const conseguiu = await firestore.atualizar(caminho, {
          status: "enviando", tentativas: (d.tentativas || 0) + 1, iniciadoEm: agora.toISOString()
        }, existente.updateTime);
        if (!conseguiu) { relatorio.push({ ...item, resultado: "ignorada (outra execução já reservou)" }); continue; }
        reservou = true;
      }

      // 2) lista vazia só é enviada se o painel pedir
      const itens = await firestore.intencoesDaLista(dataMissa, horaMissa);
      if (itens.length === 0 && !configEnvio.enviarVazias) {
        await firestore.atualizar(caminho, { status: "enviado", total: 0, enviadoEm: agora.toISOString(), semEnvio: true, erro: "" });
        relatorio.push({ ...item, resultado: "sem intenções — não enviada (opção desligada no painel)" });
        continue;
      }

      // 3) gera o documento e envia
      const { total } = await montarEEnviarLista(
        { dataMissa, horaMissa, destinatarios: configEnvio.emails, itens },
        deps
      );
      totalEnviado = total;
      await atualizarComRetentativas(firestore, caminho, {
        status: "enviado", total, enviadoEm: new Date().toISOString(),
        destinatarios: configEnvio.emails, erro: "", semEnvio: false, manual: false,
        envios: [...enviosAnteriores, new Date().toISOString()].slice(-10) // cada e-mail que saiu desta lista, em ordem
      }, esperas);
      relatorio.push({ ...item, resultado: "enviada", total });
    } catch (erro) {
      const mensagem = String(erro?.message || erro).slice(0, 300);
      if (emailSaiu) {
        // o e-mail JÁ foi enviado; só o registro falhou. Nunca marca "erro" (evita e-mail duplicado).
        try {
          await atualizarComRetentativas(firestore, caminho, {
            status: "enviado", total: totalEnviado, enviadoEm: new Date().toISOString(),
            destinatarios: configEnvio.emails, erro: `E-mail enviado; falha ao registrar: ${mensagem}`.slice(0, 300), semEnvio: false, manual: false,
            envios: [...enviosAnteriores, new Date().toISOString()].slice(-10)
          }, esperas);
        } catch { /* sem como gravar agora */ }
        relatorio.push({ ...item, resultado: "enviada (registro com falha)", total: totalEnviado, erro: mensagem });
      } else {
        // só marca "erro" se a lista era desta rodada; falha anterior à reserva deixa o registro como está
        if (reservou) {
          try { await firestore.atualizar(caminho, { status: "erro", erro: mensagem }); } catch { /* não derruba a rodada */ }
        }
        relatorio.push({ ...item, resultado: "erro", erro: mensagem });
      }
    }
  }
  return { ativo: true, relatorio };
}


