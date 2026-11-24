// Camada de acesso aos dados no Firestore — usada por todas as páginas do site
import {
  db, doc, getDoc as getDocFirestore, setDoc as setDocFirestore, updateDoc as updateDocFirestore, addDoc, deleteDoc,
  collection, query, where, getDocs as getDocsFirestore, onSnapshot as onSnapshotFirestore, orderBy,
  serverTimestamp, Timestamp, deleteField, increment
} from "./firebase-init.js";
import { normalizarCurso, idInscricao } from "./cursos-comum.js";
import { idDocVisitas } from "./visitas-comum.js";
import {
  normalizarConfigIntencoes, normalizarFormularioIntencoes, horariosPorDiaParaFirestore,
  normalizarHorariosEspeciais, normalizarCategoriasPorMissa, statusMissaEspecifica,
  normalizarFechamentoGeral, normalizarFechamentoPorDiaHora, normalizarFechamentoPorMissa
} from "./utils.js";

/* ---------------- Configurações gerais (frase do dia, logo, fundo) ---------------- */


// Quando o Firestore recusa a leitura de uma coleção (regras de segurança do Firebase que ainda não
// liberam a coleção), avisa uma vez só em vez de deixar um erro "solto" no console.
const colecoesSemPermissao = new Set();
function aoFalharLeitura(colecao) {
  return (erro) => {
    console.warn(`[Firestore] não foi possível ler "${colecao}":`, erro && erro.code);
    if (erro && erro.code === "permission-denied" && !colecoesSemPermissao.has(colecao)) {
      colecoesSemPermissao.add(colecao);
      window.dispatchEvent(new CustomEvent("arautos-sem-permissao", { detail: colecao }));
    }
  };
}

const REF_CONFIG_GERAL = doc(db, "configuracoes", "geral");
const REF_DIAS_HORARIOS = doc(db, "configuracoes", "diasHorarios");
const REF_ADMIN = doc(db, "configuracoes", "admin");
const REF_FRASES = doc(db, "configuracoes", "frases");
const REF_INTENCOES_CONFIG = doc(db, "configuracoes", "intencoes");
const REF_ENVIO_INTENCOES = doc(db, "configuracoes", "envioIntencoes");


/* =========================================================
   Cache local — tudo aparece NA HORA, sem tela de carregamento
   A última resposta de cada consulta fica guardada neste aparelho. Ao abrir uma página (ou o painel)
   o conteúdo já aparece com o que foi visto da última vez e, em seguida, a conexão em tempo real com o
   banco confirma/atualiza — sem piscar, sem spinner. Só a primeiríssima visita de todas precisa esperar.
   ========================================================= */
const PREFIXO_CACHE = "arautos_dados_v1_";
const LIMITE_CACHE_BYTES = 700000; // consultas gigantes não entram no cache (não valem o custo de ler/gravar)

// Datas do Firestore (Timestamp) viram um marcador simples no JSON e voltam a ser Timestamp ao ler.
function substituirTimestamp(_chave, valor) {
  if (valor && typeof valor === "object" && typeof valor.toMillis === "function" && typeof valor.seconds === "number" && typeof valor.nanoseconds === "number") {
    return { __ts: [valor.seconds, valor.nanoseconds] };
  }
  return valor;
}
function reviverTimestamp(_chave, valor) {
  if (valor && typeof valor === "object" && Array.isArray(valor.__ts) && valor.__ts.length === 2) return new Timestamp(valor.__ts[0], valor.__ts[1]);
  return valor;
}
function lerCacheDados(chave) {
  try {
    const bruto = localStorage.getItem(PREFIXO_CACHE + chave);
    return bruto === null ? undefined : JSON.parse(bruto, reviverTimestamp);
  } catch { return undefined; }
}
function gravarCacheDados(chave, valor) {
  try {
    const texto = JSON.stringify(valor === undefined ? null : valor, substituirTimestamp);
    if (texto.length > LIMITE_CACHE_BYTES) { localStorage.removeItem(PREFIXO_CACHE + chave); return; }
    localStorage.setItem(PREFIXO_CACHE + chave, texto);
    localStorage.setItem(PREFIXO_CACHE + chave + "__t", String(Date.now())); // quando foi guardado (ver escutaComValidade)
  } catch { /* sem espaço ou sem localStorage: só perde a otimização */ }
}
// Para o que muda raramente e é lido em TODA página (configurações gerais, páginas ocultas, banners): se o que está
// guardado neste aparelho tem menos de "validadeMs", usa só ele e NÃO abre a escuta no banco (cada escuta custa ao
// menos 1 leitura por página aberta). Passado o prazo, a escuta em tempo real volta ao normal e renova o guardado.
// Uma mudança feita no painel chega aos visitantes em até alguns minutos.
const VALIDADE_PUBLICA_MS = 3 * 60000;
function escutaComValidade(chave, callback, validadeMs, abrirEscuta) {
  // quem está logado no painel sempre escuta em tempo real (vê na hora o que acabou de salvar)
  try { if (localStorage.getItem("arautos_admin_sessao")) return abrirEscuta(callback); } catch { /* sem armazenamento */ }
  const guardado = lerCacheDados(chave);
  let idade = Infinity;
  try { idade = Date.now() - Number(localStorage.getItem(PREFIXO_CACHE + chave + "__t")); } catch { /* sem armazenamento */ }
  if (guardado !== undefined && idade >= 0 && idade < validadeMs) {
    Promise.resolve().then(() => callback(guardado));
    return () => {};
  }
  return abrirEscuta(callback);
}
// Chamada ao sair do painel: apaga do aparelho o que era só do painel (contatos, intenções, inscrições...).
export function limparCacheDoPainel() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO_CACHE + "adm_")).forEach((k) => localStorage.removeItem(k));
  } catch { /* nada a limpar */ }
}

// Para os "ouvir...": devolve um callback que (1) já entrega, no mesmo instante, o que estava guardado
// e (2) guarda cada resposta nova do banco. Usado assim:  callback = cacheado("chave", callback);
function cacheado(chave, callback) {
  let chegouDoBanco = false;
  const guardado = lerCacheDados(chave);
  if (guardado !== undefined) {
    Promise.resolve().then(() => { if (!chegouDoBanco) callback(guardado); });
  }
  return (valor) => {
    chegouDoBanco = true;
    gravarCacheDados(chave, valor);
    callback(valor);
  };
}

// Para os "obter...": devolve na hora o que estava guardado e confere no banco por trás (atualizando o
// cache). Se o banco trouxer algo diferente do que foi entregue, chama aoAtualizar(valorNovo) — assim
// quem quiser mostrar a versão nova (formulários do painel, por exemplo) pode fazê-lo sem recarregar.
async function obterCacheado(chave, buscar, aoAtualizar) {
  const guardado = lerCacheDados(chave);
  const busca = buscar().then((novo) => {
    const diferente = guardado !== undefined && JSON.stringify(novo, substituirTimestamp) !== JSON.stringify(guardado, substituirTimestamp);
    gravarCacheDados(chave, novo);
    if (diferente && aoAtualizar) aoAtualizar(novo);
    return novo;
  });
  if (guardado === undefined) return busca;
  busca.catch(() => {}); // já mostramos o que estava guardado; falha de conexão não atrapalha
  return guardado;
}


// Toda gravação de uma configuração renova o que está guardado no aparelho (a próxima abertura já vem certa).
const CACHES_POR_DOCUMENTO = {
  "configuracoes/geral": ["config_geral", () => obterConfiguracoesGerais()],
  "configuracoes/frases": ["frases", () => obterFrases()],
  "configuracoes/diasHorarios": ["dias_horarios", () => obterDiasHorarios()],
  "configuracoes/intencoes": ["config_intencoes", () => obterConfigIntencoes()],
  "configuracoes/intencoesForm": ["form_intencoes", () => obterFormularioIntencoes()],
  "configuracoes/envioIntencoes": ["adm_config_envio", () => obterConfigEnvioIntencoes()]
};
function renovarCachePorCaminho(caminho) {
  const item = CACHES_POR_DOCUMENTO[caminho];
  if (!item) return;
  try { localStorage.removeItem(PREFIXO_CACHE + item[0]); } catch { /* ok */ }
  Promise.resolve().then(item[1]).catch(() => {});
}
// Toda escuta em tempo real passa por aqui: se o banco recusar a leitura (por exemplo, limite diário de leituras
// atingido), o painel avisa que o que está na tela pode estar desatualizado (evento "arautos-leitura-falhou", tratado
// em js/admin.js) — antes, a tela seguia mostrando os dados guardados no aparelho como se estivessem certos.
let avisouLeituraFalhou = false;

