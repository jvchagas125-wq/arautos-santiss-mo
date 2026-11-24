// Regras compartilhadas das "Inscrições de cursos": usadas pelo site público (formulário), pelo
// painel administrativo (editor do curso, CRM, exportação) e pelo servidor (envio de avisos).
// Só dados e funções puras — nada do navegador.

// Dados pessoais que o administrador pode pedir (o nome completo é sempre pedido).
export const CAMPOS_PADRAO = [
  { chave: "email", rotulo: "E-mail", tipo: "email" },
  { chave: "telefone", rotulo: "Telefone / WhatsApp", tipo: "telefone" },
  { chave: "instagram", rotulo: "Instagram", tipo: "instagram" },
  { chave: "cpf", rotulo: "CPF", tipo: "cpf" },
  { chave: "nascimento", rotulo: "Data de nascimento", tipo: "data" },
  { chave: "endereco", rotulo: "Endereço", tipo: "texto" },
  { chave: "cidade", rotulo: "Cidade", tipo: "texto" },
  { chave: "profissao", rotulo: "Profissão", tipo: "texto" }
];

export const TIPOS_PERGUNTA = [
  { tipo: "texto", rotulo: "Resposta curta" },
  { tipo: "textolongo", rotulo: "Resposta longa" },
  { tipo: "simnao", rotulo: "Sim ou Não" },
  { tipo: "unica", rotulo: "Escolher uma opção" },
  { tipo: "multipla", rotulo: "Escolher várias opções" },
  { tipo: "data", rotulo: "Data" }
];
export const TIPOS_COM_OPCOES = ["unica", "multipla"];

export function opcoesDaPergunta(p) {
  if (!p) return [];
  if (p.tipo === "simnao") return ["Sim", "Não"];
  if (TIPOS_COM_OPCOES.includes(p.tipo)) return Array.isArray(p.opcoes) ? p.opcoes : [];
  return [];
}
// só perguntas com opções fixas podem "abrir" outras perguntas
export const perguntaTemOpcoes = (p) => p && (p.tipo === "simnao" || TIPOS_COM_OPCOES.includes(p.tipo));

export function novoIdCurto() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

const texto = (v, max) => String(v ?? "").trim().slice(0, max);

