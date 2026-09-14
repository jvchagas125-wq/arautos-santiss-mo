// Camada de acesso aos dados no Firestore — usada por todas as páginas do site
import {
  db, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  serverTimestamp
} from "./firebase-init.js";

/* ---------------- Configurações gerais (frase do dia, logo, fundo) ---------------- */

const REF_CONFIG_GERAL = doc(db, "configuracoes", "geral");
const REF_DIAS_HORARIOS = doc(db, "configuracoes", "diasHorarios");
const REF_ADMIN = doc(db, "configuracoes", "admin");
const REF_FRASES = doc(db, "configuracoes", "frases");
const REF_INTENCOES_CONFIG = doc(db, "configuracoes", "intencoes");

const PADRAO_CONFIG_GERAL = {
  tituloIgreja: "Arautos do Evangelho",
  fraseDoDia: "Não omitais nunca a visita a cada dia ao Santíssimo Sacramento, ainda que seja muito breve, mas contanto que seja constante.",
  autorFrase: "São João Bosco",
  logoUrl: "",
  fundoUrl: ""
};

export async function obterConfiguracoesGerais() {
  const snap = await getDoc(REF_CONFIG_GERAL);
  if (!snap.exists()) return { ...PADRAO_CONFIG_GERAL };
  return { ...PADRAO_CONFIG_GERAL, ...snap.data() };
}

export function ouvirConfiguracoesGerais(callback) {
  return onSnapshot(REF_CONFIG_GERAL, (snap) => {
    callback(snap.exists() ? { ...PADRAO_CONFIG_GERAL, ...snap.data() } : { ...PADRAO_CONFIG_GERAL });
  });
}

export async function salvarConfiguracoesGerais(dadosParciais) {
  await setDoc(REF_CONFIG_GERAL, dadosParciais, { merge: true });
}

/* ---------------- Frase do dia (até 30 frases, uma por dia em rotação) ---------------- */

const PADRAO_FRASES = {
  lista: Array.from({ length: 30 }, () => ({ frase: "", autor: "" }))
};