// Contador de leituras (diagnóstico): o Firestore cobra 1 leitura por documento recebido (a lista inteira ao abrir uma
// escuta e depois só os que mudarem). Mostra, por coleção, quantas leituras ESTE navegador fez desde que a página abriu.
// No painel aparece em Configurações; em qualquer página, digite  __leituras()  no console.
const leiturasPorColecao = {};
let leiturasTotal = 0;
function contarLeituras(alvo, qtd) {
  if (!qtd) return;
  let nome = "?";
  try { nome = String(alvo.path || (alvo._query && alvo._query.path && alvo._query.path.canonicalString()) || "?").split("/")[0]; } catch { /* mantém "?" */ }
  leiturasPorColecao[nome] = (leiturasPorColecao[nome] || 0) + qtd;
  leiturasTotal += qtd;
  window.dispatchEvent(new CustomEvent("arautos-leituras", { detail: { total: leiturasTotal } }));
}
export function leiturasDaSessao() { return { total: leiturasTotal, porColecao: { ...leiturasPorColecao } }; }
if (typeof window !== "undefined") window.__leituras = () => { const r = leiturasDaSessao(); console.table(r.porColecao); return r.total; };
async function getDoc(ref) {
  const snap = await getDocFirestore(ref);
  contarLeituras(ref, 1);
  return snap;
}
async function getDocs(consulta) {
  const snap = await getDocsFirestore(consulta);
  contarLeituras(consulta, snap.size);
  return snap;
}

function onSnapshot(alvo, ...argumentos) {
  const i = argumentos.findIndex((a) => typeof a === "function");
  if (i >= 0) {
    const aoReceber = argumentos[i];
    let primeira = true;
    argumentos[i] = (snap) => {
      try {
        const qtd = snap && typeof snap.docChanges === "function" ? (primeira ? snap.size : snap.docChanges().length) : 1;
        if (!(snap && snap.metadata && snap.metadata.fromCache)) contarLeituras(alvo, qtd);
      } catch { /* o contador nunca atrapalha a tela */ }
      primeira = false;
      aoReceber(snap);
    };
    const aoErroOriginal = typeof argumentos[i + 1] === "function" ? argumentos[i + 1] : null;
    argumentos[i + 1] = (erro) => {
      if (!(erro && erro.code === "permission-denied") && !avisouLeituraFalhou) {
        avisouLeituraFalhou = true;
        console.warn("[Firestore] a escuta em tempo real foi interrompida:", erro && erro.code);
        window.dispatchEvent(new CustomEvent("arautos-leitura-falhou", { detail: erro && erro.code }));
      }
      if (aoErroOriginal) aoErroOriginal(erro);
    };
  }
  return onSnapshotFirestore(alvo, ...argumentos);
}
async function setDoc(ref, ...resto) {
  const resultado = await setDocFirestore(ref, ...resto);
  renovarCachePorCaminho(ref && ref.path);
  return resultado;
}
async function updateDoc(ref, ...resto) {
  const resultado = await updateDocFirestore(ref, ...resto);
  renovarCachePorCaminho(ref && ref.path);
  return resultado;
}

const PADRAO_CONFIG_GERAL = {
  tituloIgreja: "Arautos do Evangelho",
  fraseDoDia: "Não omitais nunca a visita a cada dia ao Santíssimo Sacramento, ainda que seja muito breve, mas contanto que seja constante.",
  autorFrase: "São João Bosco",
  logoUrl: "",
  fundoUrl: "",
  fundoPcUrl: "", // foto de fundo própria para o computador (vazia = usa a do celular)
  fundoOutrasUrl: "", // fundo das demais páginas (celular); vazio = padrão vermelho adamascado
  fundoOutrasPcUrl: "", // fundo das demais páginas (computador); vazio = usa o do celular
  // Página pública "Contatos" — editável em Configurações > Informações de contato
  contatoTelefoneTexto: "(22) 2735-6577",
  contatoTelefoneDigits: "552227356577", // só dígitos, com código do país — usado em "Ligar" e "WhatsApp"
  contatoEnderecoTexto: "Rua Pedro Maciel Netto, 242 — Parque Residencial Santo Antônio",
  contatoEnderecoObs: "(ao lado do Parque Imperial) — Campos dos Goytacazes/RJ, 28022-322",
  contatoEnderecoLink: "https://www.google.com/maps/place/R.+Pedro+Maciel+Neto,+242+-+Res.+Santo+ANT%C3%94NIO,+Campos+dos+Goytacazes+-+RJ,+28022-322/@-21.801233,-41.3059589,19.75z/data=!4m15!1m8!3m7!1s0xbdd66e9dbc40e3:0x25c6c6949ccfc621!2sR.+Pedro+Maciel+Neto,+242+-+Res.+Santo+ANT%C3%94NIO,+Campos+dos+Goytacazes+-+RJ,+28022-322!3b1!8m2!3d-21.8010612!4d-41.3060419!16s%2Fg%2F11rz9kbt31!3m5!1s0xbdd66e9dbc40e3:0x25c6c6949ccfc621!8m2!3d-21.8010612!4d-41.3060419!16s%2Fg%2F11rz9kbt31?entry=ttu&g_ep=EgoyMDI2MDkxNi4wIKXMDSoASAFQAw%3D%3D",
  contatoInstagramTexto: "@arautoscampos",
  contatoInstagramLink: "https://www.instagram.com/arautoscampos"
};

export async function obterConfiguracoesGerais(aoAtualizar) {
  return obterCacheado("config_geral", async () => {
    const snap = await getDoc(REF_CONFIG_GERAL);
    if (!snap.exists()) return { ...PADRAO_CONFIG_GERAL };
    return { ...PADRAO_CONFIG_GERAL, ...snap.data() };
  }, aoAtualizar);
}

export function ouvirConfiguracoesGerais(callback) {
  return escutaComValidade("config_geral", callback, VALIDADE_PUBLICA_MS, (cb) => {
    cb = cacheado("config_geral", cb);
    return onSnapshot(REF_CONFIG_GERAL, (snap) => {
      cb(snap.exists() ? { ...PADRAO_CONFIG_GERAL, ...snap.data() } : { ...PADRAO_CONFIG_GERAL });
    });
  });
}

export async function salvarConfiguracoesGerais(dadosParciais) {
  await setDoc(REF_CONFIG_GERAL, dadosParciais, { merge: true });
}

/* ---------------- Páginas do site público que o administrador escondeu ----------------
   Doc configuracoes/paginas: { ocultas: { agendamento: true, cursos: false, ... } } */
const REF_PAGINAS_SITE = doc(db, "configuracoes", "paginas");

const chavesOcultas = (dados) => Object.entries((dados && dados.ocultas) || {}).filter(([, v]) => v === true).map(([k]) => k);

// Chama o callback com a lista de chaves das páginas ocultas, na hora em que mudar (tempo real).
export function ouvirPaginasOcultas(callback) {
  return escutaComValidade("paginas_ocultas", callback, VALIDADE_PUBLICA_MS, (cb) => {
    cb = cacheado("paginas_ocultas", cb);
    return onSnapshot(REF_PAGINAS_SITE, (snap) => cb(chavesOcultas(snap.exists() ? snap.data() : null)), () => {});
  });
}

export async function salvarPaginaOculta(chave, oculta) {
  await setDoc(REF_PAGINAS_SITE, { ocultas: { [chave]: !!oculta } }, { merge: true });
}

/* ---------------- Frase do dia (até 30 frases, uma por dia em rotação) ---------------- */

const PADRAO_FRASES = {
  lista: Array.from({ length: 30 }, () => ({ frase: "", autor: "" }))
};

export async function obterFrases(aoAtualizar) {
  return obterCacheado("frases", async () => {
    const snap = await getDoc(REF_FRASES);
    if (!snap.exists() || !Array.isArray(snap.data().lista)) return { ...PADRAO_FRASES, lista: [...PADRAO_FRASES.lista] };
    // garante sempre 30 posições, mesmo que o documento salvo tenha menos
    const lista = [...snap.data().lista];
    while (lista.length < 30) lista.push({ frase: "", autor: "" });
    return { lista: lista.slice(0, 30) };
  }, aoAtualizar);
}

export async function salvarFrases(lista) {
  await setDoc(REF_FRASES, { lista }, { merge: true });
}

/* ---------------- Dias e horários disponíveis ---------------- */

const PADRAO_DIAS_HORARIOS = {
  dataInicio: "",
  dataFim: "",
  horariosAtivos: Array.from({ length: 24 }, (_, i) => i), // 0..23 (todas as horas ativas por padrão)
  somenteEsseDia: false, // quando true, a adoração vale só para a data em "dataInicio" (dataFim = dataInicio)
  horaInicioPrimeiroDia: "", // "HH:MM" opcional — restringe os horários do 1º dia (dataInicio) a partir desse horário
  horaFimUltimoDia: "" // "HH:MM" opcional — restringe os horários do último dia (dataFim) até (antes de) esse horário
};

export async function obterDiasHorarios(aoAtualizar) {
  return obterCacheado("dias_horarios", async () => {
    const snap = await getDoc(REF_DIAS_HORARIOS);
    if (!snap.exists()) return { ...PADRAO_DIAS_HORARIOS };
    return { ...PADRAO_DIAS_HORARIOS, ...snap.data() };
  }, aoAtualizar);
}