/* ---------- Programação das inscrições (abre / encerra) ---------- */
// Os horários são sempre os de Brasília (UTC-3, sem horário de verão), seja qual for o fuso do aparelho.
const DESLOCAMENTO_BRASILIA_HORAS = -3;
export function dataHoraValida(v) {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) && Number.isFinite(instanteBrasilia(t)) ? t : "";
}
// "aaaa-mm-ddThh:mm" (horário de Brasília) -> milissegundos (instante real); NaN se for inválido
export function instanteBrasilia(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(t ?? ""));
  if (!m) return NaN;
  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return NaN;
  return Date.UTC(ano, mes - 1, dia, hora - DESLOCAMENTO_BRASILIA_HORAS, minuto);
}
// "2026-11-28T12:00" -> "28/11/2026 às 12:00"
export function rotuloDataHora(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(t ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : "";
}
// Situação das inscrições agora: "abertas", "emBreve" (ainda não começaram) ou "encerradas".
// Encerrar na mão (botão do painel) ou passar da data de encerramento deixam "Inscrições encerradas"
// visível no site até o administrador apagar o curso.
export function estadoInscricoes(curso, agoraMs = Date.now()) {
  const abre = curso.abreEm ? instanteBrasilia(curso.abreEm) : NaN;
  const fecha = curso.fechaEm ? instanteBrasilia(curso.fechaEm) : NaN;
  let estado = "abertas";
  if (curso.ativo === false) estado = "encerradas";
  else if (Number.isFinite(fecha) && agoraMs >= fecha) estado = "encerradas";
  else if (Number.isFinite(abre) && agoraMs < abre) estado = "emBreve";
  return { estado, porData: estado === "encerradas" && curso.ativo !== false };
}
// Identifica "este encerramento" (para o e-mail com a lista ser enviado uma vez só por encerramento).
// null = não está encerrado, ou foi encerrado há tempo demais/sem registro (não envia).
const JANELA_ENVIO_LISTA_MS = 3 * 24 * 3600 * 1000;
export function chaveEncerramento(curso, agoraMs = Date.now()) {
  const { estado, porData } = estadoInscricoes(curso, agoraMs);
  if (estado !== "encerradas") return null;
  if (porData) {
    const fecha = instanteBrasilia(curso.fechaEm);
    return agoraMs - fecha <= JANELA_ENVIO_LISTA_MS ? `fim:${curso.fechaEm}` : null;
  }
  const quando = Number(curso.encerradoEmMs) || 0;
  return quando > 0 && agoraMs - quando <= JANELA_ENVIO_LISTA_MS ? `manual:${quando}` : null;
}

// Lê um documento de curso (de qualquer versão) e devolve sempre a mesma forma.
export function normalizarCurso(id, dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const campos = {};
  CAMPOS_PADRAO.forEach(({ chave }) => {
    const c = d.campos && d.campos[chave];
    campos[chave] = { ativo: !!(c && c.ativo), obrigatorio: !!(c && c.ativo && c.obrigatorio) };
  });
  const ids = new Set();
  const perguntas = (Array.isArray(d.perguntas) ? d.perguntas : [])
    .filter((p) => p && typeof p === "object")
    .map((p) => {
      let pid = texto(p.id, 40) || novoIdCurto();
      while (ids.has(pid)) pid = novoIdCurto();
      ids.add(pid);
      const tipo = TIPOS_PERGUNTA.some((t) => t.tipo === p.tipo) ? p.tipo : "texto";
      const opcoes = TIPOS_COM_OPCOES.includes(tipo)
        ? [...new Set((Array.isArray(p.opcoes) ? p.opcoes : []).map((o) => texto(o, 120)).filter(Boolean))]
        : [];
      const cond = p.condicao && typeof p.condicao === "object" && p.condicao.perguntaId
        ? { perguntaId: texto(p.condicao.perguntaId, 40), valor: texto(p.condicao.valor, 120) }
        : null;
      return { id: pid, rotulo: texto(p.rotulo, 300), tipo, obrigatoria: !!p.obrigatoria, opcoes, condicao: cond };
    });
  // uma condição só vale se apontar para uma pergunta anterior (evita laços e perguntas órfãs)
  perguntas.forEach((p, i) => {
    if (p.condicao && !perguntas.slice(0, i).some((q) => q.id === p.condicao.perguntaId)) p.condicao = null;
  });
  return {
    id,
    nome: texto(d.nome, 160),
    imagemUrl: texto(d.imagemUrl, 600),
    observacoes: texto(d.observacoes, 4000),
    ativo: d.ativo !== false,
    // o formulário pergunta se a pessoa aceita receber convites e informativos por e-mail?
    pedirAceiteContato: d.pedirAceiteContato === true,
    // programação das inscrições (horário de Brasília, "aaaa-mm-ddThh:mm"); vazio = sem data
    abreEm: dataHoraValida(d.abreEm),
    fechaEm: dataHoraValida(d.fechaEm),
    // quando o administrador encerrou "na mão" (milissegundos); 0 = nunca encerrado assim
    encerradoEmMs: Number.isFinite(Number(d.encerradoEmMs)) ? Number(d.encerradoEmMs) : 0,
    campos,
    perguntas,
    ordem: Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : 0
  };
}

// A pergunta aparece para a pessoa? (sem condição = sempre; com condição = a pergunta "pai" tem que estar
// visível e respondida com o valor combinado)
export function perguntaVisivel(pergunta, perguntas, respostas) {
  if (!pergunta.condicao) return true;
  const pai = perguntas.find((q) => q.id === pergunta.condicao.perguntaId);
  if (!pai || !perguntaVisivel(pai, perguntas, respostas)) return false;
  const r = respostas[pai.id];
  return Array.isArray(r) ? r.includes(pergunta.condicao.valor) : r === pergunta.condicao.valor;
}

/* ---------- Validações ---------- */
export function emailValido(v) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(String(v || "").trim());
}
// Instagram: aceita "@usuario", "usuario" ou o link do perfil. Devolve "@usuario" ou null se for inválido.
export function normalizarInstagram(v) {
  let t = String(v || "").trim();
  if (!t) return "";
  t = t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^(www\.)?instagram\.com\//i, "");
  t = t.split(/[/?#]/)[0].replace(/^@+/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(t) ? "@" + t : null;
}
export function cpfValido(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}
export function mascaraCpf(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

// Confere as respostas de uma inscrição. Devolve { erros: { chave: "mensagem" }, ok }.
export function validarInscricao(curso, { nome, padrao, respostas, aceitaContato }) {
  const erros = {};
  if (String(nome || "").trim().split(/\s+/).filter(Boolean).length < 2) erros.nome = "Digite o nome completo (nome e sobrenome).";
  CAMPOS_PADRAO.forEach(({ chave, tipo }) => {
    const cfg = curso.campos[chave];
    if (!cfg || !cfg.ativo) return;
    const v = String((padrao || {})[chave] || "").trim();
    if (!v) { if (cfg.obrigatorio) erros[chave] = "Campo obrigatório."; return; }
    if (tipo === "email" && !emailValido(v)) erros[chave] = "Digite um e-mail válido.";
    if (tipo === "cpf" && !cpfValido(v)) erros[chave] = "CPF inválido.";
    if (tipo === "instagram" && normalizarInstagram(v) === null) erros[chave] = "Digite um Instagram válido, por exemplo @arautos.";
    if (tipo === "telefone" && v.replace(/\D/g, "").length < 10) erros[chave] = "Digite um telefone válido, com DDD.";
  });
  // quem aceita receber e-mails precisa ter informado um e-mail
  if (curso.pedirAceiteContato && aceitaContato && !emailValido((padrao || {}).email) && !erros.email) {
    erros.email = "Informe seu e-mail para receber os convites e informativos.";
  }
  curso.perguntas.forEach((p) => {
    if (!perguntaVisivel(p, curso.perguntas, respostas || {})) return;
    const r = (respostas || {})[p.id];
    const vazio = Array.isArray(r) ? r.length === 0 : !String(r ?? "").trim();
    if (vazio && p.obrigatoria) erros["p:" + p.id] = "Responda esta pergunta.";
  });
  return { erros, ok: Object.keys(erros).length === 0 };
}

// Monta o documento que vai para o banco. Só guarda as perguntas que apareceram para a pessoa, junto com o
// texto da pergunta (se o administrador mudar o formulário depois, o que a pessoa respondeu continua legível).
export function montarInscricao(curso, usuario, { nome, padrao, respostas, aceitaContato }) {
  const dadosPadrao = {};
  CAMPOS_PADRAO.forEach(({ chave, tipo }) => {
    if (curso.campos[chave] && curso.campos[chave].ativo) {
      const v = String((padrao || {})[chave] || "").trim();
      dadosPadrao[chave] = tipo === "instagram" ? (normalizarInstagram(v) || "") : v;
    }
  });
  const itens = [];
  curso.perguntas.forEach((p) => {
    if (!perguntaVisivel(p, curso.perguntas, respostas || {})) return;
    const r = (respostas || {})[p.id];
    const valor = Array.isArray(r) ? r.filter(Boolean) : String(r ?? "").trim();
    if (Array.isArray(valor) ? valor.length === 0 : valor === "") return;
    itens.push({ id: p.id, rotulo: p.rotulo, valor });
  });
  const inscricao = {
    cursoId: curso.id,
    cursoNome: curso.nome,
    telefoneDigits: usuario.telefoneDigits,
    nome: String(nome || "").trim(),
    padrao: dadosPadrao,
    itens
  };
  // só guarda o aceite quando o curso perguntou (true = aceitou receber e-mails, false = não aceitou)
  if (curso.pedirAceiteContato) inscricao.aceitaContato = aceitaContato === true;
  return inscricao;
}

export const idInscricao = (cursoId, telefoneDigits) => `${cursoId}_${telefoneDigits}`;

// datas guardadas como aaaa-mm-dd aparecem como dd/mm/aaaa
export const dataParaTexto = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? "");
};
export const valorComoTexto = (v) => (Array.isArray(v) ? v.join(", ") : dataParaTexto(v));

/* ---------- Tabela para exportar / mostrar ---------- */
// Colunas = nome + dados pedidos + cada pergunta (as do formulário atual e as que já foram respondidas
// em versões antigas). Linhas em ordem alfabética.
export function tabelaDeInscritos(curso, inscricoes) {
  const colunas = [{ chave: "nome", rotulo: "Nome completo" }, { chave: "telefone", rotulo: "Telefone" }];
  const usados = new Set();
  CAMPOS_PADRAO.forEach(({ chave, rotulo }) => {
    if (chave === "telefone") return;
    const pedido = curso.campos[chave] && curso.campos[chave].ativo;
    const preenchido = inscricoes.some((i) => i.padrao && i.padrao[chave]);
    if (pedido || preenchido) { colunas.push({ chave, rotulo }); usados.add(chave); }
  });
  const perguntas = [];
  curso.perguntas.forEach((p) => perguntas.push({ id: p.id, rotulo: p.rotulo }));
  inscricoes.forEach((i) => (i.itens || []).forEach((it) => {
    if (!perguntas.some((p) => p.id === it.id)) perguntas.push({ id: it.id, rotulo: it.rotulo });
  }));
  perguntas.forEach((p) => colunas.push({ chave: "p:" + p.id, rotulo: p.rotulo }));
  const mostrarAceite = curso.pedirAceiteContato || inscricoes.some((i) => typeof i.aceitaContato === "boolean");
  if (mostrarAceite) colunas.push({ chave: "aceite", rotulo: "Aceita receber e-mails" });
  const ordenadas = [...inscricoes].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const linhas = ordenadas.map((i) => {
    const l = { nome: i.nome || "", telefone: formatarTelefone(i.telefoneDigits) };
    CAMPOS_PADRAO.forEach(({ chave }) => { if (chave !== "telefone") l[chave] = dataParaTexto((i.padrao && i.padrao[chave]) || ""); });
    if (i.padrao && i.padrao.telefone) l.telefone = i.padrao.telefone;
    if (mostrarAceite) l.aceite = i.aceitaContato === true ? "Sim" : "Não";
    perguntas.forEach((p) => {
      const it = (i.itens || []).find((x) => x.id === p.id);
      l["p:" + p.id] = it ? valorComoTexto(it.valor) : "";
    });
    return l;
  });
  return { colunas, linhas };
}

export function formatarTelefone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d;
}
export function numeroWhatsApp(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return "";
}