export async function obterFrases() {
  const snap = await getDoc(REF_FRASES);
  if (!snap.exists() || !Array.isArray(snap.data().lista)) return { ...PADRAO_FRASES, lista: [...PADRAO_FRASES.lista] };
  // garante sempre 30 posições, mesmo que o documento salvo tenha menos
  const lista = [...snap.data().lista];
  while (lista.length < 30) lista.push({ frase: "", autor: "" });
  return { lista: lista.slice(0, 30) };
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

export async function obterDiasHorarios() {
  const snap = await getDoc(REF_DIAS_HORARIOS);
  if (!snap.exists()) return { ...PADRAO_DIAS_HORARIOS };
  return { ...PADRAO_DIAS_HORARIOS, ...snap.data() };
}

export function ouvirDiasHorarios(callback) {
  return onSnapshot(REF_DIAS_HORARIOS, (snap) => {
    callback(snap.exists() ? { ...PADRAO_DIAS_HORARIOS, ...snap.data() } : { ...PADRAO_DIAS_HORARIOS });
  });
}

export async function salvarDiasHorarios(dados) {
  await setDoc(REF_DIAS_HORARIOS, dados, { merge: true });
}

/* ---------------- Senha do admin ---------------- */

export async function obterSenhaAdmin(senhaPadrao) {
  const snap = await getDoc(REF_ADMIN);
  if (!snap.exists() || !snap.data().senha) return senhaPadrao;
  return snap.data().senha;
}

export async function salvarSenhaAdmin(novaSenha) {
  await setDoc(REF_ADMIN, { senha: novaSenha }, { merge: true });
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

// Lista (em tempo real) todas as pessoas cadastradas, para o painel admin
export function ouvirTodosUsuarios(callback) {
  return onSnapshot(collection(db, "usuarios"), (snap) => {
    const lista = snap.docs.map((d) => d.data());
    lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    callback(lista);
  });
}

// Remove o cadastro de uma pessoa (usado pelo painel admin em "Contatos").
// Depois disso, a pessoa precisa se cadastrar novamente (nome + telefone) para usar o site.
export async function excluirUsuario(telefoneDigits) {
  await deleteDoc(doc(db, "usuarios", telefoneDigits));
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
// (não há mais exclusividade por horário — cada agendamento é independente).
export async function criarAgendamento({ nome, telefoneDigits, telefone, data, hora }) {
  const refAgendamento = doc(collection(db, "agendamentos"));
  await setDoc(refAgendamento, {
    nome, telefoneDigits, telefone, data, hora,
    status: "agendado",
    motivoCancelamento: "",
    criadoEm: serverTimestamp()
  });
  return refAgendamento.id;
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

/* ---------------- Intenções da missa ---------------- */

// horariosPorDia: um array por dia da semana, índice = Date.getDay() (0=domingo ... 6=sábado).
// Um dia com array vazio significa "sem missa nesse dia" — a lista de intenções simplesmente pula esse dia.
function horariosPorDiaPadrao() {
  return [[10, 18], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19]];
}
const HORAS_ANTES_PADRAO = 3;

// Aceita tanto o formato novo (horariosPorDia) quanto o formato antigo (horariosSemana/horariosDomingo,
// salvo antes dessa opção por dia existir), convertendo o antigo automaticamente.
function normalizarConfigIntencoes(dados) {
  if (Array.isArray(dados.horariosPorDia) && dados.horariosPorDia.length === 7) {
    return { horariosPorDia: dados.horariosPorDia, horasAntes: dados.horasAntes ?? HORAS_ANTES_PADRAO };
  }
  if (Array.isArray(dados.horariosSemana) || Array.isArray(dados.horariosDomingo)) {
    const semana = dados.horariosSemana || [];
    const domingo = dados.horariosDomingo || [];
    return {
      horariosPorDia: [domingo, semana, semana, semana, semana, semana, semana],
      horasAntes: dados.horasAntes ?? HORAS_ANTES_PADRAO
    };
  }
  return { horariosPorDia: horariosPorDiaPadrao(), horasAntes: HORAS_ANTES_PADRAO };
}

export async function obterConfigIntencoes() {
  const snap = await getDoc(REF_INTENCOES_CONFIG);
  if (!snap.exists()) return { horariosPorDia: horariosPorDiaPadrao(), horasAntes: HORAS_ANTES_PADRAO };
  return normalizarConfigIntencoes(snap.data());
}

export function ouvirConfigIntencoes(callback) {
  return onSnapshot(REF_INTENCOES_CONFIG, (snap) => {
    callback(snap.exists() ? normalizarConfigIntencoes(snap.data()) : { horariosPorDia: horariosPorDiaPadrao(), horasAntes: HORAS_ANTES_PADRAO });
  });
}

export async function salvarConfigIntencoes(dados) {
  await setDoc(REF_INTENCOES_CONFIG, dados, { merge: true });
}

// Envia uma intenção para a lista da missa indicada. Anônimo: não guarda nome/telefone.
export async function criarIntencao({ dataMissa, horaMissa, categoria, texto }) {
  const ref = doc(collection(db, "intencoes"));
  await setDoc(ref, {
    dataMissa, horaMissa, categoria, texto,
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

// Escuta em tempo real as intenções já enviadas para uma lista específica (dataMissa + horaMissa).
export function ouvirIntencoesDaLista(dataMissa, horaMissa, callback) {
  const q = query(
    collection(db, "intencoes"),
    where("dataMissa", "==", dataMissa),
    where("horaMissa", "==", horaMissa)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Usado pelo painel admin: todas as intenções já enviadas, de todas as listas (agrupamento é feito na UI).
export function ouvirTodasIntencoes(callback) {
  return onSnapshot(collection(db, "intencoes"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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
  return snap.docs.length;
}

/* ---------------- Avisos ---------------- */

// Lista (em tempo real) todos os avisos, mais recentes primeiro — para o site público e o painel admin.
export function ouvirAvisos(callback) {
  return onSnapshot(collection(db, "avisos"), (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.criadoEmOrdenacao || 0) - (a.criadoEmOrdenacao || 0));
    callback(lista);
  });
}

export async function criarAviso({ titulo, texto, imagemUrl }) {
  const ref = doc(collection(db, "avisos"));
  await setDoc(ref, {
    titulo, texto, imagemUrl: imagemUrl || "",
    criadoEmOrdenacao: Date.now(),
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarAviso(id, { titulo, texto, imagemUrl }) {
  await updateDoc(doc(db, "avisos", id), { titulo, texto, imagemUrl: imagemUrl || "" });
}

export async function excluirAviso(id) {
  await deleteDoc(doc(db, "avisos", id));
}