export function ouvirDiasHorarios(callback) {
  callback = cacheado("dias_horarios", callback);
  return onSnapshot(REF_DIAS_HORARIOS, (snap) => {
    callback(snap.exists() ? { ...PADRAO_DIAS_HORARIOS, ...snap.data() } : { ...PADRAO_DIAS_HORARIOS });
  });
}

export async function salvarDiasHorarios(dados) {
  await setDoc(REF_DIAS_HORARIOS, dados, { merge: true });
}

// Fechamentos e alterações de agenda por dia: { "aaaa-mm-dd": { fechado: true } | { inicio, fim } }.
// Salva o mapa inteiro de uma vez (updateDoc troca o campo todo, então um dia removido some de verdade;
// salvarDiasHorarios, que usa merge, não mexe nesse campo).
export async function salvarAlteracoesAgenda(mapa) {
  const limpo = {};
  Object.entries(mapa || {}).forEach(([iso, a]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !a || typeof a !== "object") return;
    if (a.fechado === true) limpo[iso] = { fechado: true };
    else if (a.inicio || a.fim) limpo[iso] = { fechado: false, inicio: a.inicio || "", fim: a.fim || "" };
  });
  const snap = await getDoc(REF_DIAS_HORARIOS);
  if (snap.exists()) await updateDoc(REF_DIAS_HORARIOS, { alteracoes: limpo });
  else await setDoc(REF_DIAS_HORARIOS, { alteracoes: limpo }, { merge: true });
  return limpo;
}

/* ---------------- Contas do painel administrativo ----------------
   Coleção "administradores": uma conta por pessoa, com
   { nome, usuario, sal, verificador, status, principal, acessos, criadoEm }.
   status: "pendente" (aguardando aprovação) | "aprovado" | "suspenso".
   A senha em si nunca é guardada — só o sal e o verificador (ver js/contas.js). */

const COLECAO_ADMINS = "administradores";

function contaDoSnap(d) {
  return { id: d.id, ...d.data() };
}

export async function listarAdministradores() {
  const snap = await getDocs(collection(db, COLECAO_ADMINS));
  return snap.docs.map(contaDoSnap);
}

export function ouvirAdministradores(callback) {
  callback = cacheado("adm_administradores", callback);
  return onSnapshot(collection(db, COLECAO_ADMINS), (snap) => callback(snap.docs.map(contaDoSnap)));
}

// Escuta UMA conta (a de quem está logado). Chama callback(null) se a conta deixar de existir.
export function ouvirAdministrador(id, callback) {
  return onSnapshot(doc(db, COLECAO_ADMINS, id), (snap) => callback(snap.exists() ? contaDoSnap(snap) : null));
}

export async function obterAdministrador(id) {
  const snap = await getDoc(doc(db, COLECAO_ADMINS, id));
  return snap.exists() ? contaDoSnap(snap) : null;
}

export async function criarAdministrador(dados) {
  const ref = doc(collection(db, COLECAO_ADMINS));
  await setDoc(ref, { ...dados, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function atualizarAdministrador(id, dadosParciais) {
  await updateDoc(doc(db, COLECAO_ADMINS, id), dadosParciais);
}

export async function excluirAdministrador(id) {
  await deleteDoc(doc(db, COLECAO_ADMINS, id));
}

// A antiga senha única do painel (configuracoes/admin) deixa de existir assim que a primeira
// conta é criada — cada pessoa passa a ter a própria senha.
export async function removerSenhaAntigaDoPainel() {
  await deleteDoc(REF_ADMIN);
}

/* ---------------- Usuários (cadastro nome + telefone) ---------------- */

export async function obterUsuario(telefoneDigits) {
  const snap = await getDoc(doc(db, "usuarios", telefoneDigits));
  return snap.exists() ? snap.data() : null;
}

export async function cadastrarOuAtualizarUsuario(telefoneDigits, nome, telefoneFormatado) {
  await setDoc(doc(db, "usuarios", telefoneDigits), {
    nome,
    telefone: telefoneFormatado,
    telefoneDigits,
    atualizadoEm: serverTimestamp()
  }, { merge: true });
}

// Lista (em tempo real) todas as pessoas cadastradas, para o painel admin.
// O painel usa essa lista em 3 lugares ao mesmo tempo; em vez de abrir 3 escutas (e pagar 3x as leituras),
// todos compartilham UMA só escuta no Firestore.
const usuariosCompartilhado = { chamadas: new Set(), parar: null, ultimo: undefined };
export function ouvirTodosUsuarios(callback) {
  const cb = cacheado("adm_usuarios", callback);
  const S = usuariosCompartilhado;
  S.chamadas.add(cb);
  if (S.ultimo !== undefined) Promise.resolve().then(() => { if (S.chamadas.has(cb)) cb(S.ultimo); });
  if (!S.parar) {
    S.parar = onSnapshot(collection(db, "usuarios"), (snap) => {
      const lista = snap.docs.map((d) => d.data());
      lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      S.ultimo = lista;
      S.chamadas.forEach((f) => { try { f(lista); } catch (e) { console.error(e); } });
    });
  }
  return () => {
    S.chamadas.delete(cb);
    if (S.chamadas.size === 0 && S.parar) { S.parar(); S.parar = null; S.ultimo = undefined; }
  };
}

// Remove o cadastro de uma pessoa (usado pelo painel admin em "Contatos").
// Depois disso, a pessoa precisa se cadastrar novamente (nome + telefone) para usar o site.
export async function excluirUsuario(telefoneDigits) {
  await deleteDoc(doc(db, "usuarios", telefoneDigits));
}

// Edita nome e/ou telefone de um contato já cadastrado (usado pelo painel admin em "Contatos").
// O telefone é o próprio identificador do registro no banco, então, se ele mudar, o cadastro
// precisa ser recriado sob o novo número e o registro antigo é removido.
export async function editarUsuario(telefoneDigitsAntigo, novoTelefoneDigits, nome, telefoneFormatado) {
  await setDoc(doc(db, "usuarios", novoTelefoneDigits), {
    nome,
    telefone: telefoneFormatado,
    telefoneDigits: novoTelefoneDigits,
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  if (novoTelefoneDigits !== telefoneDigitsAntigo) {
    await deleteDoc(doc(db, "usuarios", telefoneDigitsAntigo));
  }
}

// Só o nome (usado por "Padronizar nomes", em massa, no painel admin — não mexe no telefone).
export async function atualizarNomeUsuario(telefoneDigits, novoNome) {
  await updateDoc(doc(db, "usuarios", telefoneDigits), { nome: novoNome, atualizadoEm: serverTimestamp() });
}

// Corrige o nome já gravado (no momento da reserva) em todos os agendamentos desse telefone —
// sem isso, "Padronizar nomes" só valeria pras reservas futuras, e os quadrados da grade
// continuariam mostrando o nome grande antigo nos agendamentos já feitos.
export async function atualizarNomeEmAgendamentosDoTelefone(telefoneDigits, novoNome) {
  const snap = await getDocs(query(collection(db, "agendamentos"), where("telefoneDigits", "==", telefoneDigits)));
  await Promise.all(snap.docs.map((d) => updateDoc(doc(db, "agendamentos", d.id), { nome: novoNome })));
}

// A própria pessoa edita o seu cadastro (nome e/ou telefone) pelo menu do perfil. Como o telefone é o
// identificador, ao trocá-lo tudo o que estava ligado ao número antigo vai junto: agendamentos, intenções
// (inclusive rascunhos), inscrições em cursos e as anotações do painel. Lança "telefone-em-uso" se o número
// novo já pertence a outro cadastro.
export async function atualizarMeuCadastro({ telefoneDigitsAntigo, nome, telefone, telefoneDigits }) {
  const mudouTelefone = telefoneDigits !== telefoneDigitsAntigo;
  const antigo = await obterUsuario(telefoneDigitsAntigo);
  if (mudouTelefone) {
    const existente = await obterUsuario(telefoneDigits);
    if (existente && existente.nome) {
      const erro = new Error("Esse telefone já está cadastrado.");
      erro.codigo = "telefone-em-uso";
      throw erro;
    }
  }
  await setDoc(doc(db, "usuarios", telefoneDigits), {
    ...(antigo || {}), nome, telefone, telefoneDigits, atualizadoEm: serverTimestamp()
  }, { merge: true });

  const dadosNovos = { nome, telefone, telefoneDigits };
  const agendamentos = await getDocs(query(collection(db, "agendamentos"), where("telefoneDigits", "==", telefoneDigitsAntigo)));
  await Promise.all(agendamentos.docs.map((d) => updateDoc(doc(db, "agendamentos", d.id), dadosNovos)));

  const intencoes = await getDocs(query(collection(db, "intencoes"), where("telefoneDigits", "==", telefoneDigitsAntigo)));
  for (const d of intencoes.docs) {
    const dados = d.data();
    if (mudouTelefone && dados.tipo === "rascunho") {
      // o código do rascunho leva o telefone: recria com o código novo e apaga o antigo
      await setDoc(doc(db, "intencoes", idRascunho(dados.dataMissa, dados.horaMissa, telefoneDigits)), { ...dados, nome, telefoneDigits });
      await deleteDoc(doc(db, "intencoes", d.id));
    } else {
      await updateDoc(doc(db, "intencoes", d.id), { nome, telefoneDigits });
    }
  }

  const inscricoes = await inscricoesDaPessoa(telefoneDigitsAntigo);
  for (const insc of inscricoes) {
    const { id, ...dados } = insc;
    if (mudouTelefone) {
      await setDoc(doc(db, "inscricoes", idInscricao(dados.cursoId, telefoneDigits)), { ...dados, nome, telefone, telefoneDigits });
      await deleteDoc(doc(db, "inscricoes", id));
    } else {
      await updateDoc(doc(db, "inscricoes", id), { nome, telefone });
    }
  }

  if (mudouTelefone) {
    // anotações do painel: se o banco não deixar a pessoa mexer nelas, o cadastro em si não deve falhar por isso
    try {
      const crm = await getDoc(doc(db, "contatosCrm", telefoneDigitsAntigo));
      if (crm.exists()) {
        await setDoc(doc(db, "contatosCrm", telefoneDigits), crm.data());
        await deleteDoc(doc(db, "contatosCrm", telefoneDigitsAntigo));
      }
    } catch (err) { console.warn("Não foi possível mover as anotações do painel:", err && err.code); }
    await deleteDoc(doc(db, "usuarios", telefoneDigitsAntigo));
  }
}

/* ---------------- Agendamentos ---------------- */

// Retorna o conjunto de horas (números) já ocupadas (status "agendado") numa data
// (uma hora pode aparecer mais de uma vez: mais de uma pessoa pode agendar o mesmo horário)
export async function obterHorariosOcupados(data) {
  const q = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("status", "==", "agendado")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().hora);
}

// Retorna os agendamentos já feitos numa data, com nome/telefone de quem agendou
// (usado para mostrar "Ver detalhes" em horários ocupados na tela de agendamento)
export function ouvirAgendamentosDaData(data, callback) {
  callback = cacheado(`agendamentos_data_${data}`, callback);
  const q = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("status", "==", "agendado")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => {
      const dados = d.data();
      return { hora: dados.hora, nome: dados.nome, telefone: dados.telefone, telefoneDigits: dados.telefoneDigits };
    }));
  });
}