// e-mails dos inscritos (únicos, válidos)
export function emailsDosInscritos(inscricoes) {
  const set = new Set();
  inscricoes.forEach((i) => {
    const e = String((i.padrao && i.padrao.email) || "").trim().toLowerCase();
    if (emailValido(e)) set.add(e);
  });
  return [...set];
}

// Quem recebe os avisos e convites por e-mail: se o curso pergunta o aceite, só quem marcou "aceito";
// se não pergunta (cursos antigos), todos os inscritos que informaram e-mail.
export function inscritosParaAvisos(curso, inscricoes) {
  return curso && curso.pedirAceiteContato ? inscricoes.filter((i) => i.aceitaContato === true) : inscricoes;
}
export const emailsParaAvisos = (curso, inscricoes) => emailsDosInscritos(inscritosParaAvisos(curso, inscricoes));
// Aviso geral: todo mundo, de TODOS os cursos, que marcou o aceite de contato (e informou um e-mail válido).
// Sem repetir: quem se inscreveu em vários cursos com o mesmo e-mail recebe uma vez só.
export const emailsQueAceitaramContato = (inscricoes) => emailsDosInscritos(inscricoes.filter((i) => i && i.aceitaContato === true));

/* ---------- Lista de presença (Word e PDF) ---------- */
// Uma pessoa por linha: nome, telefone e os dados que o administrador escolheu pedir no curso (e-mail,
// Instagram, CPF...). As respostas das perguntas do formulário ficam só no Excel. "peso" = largura relativa.
const PESO_COLUNA = { email: 3, instagram: 1.8, cpf: 1.6, nascimento: 1.4, endereco: 3, cidade: 1.8, profissao: 2 };
export function tabelaDePresenca(curso, inscricoes) {
  const campos = CAMPOS_PADRAO.filter(({ chave }) => chave !== "telefone" && curso.campos[chave] && curso.campos[chave].ativo);
  const colunas = [
    { chave: "nome", rotulo: "Nome completo", peso: 3.2 },
    { chave: "telefone", rotulo: "Telefone", peso: 1.7 },
    ...campos.map(({ chave, rotulo }) => ({ chave, rotulo, peso: PESO_COLUNA[chave] || 2 }))
  ];
  const ordenadas = [...inscricoes].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const linhas = ordenadas.map((i) => {
    const l = { nome: i.nome || "", telefone: (i.padrao && i.padrao.telefone) || formatarTelefone(i.telefoneDigits) };
    campos.forEach(({ chave }) => { l[chave] = dataParaTexto((i.padrao && i.padrao[chave]) || ""); });
    return l;
  });
  return { colunas, linhas };
}
