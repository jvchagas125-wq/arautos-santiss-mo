// Camada de acesso aos dados no Firestore — usada por todas as páginas do site
import {
  db, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
} from "./firebase-init.js";

/* ---------------- Configurações gerais (frase do dia, logo, fundo) ---------------- */

const REF_CONFIG_GERAL = doc(db, "configuracoes", "geral");
const REF_DIAS_HORARIOS = doc(db, "configuracoes", "diasHorarios");
const REF_ADMIN = doc(db, "configuracoes", "admin");

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

/* ---------------- Dias e horários disponíveis ---------------- */

const PADRAO_DIAS_HORARIOS = {
  dataInicio: "",
  dataFim: "",
  horariosAtivos: Array.from({ length: 24 }, (_, i) => i) // 0..23 (todas as horas ativas por padrão)
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

function chaveSlot(data, hora) {
  return `${data}_${String(hora).padStart(2, "0")}`;
}

// Retorna o conjunto de horas (números) já ocupadas (status "agendado") numa data
export async function obterHorariosOcupados(data) {
  const q = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("status", "==", "agendado")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().hora);
}

export function ouvirAgendamentosDaData(data, callback) {
  const q = query(
    collection(db, "agendamentos"),
    where("data", "==", data),
    where("status", "==", "agendado")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data().hora));
  });
}

// Cria o agendamento de forma segura (transação evita dois agendamentos no mesmo horário)
export async function criarAgendamento({ nome, telefoneDigits, telefone, data, hora }) {
  const idSlot = chaveSlot(data, hora);
  const refSlot = doc(db, "slots", idSlot);
  const refAgendamento = doc(collection(db, "agendamentos"));

  await runTransaction(db, async (tx) => {
    const slotSnap = await tx.get(refSlot);
    if (slotSnap.exists() && slotSnap.data().status === "agendado") {
      throw new Error("HORARIO_OCUPADO");
    }
    tx.set(refSlot, { data, hora, status: "agendado", agendamentoId: refAgendamento.id });
    tx.set(refAgendamento, {
      nome, telefoneDigits, telefone, data, hora,
      status: "agendado",
      motivoCancelamento: "",
      criadoEm: serverTimestamp()
    });
  });

  return refAgendamento.id;
}

export async function cancelarAgendamento(agendamentoId, data, hora, motivo) {
  const idSlot = chaveSlot(data, hora);
  await updateDoc(doc(db, "agendamentos", agendamentoId), {
    status: "cancelado",
    motivoCancelamento: motivo || "",
    canceladoEm: serverTimestamp()
  });
  await setDoc(doc(db, "slots", idSlot), { data, hora, status: "livre" }, { merge: true });
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