// Cria o agendamento. Mais de uma pessoa pode agendar o mesmo dia e horário
// (não há mais exclusividade por horário — cada agendamento é independente), mas a MESMA
// pessoa não pode agendar duas vezes o mesmo dia e horário — checagem feita aqui (e não só
// na tela) pra cobrir também o caso de duas abas/cliques quase simultâneos.
export async function criarAgendamento({ nome, telefoneDigits, telefone, data, hora }) {
  const qDuplicado = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("hora", "==", hora),
    where("telefoneDigits", "==", telefoneDigits),
    where("status", "==", "agendado")
  );
  const snapDuplicado = await getDocs(qDuplicado);
  if (!snapDuplicado.empty) {
    const erro = new Error("Você já reservou este dia e horário.");
    erro.codigo = "AGENDAMENTO_DUPLICADO";
    throw erro;
  }

  const refAgendamento = doc(collection(db, "agendamentos"));
  await setDoc(refAgendamento, {
    nome, telefoneDigits, telefone, data, hora,
    status: "agendado",
    motivoCancelamento: "",
    criadoEm: serverTimestamp()
  });
  return refAgendamento.id;
}

// Agendamento feito PELO PAINEL em nome de outra pessoa (página "Dias e horários" > "Agendar Adoração para
// outras pessoas"). Só tem o nome — sem telefone — e aparece normalmente no site público em Acompanhamento.
// Mesma regra do site: a mesma pessoa (mesmo nome) não entra duas vezes no mesmo dia e horário.
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export async function criarAgendamentoParaOutraPessoa({ nome, data, hora }) {
  const nomeLimpo = String(nome || "").replace(/\s+/g, " ").trim();
  const q = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("hora", "==", hora),
    where("status", "==", "agendado")
  );
  const snap = await getDocs(q);
  if (snap.docs.some((d) => semAcento(d.data().nome) === semAcento(nomeLimpo))) {
    const erro = new Error("Essa pessoa já está agendada neste dia e horário.");
    erro.codigo = "AGENDAMENTO_DUPLICADO";
    throw erro;
  }
  const ref = doc(collection(db, "agendamentos"));
  await setDoc(ref, {
    nome: nomeLimpo, telefoneDigits: "", telefone: "", data, hora,
    status: "agendado",
    origem: "painel",
    motivoCancelamento: "",
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function cancelarAgendamento(agendamentoId, data, hora, motivo) {
  await updateDoc(doc(db, "agendamentos", agendamentoId), {
    status: "cancelado",
    motivoCancelamento: motivo || "",
    canceladoEm: serverTimestamp()
  });
}

// Marca/desmarca um agendamento como "extra" (pessoa cobrindo um horário fora do seu grupo
// habitual). Usado só no painel admin, para colorir a planilha exportada.
export async function marcarAgendamentoExtra(agendamentoId, extra) {
  await updateDoc(doc(db, "agendamentos", agendamentoId), { extra: !!extra });
}

export function ouvirAgendamentosDoUsuario(telefoneDigits, callback) {
  callback = cacheado(`agendamentos_usuario_${telefoneDigits}`, callback);
  const q = query(
    collection(db, "agendamentos"),
    where("telefoneDigits", "==", telefoneDigits)
  );
  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (a.data + String(a.hora).padStart(2,"0")).localeCompare(b.data + String(b.hora).padStart(2,"0")));
    callback(lista);
  });
}

// Usado pelo painel admin: apaga de verdade os agendamentos cancelados (limpeza geral, de todo mundo).
export async function limparAgendamentosCancelados() {
  const q = query(collection(db, "agendamentos"), where("status", "==", "cancelado"));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "agendamentos", d.id))));
  return snap.docs.length;
}

// Usado pela própria pessoa em "Meus Agendamentos": NÃO apaga do banco, só marca como
// oculto para ela — o padre continua vendo esses cancelamentos no painel admin normalmente.
export async function ocultarCanceladosDoUsuario(telefoneDigits) {
  const q = query(
    collection(db, "agendamentos"),
    where("status", "==", "cancelado"),
    where("telefoneDigits", "==", telefoneDigits)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(doc(db, "agendamentos", d.id), { ocultoParaUsuario: true })));
  return snap.docs.length;
}

export function ouvirTodosAgendamentos(status, callback) {
  callback = cacheado(`agendamentos_todos_${status}`, callback);
  const q = query(
    collection(db, "agendamentos"),
    where("status", "==", status)
  );
  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.data + String(b.hora).padStart(2,"0")).localeCompare(a.data + String(a.hora).padStart(2,"0")));
    callback(lista);
  });
}

// Página de agendar: só os agendamentos ATIVOS dentro do período aberto (e não o histórico inteiro).
// Faixa em um único campo (data), então não precisa de índice; o filtro por status é feito aqui.
export function ouvirAgendamentosAtivosNoPeriodo(inicioIso, fimIso, callback) {
  callback = cacheado(`agendamentos_periodo_${inicioIso}_${fimIso}`, callback);
  const q = query(
    collection(db, "agendamentos"),
    where("data", ">=", inicioIso),
    where("data", "<=", fimIso)
  );
  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status === "agendado");
    lista.sort((a, b) => (b.data + String(b.hora).padStart(2,"0")).localeCompare(a.data + String(a.hora).padStart(2,"0")));
    callback(lista);
  });
}

/* ---------------- Intenções da missa ---------------- */

// Configuração dos horários (doc configuracoes/intencoes). Em memória: { horariosPorDia: [7 listas],
// horasAntes, horariosEspeciais: { "aaaa-mm-dd": [horas] }, fechamento, fechamentoPorDiaHora, fechamentoPorMissa } — a leitura tolerante (formato atual e antigos)
// fica em js/utils.js (normalizarConfigIntencoes), a mesma usada pelo servidor.
export async function obterConfigIntencoes(aoAtualizar) {
  return obterCacheado("config_intencoes", async () => {
    const snap = await getDoc(REF_INTENCOES_CONFIG);
    return normalizarConfigIntencoes(snap.exists() ? snap.data() : null);
  }, aoAtualizar);
}

export function ouvirConfigIntencoes(callback) {
  callback = cacheado("config_intencoes", callback);
  return onSnapshot(REF_INTENCOES_CONFIG, (snap) => {
    callback(normalizarConfigIntencoes(snap.exists() ? snap.data() : null));
  });
}

// Salva os horários da semana + as regras de fechamento da lista (padrão, manhã, tarde/noite e as de cada
// dia da semana + horário). O Firestore NÃO aceita lista dentro de lista, então os 7 dias vão como um mapa
// {"0": [..], ..., "6": [..]} (era isso que dava "Nested arrays are not supported" ao salvar).
// "fechamento.padrao" do tipo "antes" também grava "horasAntes" (o campo antigo, que o servidor e versões
// antigas do site ainda leem).
export async function salvarConfigIntencoes({ horariosPorDia, fechamento, fechamentoPorDiaHora, horasAntes }) {
  const f = normalizarFechamentoGeral(fechamento, 3);
  const dados = {
    horariosPorDia: horariosPorDiaParaFirestore(horariosPorDia),
    fechamento: { padrao: f.padrao, manha: f.manha || null, tarde: f.tarde || null },
    fechamentoPorDiaHora: normalizarFechamentoPorDiaHora(fechamentoPorDiaHora),
    horasAntes: f.padrao.tipo === "antes" ? f.padrao.horas : (Number(horasAntes) > 0 ? Number(horasAntes) : 3)
  };
  // mergeFields troca esses campos por inteiro (inclusive se antes "horariosPorDia" era uma lista) e
  // não encosta nos demais, como os dias com horário diferente
  await setDoc(REF_INTENCOES_CONFIG, dados, { mergeFields: ["horariosPorDia", "fechamento", "fechamentoPorDiaHora", "horasAntes"] });
}

// Salva TODOS os dias com horário diferente de uma vez ({ "aaaa-mm-dd": [horas] }). Usa updateDoc
// (que troca o campo inteiro) pra que um dia removido realmente suma — setDoc com merge só
// acrescentaria chaves.
export async function salvarHorariosEspeciais(mapa, categoriasPorMissa = {}, fechamentoPorMissa = {}) {
  const limpo = normalizarHorariosEspeciais(mapa);
  // só guarda categorias e regras de fechamento de datas que continuam como dia especial
  const categorias = {};
  Object.entries(normalizarCategoriasPorMissa(categoriasPorMissa)).forEach(([iso, porHora]) => {
    if (limpo[iso]) categorias[iso] = porHora;
  });
  const fechamentos = {};
  Object.entries(normalizarFechamentoPorMissa(fechamentoPorMissa)).forEach(([iso, porHora]) => {
    if (limpo[iso]) fechamentos[iso] = porHora;
  });
  const dados = { horariosEspeciais: limpo, categoriasPorMissa: categorias, fechamentoPorMissa: fechamentos };
  const snap = await getDoc(REF_INTENCOES_CONFIG);
  if (snap.exists()) await updateDoc(REF_INTENCOES_CONFIG, dados);
  else await setDoc(REF_INTENCOES_CONFIG, dados, { merge: true });
}

/* ---------- Formulário das intenções (categorias, tempos de falecimento, PIX) ----------
   Doc configuracoes/intencoesForm — editado no painel, lido pelo site público e pelo servidor. */
const REF_FORM_INTENCOES = doc(db, "configuracoes", "intencoesForm");

export async function obterFormularioIntencoes(aoAtualizar) {
  return obterCacheado("form_intencoes", async () => {
    const snap = await getDoc(REF_FORM_INTENCOES);
    return normalizarFormularioIntencoes(snap.exists() ? snap.data() : null);
  }, aoAtualizar);
}

export function ouvirFormularioIntencoes(callback) {
  callback = cacheado("form_intencoes", callback);
  return onSnapshot(REF_FORM_INTENCOES, (snap) => {
    callback(normalizarFormularioIntencoes(snap.exists() ? snap.data() : null));
  });
}

export async function salvarFormularioIntencoes(formulario) {
  const limpo = normalizarFormularioIntencoes(formulario);
  // setDoc SEM merge: o documento inteiro é trocado, assim categoria/tempo removido some de vez
  await setDoc(REF_FORM_INTENCOES, limpo);
  return limpo;
}

/* ---------- Envio automático das listas por e-mail ----------
   Configuração (doc configuracoes/envioIntencoes): { ativo, emails: [..], enviarVazias }.
   Quem de fato envia é o servidor (api/enviar-listas.js); aqui só se guarda pra quem enviar e se
   está ligado. O servidor registra cada envio em configuracoes/envio_AAAA-MM-DD_HH, lido abaixo
   só pra mostrar o histórico no painel. */
function normalizarConfigEnvio(dados) {
  return {
    ativo: dados?.ativo === true,
    emails: Array.isArray(dados?.emails) ? dados.emails.filter((e) => typeof e === "string") : [],
    // e-mails que recebem só a lista de inscritos dos cursos (cadastrados em Inscritos (CRM))
    emailsInscritos: Array.isArray(dados?.emailsInscritos) ? dados.emailsInscritos.filter((e) => typeof e === "string") : [],
    enviarVazias: dados?.enviarVazias === true
  };
}

export async function obterConfigEnvioIntencoes(aoAtualizar) {
  return obterCacheado("adm_config_envio", async () => {
    const snap = await getDoc(REF_ENVIO_INTENCOES);
    return normalizarConfigEnvio(snap.exists() ? snap.data() : null);
  }, aoAtualizar);
}

export async function salvarConfigEnvioIntencoes({ ativo, emails, enviarVazias }) {
  await setDoc(REF_ENVIO_INTENCOES, { ativo: !!ativo, emails, enviarVazias: !!enviarVazias }, { merge: true });
}

// Lista própria de e-mails para a lista de inscritos dos cursos (fica no mesmo documento, em "emailsInscritos").
export async function salvarEmailsInscritos(emails) {
  await setDoc(REF_ENVIO_INTENCOES, { emailsInscritos: emails }, { merge: true });
}

// Escuta o histórico de envios registrados pelo servidor. Devolve um objeto { "aaaa-mm-dd|hora": {...} }.
export function ouvirEnviosIntencoes(callback) {
  callback = cacheado("adm_envios_intencoes", callback);
  const q = query(collection(db, "configuracoes"), where("status", "in", ["enviando", "enviado", "erro"]));
  return onSnapshot(q, (snap) => {
    const envios = {};
    snap.docs.forEach((d) => {
      const dados = d.data();
      if (dados.dataMissa && dados.horaMissa !== undefined) envios[`${dados.dataMissa}|${dados.horaMissa}`] = dados;
    });
    callback(envios);
  });
}

// Igual a ouvirEnviosIntencoes, mas só das missas de "desdeIso" (aaaa-mm-dd) em diante — poupa leituras: o histórico de
// envios cresce a cada missa, e para a lista principal do painel só interessam as recentes.
export function ouvirEnviosRecentes(desdeIso, callback) {
  callback = cacheado("adm_envios_recentes", callback);
  const q = query(collection(db, "configuracoes"), where("dataMissa", ">=", desdeIso));
  return onSnapshot(q, (snap) => {
    const envios = {};
    snap.docs.forEach((d) => {
      const dados = d.data();
      if (["enviando", "enviado", "erro"].includes(dados.status) && dados.dataMissa && dados.horaMissa !== undefined) envios[`${dados.dataMissa}|${dados.horaMissa}`] = dados;
    });
    callback(envios);
  });
}

// Envia uma intenção para a lista da missa indicada. Guarda nome e telefoneDigits de quem
// enviou (identificação padrão do site, já feita em toda página). "destaque" = sai em negrito no
// documento Word (usado nas intenções por alma com tempo de falecimento). O texto é sempre livre,
// do jeito que a pessoa escrever.
export async function criarIntencao({ dataMissa, horaMissa, categoria, texto, nome, telefoneDigits, destaque = false, tempo = "" }) {
  const ref = doc(collection(db, "intencoes"));
  const dados = {
    dataMissa, horaMissa, categoria, texto,
    nome: nome || "",
    telefoneDigits: telefoneDigits || "",
    criadoEm: serverTimestamp()
  };
  if (destaque) dados.destaque = true;
  if (tempo) dados.tempo = tempo;
  await setDoc(ref, dados);
  return ref.id;
}

// Rascunhos: o que a pessoa já digitou mas ainda não enviou (ou enviou e está editando). Ficam na
// mesma coleção "intencoes", com tipo = "rascunho" e um id fixo por pessoa+lista; as telas do painel e o
// envio por e-mail ignoram esses documentos. Depois que a lista fecha, eles são apagados
// (limparRascunhosVencidos).
const ehRascunho = (it) => it && it.tipo === "rascunho";
export function idRascunho(dataMissa, horaMissa, telefoneDigits) {
  return `rasc_${dataMissa}_${String(horaMissa).padStart(2, "0")}_${telefoneDigits}`;
}

const chaveRascunho = (dataMissa, horaMissa, telefoneDigits) => `rascunho_${idRascunho(dataMissa, horaMissa, telefoneDigits)}`;
const chaveEnviadas = (dataMissa, horaMissa, telefoneDigits) => `enviadas_${dataMissa}_${horaMissa}_${telefoneDigits}`;

// Devolve na hora o que estava guardado (abre a lista sem espera); aoAtualizar(novo) é chamado se o banco trouxer algo diferente.
export async function obterRascunho(dataMissa, horaMissa, telefoneDigits, aoAtualizar) {
  return obterCacheado(chaveRascunho(dataMissa, horaMissa, telefoneDigits), async () => {
    const snap = await getDoc(doc(db, "intencoes", idRascunho(dataMissa, horaMissa, telefoneDigits)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }, aoAtualizar);
}

export async function salvarRascunho({ dataMissa, horaMissa, telefoneDigits, nome, itens, assinaturaEnviada }) {
  const ref = doc(db, "intencoes", idRascunho(dataMissa, horaMissa, telefoneDigits));
  const chave = chaveRascunho(dataMissa, horaMissa, telefoneDigits);
  // o cache acompanha o que a pessoa acabou de salvar (a próxima abertura da lista já vem certa)
  gravarCacheDados(chave, { id: ref.id, tipo: "rascunho", dataMissa, horaMissa, telefoneDigits, nome: nome || "", itens, assinaturaEnviada: assinaturaEnviada || "" });
  await setDoc(ref, {
    tipo: "rascunho", dataMissa, horaMissa, telefoneDigits, nome: nome || "",
    itens, assinaturaEnviada: assinaturaEnviada || "", atualizadoEm: serverTimestamp()
  });
}

export async function excluirRascunho(dataMissa, horaMissa, telefoneDigits) {
  gravarCacheDados(chaveRascunho(dataMissa, horaMissa, telefoneDigits), null);
  await deleteDoc(doc(db, "intencoes", idRascunho(dataMissa, horaMissa, telefoneDigits)));
}

// As intenções que ESTA pessoa já enviou para uma lista (sem contar o rascunho) — com cache (para exibir).
export async function obterIntencoesEnviadasDaPessoa(dataMissa, horaMissa, telefoneDigits, aoAtualizar) {
  return obterCacheado(chaveEnviadas(dataMissa, horaMissa, telefoneDigits),
    () => buscarIntencoesEnviadasDaPessoa(dataMissa, horaMissa, telefoneDigits), aoAtualizar);
}
// Mesma consulta, sempre direto no banco (usada antes de gravar/trocar o que a pessoa enviou).
async function buscarIntencoesEnviadasDaPessoa(dataMissa, horaMissa, telefoneDigits) {
  const q = query(
    collection(db, "intencoes"),
    where("dataMissa", "==", dataMissa),
    where("horaMissa", "==", horaMissa),
    where("telefoneDigits", "==", telefoneDigits)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => !ehRascunho(it));
}

// "Enviar intenções": troca TUDO que esta pessoa tinha enviado para a lista pelo conteúdo atual do
// rascunho (cada item vira uma intenção separada, como sempre foi). Reenviar depois de editar
// simplesmente atualiza a lista — enquanto ela estiver aberta.
export async function enviarIntencoesDaPessoa({ dataMissa, horaMissa, nome, telefoneDigits, itens, assinatura }) {
  const anteriores = await buscarIntencoesEnviadasDaPessoa(dataMissa, horaMissa, telefoneDigits);
  await Promise.all(anteriores.map((it) => deleteDoc(doc(db, "intencoes", it.id))));
  await Promise.all(itens.map((it) => criarIntencao({
    dataMissa, horaMissa, categoria: it.categoria, texto: it.texto, nome, telefoneDigits,
    destaque: it.destaque === true, tempo: it.tempo || ""
  })));
  await salvarRascunho({ dataMissa, horaMissa, telefoneDigits, nome, itens, assinaturaEnviada: assinatura });
  // guarda o que acabou de ser enviado, para a lista abrir já com tudo certo da próxima vez
  buscarIntencoesEnviadasDaPessoa(dataMissa, horaMissa, telefoneDigits)
    .then((lista) => gravarCacheDados(chaveEnviadas(dataMissa, horaMissa, telefoneDigits), lista)).catch(() => {});
}

// Escuta em tempo real as intenções já enviadas para uma lista específica (dataMissa + horaMissa).
export function ouvirIntencoesDaLista(dataMissa, horaMissa, callback) {
  callback = cacheado(`adm_intencoes_lista_${dataMissa}_${horaMissa}`, callback);
  const q = query(
    collection(db, "intencoes"),
    where("dataMissa", "==", dataMissa),
    where("horaMissa", "==", horaMissa)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => !ehRascunho(it)));
  });
}

// Usado pelo painel admin: todas as intenções já enviadas, de todas as listas (agrupamento é feito na UI).
export function ouvirTodasIntencoes(callback) {
  callback = cacheado("adm_intencoes_todas", callback);
  return onSnapshot(collection(db, "intencoes"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => !ehRascunho(it)));
  });
}

// Só as intenções das missas de "desdeIso" (aaaa-mm-dd) em diante (inclui as futuras). É o que a lista principal do
// painel precisa; ler a coleção inteira (ouvirTodasIntencoes) só é preciso para o CRM de contatos.
export function ouvirIntencoesRecentes(desdeIso, callback) {
  callback = cacheado("adm_intencoes_recentes", callback);
  const q = query(collection(db, "intencoes"), where("dataMissa", ">=", desdeIso));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => !ehRascunho(it)));
  });
}

/* ---------------- Campanhas de mensagem (WhatsApp) ----------------
   Todas as campanhas ficam num único documento (configuracoes/campanhas), no campo "itens":
   { [id]: { nome, mensagem, ocultarPadres, excluidos: [telefones], enviados: { [telefone]: instante }, criadoEmMs } }.
   Um documento só = uma leitura por mudança (poupa a cota gratuita do Firestore). */
const REF_CAMPANHAS = doc(db, "configuracoes", "campanhas");

export function ouvirCampanhas(callback) {
  callback = cacheado("adm_campanhas", callback);
  return onSnapshot(REF_CAMPANHAS, (snap) => {
    const itens = snap.exists() ? (snap.data().itens || {}) : {};
    callback(Object.entries(itens).map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.criadoEmMs || 0) - (a.criadoEmMs || 0)));
  }, aoFalharLeitura("campanhas"));
}
export const novoIdCampanha = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
// Cria ou atualiza só os campos informados (o que já foi marcado como enviado fica intacto)
export async function salvarCampanha(id, campos) {
  await setDoc(REF_CAMPANHAS, { itens: { [id]: campos } }, { merge: true });
}
// Marca (ou desmarca) que a mensagem já foi enviada para essa pessoa
export async function marcarEnvioCampanha(id, telefoneDigits, enviado = true) {
  await updateDoc(REF_CAMPANHAS, { [`itens.${id}.enviados.${telefoneDigits}`]: enviado ? Date.now() : deleteField() });
}
export async function excluirCampanha(id) {
  await updateDoc(REF_CAMPANHAS, { [`itens.${id}`]: deleteField() });
}

/* ---------------- Origem das visitas (rastreamento de entradas) ----------------
   Um documento por dia (configuracoes/visitas_AAAA-MM-DD) com contadores: { fontes: { origem: { pagina: { visitas, pessoas } } } }.
   "visitas" = entradas no site (uma por visita); "pessoas" = aparelhos diferentes naquele dia. Ver js/visitas-comum.js. */
export async function registrarEntradaNoSite({ dia, fonte, pagina, novaPessoa }) {
  await setDocFirestore(doc(db, "configuracoes", idDocVisitas(dia)), {
    dia,
    fontes: { [fonte]: { [pagina]: { visitas: increment(1), pessoas: increment(novaPessoa ? 1 : 0) } } }
  }, { merge: true });
}
// Lê os dias pedidos (um documento por dia). Dia sem visitas simplesmente não existe.
export async function obterVisitasDosDias(dias) {
  const snaps = await Promise.all(dias.map((d) => getDoc(doc(db, "configuracoes", idDocVisitas(d)))));
  return snaps.filter((s) => s.exists()).map((s, i) => ({ dia: s.data().dia || null, ...s.data() })).filter((d) => d.dia);
}

// Escuta em tempo real o documento de UM dia (o de hoje): cada nova entrada no site chega aqui na hora.
// Custa só 1 leitura por mudança. Devolve a função que para de escutar.
export function ouvirVisitasDoDia(dia, callback, aoErro) {
  return onSnapshot(doc(db, "configuracoes", idDocVisitas(dia)), (snap) => {
    callback(snap.exists() && snap.data().dia ? { ...snap.data() } : null);
  }, (erro) => { aoFalharLeitura("visitas")(erro); if (aoErro) aoErro(erro); });
}

/* ---------------- CRM de contatos (anotações e etiquetas por pessoa) ---------------- */

// Cada documento de "contatosCrm" guarda o que o painel anota sobre uma pessoa: { notas, etiquetas[] }.
// O id é o telefone (só dígitos) da pessoa. Nada daqui aparece no site público.
export function ouvirContatosCrm(callback) {
  callback = cacheado("adm_contatos_crm", callback);
  return onSnapshot(collection(db, "contatosCrm"), (snap) => {
    const mapa = {};
    snap.docs.forEach((d) => { mapa[d.id] = d.data(); });
    callback(mapa);
  }, aoFalharLeitura("contatosCrm"));
}

export async function salvarContatoCrm(id, { notas, etiquetas }) {
  await setDoc(doc(db, "contatosCrm", id), {
    notas: notas || "",
    etiquetas: Array.isArray(etiquetas) ? etiquetas : [],
    atualizadoEm: serverTimestamp()
  }, { merge: true });
}

// Atualiza o texto de uma intenção já enviada — usado quando o painel administrativo edita uma intenção.
export async function atualizarIntencao(id, dadosParciais) {
  await updateDoc(doc(db, "intencoes", id), dadosParciais);
}

// Apaga uma única intenção (diferente de excluirListaIntencoes, que apaga a lista inteira).
export async function excluirIntencao(id) {
  await deleteDoc(doc(db, "intencoes", id));
}

// Apaga todas as intenções de uma lista específica (usado pelo padre no painel admin, com confirmação).
export async function excluirListaIntencoes(dataMissa, horaMissa) {
  const q = query(
    collection(db, "intencoes"),
    where("dataMissa", "==", dataMissa),
    where("horaMissa", "==", horaMissa)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "intencoes", d.id))));
  return snap.docs.filter((d) => !ehRascunho(d.data())).length;
}

// Apaga os rascunhos de listas que já fecharam (ninguém mais pode editar). O que a pessoa chegou a
// ENVIAR continua guardado normalmente — só o "rascunho" some do site e do banco de dados.
export async function limparRascunhosVencidos(configOuHoras, agora = new Date()) {
  const snap = await getDocs(query(collection(db, "intencoes"), where("tipo", "==", "rascunho")));
  const vencidos = snap.docs.filter((d) => {
    const dados = d.data();
    if (!dados.dataMissa || dados.horaMissa === undefined) return true;
    return !statusMissaEspecifica(dados.dataMissa, Number(dados.horaMissa), configOuHoras, agora).aberta;
  });
  await Promise.all(vencidos.map((d) => deleteDoc(doc(db, "intencoes", d.id))));
  return vencidos.length;
}

/* ---------------- Avisos ---------------- */

// ordem efetiva de um aviso: usa o campo "ordem" (manual, definido ao reordenar) quando
// existe; para avisos antigos que ainda não têm esse campo, cai pro negativo de
// criadoEmOrdenacao, o que preserva o comportamento antigo de "mais recentes primeiro"
// (valor mais recente = mais negativo = aparece primeiro numa ordenação crescente).
function ordemEfetiva(aviso) {
  return aviso.ordem !== undefined ? aviso.ordem : -(aviso.criadoEmOrdenacao || 0);
}

// Lista (em tempo real) todos os avisos, na ordem manual (ou mais recentes primeiro, por
// padrão) — para o site público e o painel admin.
export function ouvirAvisos(callback) {
  callback = cacheado("avisos", callback);
  return onSnapshot(collection(db, "avisos"), (snap) => {
    // os cursos/eventos do Simpósio ficam na mesma coleção (secao "simposio") e não entram na lista de avisos
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.secao !== SECAO_SIMPOSIO);
    lista.sort((a, b) => ordemEfetiva(a) - ordemEfetiva(b));
    callback(lista);
  });
}

/* ---------------- Simpósio (cursos e eventos: banner, título, descrição e link) ----------------
   Cada item é um documento da coleção "avisos" com secao = "simposio" (assim usa as mesmas regras do Firestore
   dos avisos, sem precisar liberar nenhuma coleção nova). */
export const SECAO_SIMPOSIO = "simposio";

function listaDoSimposio(snap) {
  const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  lista.sort((a, b) => ordemEfetiva(a) - ordemEfetiva(b));
  return lista;
}
export function ouvirSimposio(callback) {
  callback = cacheado("simposio", callback);
  return onSnapshot(query(collection(db, "avisos"), where("secao", "==", SECAO_SIMPOSIO)), (snap) => {
    callback(listaDoSimposio(snap));
  }, aoFalharLeitura("avisos"));
}

// novos itens entram no topo (como os avisos); use trocarOrdemSimposio para reordenar depois
export async function criarItemSimposio({ titulo, descricao, imagemUrl, linkUrl, linkTexto, cursoId }) {
  const ref = doc(collection(db, "avisos"));
  const agora = Date.now();
  await setDoc(ref, {
    secao: SECAO_SIMPOSIO,
    titulo, descricao: descricao || "", imagemUrl: imagemUrl || "",
    linkUrl: linkUrl || "", linkTexto: linkTexto || "",
    cursoId: cursoId || "", // curso vinculado: o cartão mostra "Inscrições encerradas" quando ele encerrar
    criadoEmOrdenacao: agora,
    ordem: -agora,
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarItemSimposio(id, { titulo, descricao, imagemUrl, linkUrl, linkTexto, cursoId }) {
  const dados = { titulo, descricao: descricao || "", linkUrl: linkUrl || "", linkTexto: linkTexto || "", cursoId: cursoId || "" };
  // só troca o banner quando o administrador escolheu uma imagem nova
  if (imagemUrl !== undefined) dados.imagemUrl = imagemUrl;
  await updateDoc(doc(db, "avisos", id), dados);
}

export async function trocarOrdemSimposio(itemA, itemB) {
  await Promise.all([
    updateDoc(doc(db, "avisos", itemA.id), { ordem: ordemEfetiva(itemB) }),
    updateDoc(doc(db, "avisos", itemB.id), { ordem: ordemEfetiva(itemA) })
  ]);
}

export async function excluirItemSimposio(id) {
  await deleteDoc(doc(db, "avisos", id));
}

export async function criarAviso({ titulo, texto, imagemUrl }) {
  const ref = doc(collection(db, "avisos"));
  const agora = Date.now();
  await setDoc(ref, {
    titulo, texto, imagemUrl: imagemUrl || "",
    criadoEmOrdenacao: agora,
    ordem: -agora, // entra no topo da lista, como um aviso novo
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarAviso(id, { titulo, texto, imagemUrl }) {
  const dados = { titulo, texto };
  // só mexe em imagemUrl quando o admin realmente trocou a imagem (envia um novo valor);
  // se não mexeu, o aviso mantém a imagem que já tinha.
  if (imagemUrl !== undefined) dados.imagemUrl = imagemUrl;
  await updateDoc(doc(db, "avisos", id), dados);
}

// Troca a posição de dois avisos adjacentes na lista (usado pelos botões "subir"/"descer"
// no painel admin). Recebe os dois objetos de aviso já com id e ordem/criadoEmOrdenacao.
export async function trocarOrdemAvisos(avisoA, avisoB) {
  await Promise.all([
    updateDoc(doc(db, "avisos", avisoA.id), { ordem: ordemEfetiva(avisoB) }),
    updateDoc(doc(db, "avisos", avisoB.id), { ordem: ordemEfetiva(avisoA) })
  ]);
}

export async function excluirAviso(id) {
  await deleteDoc(doc(db, "avisos", id));
}

/* ---------------- Banners (carrossel da página inicial) ---------------- */

// Lista (em tempo real) os banners do carrossel da Home, na ordem manual definida no
// painel admin (botões "subir"/"descer") — usada tanto pelo carrossel público quanto
// pela lista de gerenciamento em Configurações.
export function ouvirBanners(callback) {
  return escutaComValidade("banners", callback, VALIDADE_PUBLICA_MS, (cb) => {
    cb = cacheado("banners", cb);
    return onSnapshot(collection(db, "banners"), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      cb(lista);
    });
  });
}

// Banners novos entram no fim da fila (maior "ordem" = último); use trocarOrdemBanners
// para reordenar depois de criado.
export async function criarBanner({ imagemUrl, textoBotao, paginaDestino, titulo = "", texto = "", textoHtml = "" }) {
  const ref = doc(collection(db, "banners"));
  await setDoc(ref, {
    imagemUrl, textoBotao, paginaDestino, titulo, texto, textoHtml,
    ordem: Date.now(),
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarBanner(id, { imagemUrl, textoBotao, paginaDestino, titulo, texto, textoHtml }) {
  const dados = { textoBotao, paginaDestino };
  // título e texto da caixa sob o banner (opcionais; vazios = sem caixa)
  if (titulo !== undefined) dados.titulo = titulo;
  if (texto !== undefined) dados.texto = texto;
  // texto com formatação (negrito, itálico, tamanhos): "texto" guarda a versão simples do mesmo conteúdo
  if (textoHtml !== undefined) dados.textoHtml = textoHtml;
  // só mexe em imagemUrl quando o admin realmente trocou a imagem (envia um novo valor);
  // se não mexeu, o banner mantém a imagem que já tinha.
  if (imagemUrl !== undefined) dados.imagemUrl = imagemUrl;
  await updateDoc(doc(db, "banners", id), dados);
}

// Troca a posição de dois banners adjacentes (botões "subir"/"descer" no painel admin).
export async function trocarOrdemBanners(bannerA, bannerB) {
  await Promise.all([
    updateDoc(doc(db, "banners", bannerA.id), { ordem: bannerB.ordem ?? 0 }),
    updateDoc(doc(db, "banners", bannerB.id), { ordem: bannerA.ordem ?? 0 })
  ]);
}

export async function excluirBanner(id) {
  await deleteDoc(doc(db, "banners", id));
}


/* ---------------- Inscrições de cursos e eventos ---------------- */
// cursos/{id}: o curso/evento com o formulário (dados pedidos + perguntas); ver js/cursos-comum.js.
// inscricoes/{cursoId_telefone}: o que cada pessoa respondeu (uma por pessoa e curso; refazer = atualizar).
// avisosCursos/{id}: quadro de avisos de cada curso.

// Lista (em tempo real) de cursos, na ordem em que o administrador os organizou (os mais novos por último).
function listaDeCursos(snap) {
  const lista = snap.docs.map((d) => ({ ...normalizarCurso(d.id, d.data()), criadoEmMs: d.data().criadoEmMs || 0 }));
  lista.sort((a, b) => (a.ordem - b.ordem) || (a.criadoEmMs - b.criadoEmMs));
  return lista;
}
export function ouvirCursos(callback, aoErro) {
  callback = cacheado("cursos", callback);
  return onSnapshot(collection(db, "cursos"), (snap) => {
    callback(listaDeCursos(snap));
  }, (erro) => { aoFalharLeitura("cursos")(erro); if (aoErro) aoErro(erro); });
}

// Pré-carregamento das imagens do Simpósio e dos cursos (veja js/aquecer-imagens.js): o que já está
// guardado no aparelho, e uma leitura única (sem ficar "ouvindo") que atualiza esse guardado.
export function listasPublicasEmCache() {
  const s = lerCacheDados("simposio");
  const c = lerCacheDados("cursos");
  return { simposio: Array.isArray(s) ? s : [], cursos: Array.isArray(c) ? c : [] };
}
export async function atualizarListasPublicasEmCache() {
  const [snapS, snapC] = await Promise.all([
    getDocs(query(collection(db, "avisos"), where("secao", "==", SECAO_SIMPOSIO))),
    getDocs(collection(db, "cursos"))
  ]);
  const simposio = listaDoSimposio(snapS);
  const cursos = listaDeCursos(snapC);
  gravarCacheDados("simposio", simposio);
  gravarCacheDados("cursos", cursos);
  return { simposio, cursos };
}

export async function salvarCurso(id, dados) {
  const limpo = normalizarCurso(id, dados);
  const { id: _ignorar, ...campos } = limpo;
  if (id) {
    await setDoc(doc(db, "cursos", id), campos, { merge: true });
    return id;
  }
  const ref = doc(collection(db, "cursos"));
  const agora = Date.now();
  await setDoc(ref, { ...campos, ordem: agora, criadoEmMs: agora, criadoEm: serverTimestamp() });
  return ref.id;
}

// Abrir/encerrar "na mão". Ao encerrar, guarda o momento: é ele que identifica o encerramento para o
// envio automático da lista de inscritos por e-mail (uma vez por encerramento).
export async function alterarAberturaDoCurso(id, ativo) {
  await updateDoc(doc(db, "cursos", id), { ativo: !!ativo, encerradoEmMs: ativo ? 0 : Date.now() });
}

// Apaga o curso, as inscrições e os avisos dele.
export async function excluirCurso(id) {
  const [insc, avs, inic] = await Promise.all([
    getDocs(query(collection(db, "inscricoes"), where("cursoId", "==", id))),
    getDocs(query(collection(db, "avisosCursos"), where("cursoId", "==", id))),
    getDocs(query(collection(db, "inscricoesIniciadas"), where("cursoId", "==", id))).catch(() => ({ docs: [] }))
  ]);
  await Promise.all([
    ...insc.docs.map((d) => deleteDoc(d.ref)),
    ...avs.docs.map((d) => deleteDoc(d.ref)),
    ...inic.docs.map((d) => deleteDoc(d.ref).catch(() => {}))
  ]);
  await deleteDoc(doc(db, "cursos", id));
}

export async function obterInscricao(cursoId, telefoneDigits) {
  const snap = await getDoc(doc(db, "inscricoes", idInscricao(cursoId, telefoneDigits)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Telefones já inscritos em cada curso (sem dados pessoais) — usado pelo site público para saber
// "em quais cursos eu já estou". Busca só as inscrições da própria pessoa.
export async function inscricoesDaPessoa(telefoneDigits) {
  const snap = await getDocs(query(collection(db, "inscricoes"), where("telefoneDigits", "==", telefoneDigits)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function salvarInscricao(dados) {
  const id = idInscricao(dados.cursoId, dados.telefoneDigits);
  const ref = doc(db, "inscricoes", id);
  // A leitura prévia só serve para manter a data da primeira inscrição. Se o banco recusar a leitura (limite
  // diário de leituras atingido) ou demorar demais, grava assim mesmo: gravar continua funcionando e ninguém
  // deve ficar sem se inscrever por causa disso.
  let existente = null;
  try {
    existente = await Promise.race([
      getDoc(ref),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("Tempo esgotado ao ler a inscrição.")), 6000))
    ]);
  } catch (erro) {
    console.warn("[Firestore] leitura prévia da inscrição falhou; gravando mesmo assim:", erro && (erro.code || erro.message));
  }
  const jaExiste = !!existente && existente.exists();
  await setDoc(ref, {
    ...dados,
    criadoEm: jaExiste ? (existente.data().criadoEm || serverTimestamp()) : serverTimestamp(),
    criadoEmMs: jaExiste ? (existente.data().criadoEmMs || Date.now()) : Date.now(),
    atualizadoEm: serverTimestamp()
  });
  // concluiu: sai da lista de "iniciaram e não concluíram" (se não conseguir apagar, o painel já ignora quem tem inscrição)
  deleteDoc(doc(db, "inscricoesIniciadas", id)).catch(() => {});
  return id;
}

export async function excluirInscricao(id) {
  await deleteDoc(doc(db, "inscricoes", id));
}

/* ---- Inscrições iniciadas e não concluídas ----
   inscricoesIniciadas/{cursoId_telefone}: criado quando a pessoa começa a preencher o formulário do curso e apagado
   quando ela envia a inscrição. Só o painel lê. Nunca pode atrapalhar a inscrição: quem chama ignora qualquer erro. */
export async function registrarInscricaoIniciada({ cursoId, nome, telefone, telefoneDigits, preenchidos, total, primeira }) {
  const dados = { cursoId, nome: nome || "", telefone: telefone || "", telefoneDigits, preenchidos, total, atualizadoEmMs: Date.now() };
  if (primeira) dados.iniciouEmMs = Date.now();
  await setDocFirestore(doc(db, "inscricoesIniciadas", idInscricao(cursoId, telefoneDigits)), dados, { merge: true });
}
export async function excluirInscricaoIniciada(id) {
  await deleteDoc(doc(db, "inscricoesIniciadas", id));
}
export function ouvirInscricoesIniciadas(callback) {
  callback = cacheado("adm_inscricoes_iniciadas", callback);
  return onSnapshot(collection(db, "inscricoesIniciadas"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, aoFalharLeitura("inscricoesIniciadas"));
}

// Painel: todas as inscrições de todos os cursos (agrupadas na tela)
export function ouvirTodasInscricoes(callback) {
  callback = cacheado("adm_inscricoes", callback);
  return onSnapshot(collection(db, "inscricoes"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, aoFalharLeitura("inscricoes"));
}

// Avisos de um curso (quadro de avisos): do mais novo para o mais antigo
export function ouvirAvisosDoCurso(cursoId, callback) {
  callback = cacheado(`avisos_curso_${cursoId}`, callback);
  return onSnapshot(query(collection(db, "avisosCursos"), where("cursoId", "==", cursoId)), (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.criadoEmMs || 0) - (a.criadoEmMs || 0));
    callback(lista);
  }, aoFalharLeitura("avisosCursos"));
}
export function ouvirTodosAvisosDosCursos(callback) {
  callback = cacheado("adm_avisos_cursos", callback);
  return onSnapshot(collection(db, "avisosCursos"), (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.criadoEmMs || 0) - (a.criadoEmMs || 0));
    callback(lista);
  }, aoFalharLeitura("avisosCursos"));
}
export async function criarAvisoDoCurso({ cursoId, titulo, texto }) {
  const ref = doc(collection(db, "avisosCursos"));
  const agora = Date.now();
  await setDoc(ref, { cursoId, titulo, texto, criadoEmMs: agora, criadoEm: serverTimestamp() });
  return ref.id;
}
// Aviso geral: não pertence a nenhum curso (cursoId "__geral"); vai por e-mail a quem aceitou contato em qualquer curso.
export async function criarAvisoGeral({ titulo, texto }) {
  const ref = doc(collection(db, "avisosCursos"));
  await setDoc(ref, { cursoId: "__geral", global: true, titulo, texto, criadoEmMs: Date.now(), criadoEm: serverTimestamp() });
  return ref.id;
}
export async function excluirAvisoDoCurso(id) {
  await deleteDoc(doc(db, "avisosCursos", id));
}
