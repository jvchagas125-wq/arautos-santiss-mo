// Funções utilitárias compartilhadas por todas as páginas

// Corre uma promise contra um limite de tempo — se ela não responder a tempo (rede travada,
// instável etc.), rejeita com um erro em vez de deixar a tela esperando pra sempre. Usado nas
// chamadas automáticas ao Firestore (nunca nas que dependem da pessoa preencher algo).
export function comLimiteDeTempo(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("Tempo esgotado esperando resposta do servidor.")), ms))
  ]);
}

export const MESES = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];
export const DIAS_SEMANA_ABREV = ["dom","seg","ter","qua","qui","sex","sáb"];
export const DIAS_SEMANA_COMPLETO = [
  "Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"
];

/* ---------- Nome: primeira letra maiúscula em cada palavra ---------- */
const MINUSCULAS = ["de","da","do","das","dos","e"];
export function capitalizarNome(nome) {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra, i) => {
      if (i > 0 && MINUSCULAS.includes(palavra)) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    })
    .join(" ");
}

/* ---------- Nome: reduz para "primeiro nome + primeiro sobrenome" ----------
   Usado no cadastro (novo ou existente) para os nomes não ficarem grandes demais nos
   quadrados da grade de agendamentos. Preserva um conector minúsculo (de/da/do/das/dos)
   que vier imediatamente antes do sobrenome, ex: "Maria Eduarda da Silva Santos" -> "Maria da Silva".
   Nomes de uma palavra só voltam como estão (não há sobrenome pra pegar).

   Trata dois casos especiais, para não "comer" parte do nome ou do sobrenome de verdade:
   - Título/tratamento antes do nome (Pe., Padre, Dom, Frei, Dr., Sr. etc.): é mantido como
     prefixo e não é confundido com o primeiro nome da pessoa, ex: "Pe. João Silva" -> "Pe. João Silva".
   - Primeiro nome composto (João Victor, Maria Eduarda, Carlos Eduardo etc.): quando a 2ª
     palavra é um nome próprio comum de segunda parte, ela é mantida junto ao primeiro nome
     em vez de "roubar" o lugar do sobrenome, ex: "João Victor Pereira Gomes" -> "João Victor Pereira"
     (e não "João Victor", que perderia o sobrenome de verdade). */
const TITULOS_NOME = [
  "pe", "padre", "dom", "frei", "monsenhor", "diacono", "diácono", "irmao", "irmão", "irma", "irmã",
  "dr", "dra", "sr", "sra", "srta"
];
const SEGUNDO_NOME_COMPOSTO = [
  "victor", "vitor", "carlos", "pedro", "paulo", "eduardo", "eduarda", "henrique", "augusto",
  "antonio", "antônio", "luiz", "luís", "luis", "cesar", "césar", "vinicius", "vinícius",
  "guilherme", "rafael", "daniel", "fernando", "ricardo", "andre", "andré", "otavio", "otávio",
  "gabriel", "miguel", "felipe", "emanuel", "manuel", "manoel", "lucas", "gustavo", "leonardo",
  "alexandre", "roberto", "sergio", "sérgio", "marcelo", "thiago", "tiago",
  "beatriz", "clara", "cristina", "fernanda", "vitoria", "vitória", "sophia", "sofia", "luiza",
  "alice", "helena", "julia", "júlia", "gabriela", "manuela", "isabela", "isabella", "valentina",
  "giovanna", "livia", "lívia", "rosa", "aparecida", "conceicao", "conceição", "cecilia", "cecília",
  "carolina", "paula", "isabel", "antonia", "antônia", "raimunda", "terezinha", "teresa", "rita"
];
export function reduzirNomeParaExibicao(nomeCompleto) {
  const partes = (nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes.join(" ");

  // título/tratamento no início (ex.: "Pe.", "Padre", "Dr.") — mantém, nunca conta como nome
  let i = 0;
  const prefixos = [];
  while (i < partes.length - 1 && TITULOS_NOME.includes(partes[i].toLowerCase().replace(/\.$/, ""))) {
    prefixos.push(partes[i]);
    i++;
  }
  if (i >= partes.length) return partes.join(" ");

  const primeiroNome = partes[i];
  i++;

  // 2ª parte de um primeiro nome composto (ex.: "João Victor") — só conta se ainda sobrar
  // pelo menos uma palavra depois pra servir de sobrenome de verdade
  const nomeCompostoExtra = [];
  if (i < partes.length - 1 && SEGUNDO_NOME_COMPOSTO.includes((partes[i] || "").toLowerCase())) {
    nomeCompostoExtra.push(partes[i]);
    i++;
  }
  if (i >= partes.length) return [...prefixos, primeiroNome, ...nomeCompostoExtra].join(" ");

  const conectores = [];
  while (i < partes.length && MINUSCULAS.includes(partes[i].toLowerCase())) {
    conectores.push(partes[i]);
    i++;
  }
  if (i >= partes.length) return [...prefixos, primeiroNome, ...nomeCompostoExtra].join(" "); // só tinha conectores depois (raro)

  return [...prefixos, primeiroNome, ...nomeCompostoExtra, ...conectores, partes[i]].join(" ");
}

/* ---------- Telefone: máscara (XX) XXXXX-XXXX ---------- */
export function aplicarMascaraTelefone(valor) {
  let d = valor.replace(/\D/g, "");
  // Celulares/autopreenchimento às vezes trazem o código do país (+55) junto,
  // ex: "+55 (11) 91234-5678" -> sem isso, os 2 dígitos finais do número eram cortados.
  if (d.length > 11 && d.startsWith("55")) {
    d = d.slice(2);
  }
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
}
export function vincularMascaraTelefone(inputEl) {
  inputEl.addEventListener("input", () => {
    const posicaoFinal = inputEl.value.length;
    inputEl.value = aplicarMascaraTelefone(inputEl.value);
    if (inputEl.value.length !== posicaoFinal) {
      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
    }
  });
}
export function telefoneValido(valorFormatado) {
  return /^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(valorFormatado);
}
export function telefoneParaDigits(valorFormatado) {
  return valorFormatado.replace(/\D/g, "");
}

/* ---------- Datas ---------- */
export function isoParaData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}
export function dataParaIso(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
export function formatarDataBR(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
export function formatarDataExtenso(iso) {
  const d = isoParaData(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function formatarDataComDiaSemana(iso) {
  const d = isoParaData(iso);
  return `${formatarDataBR(iso)} - ${DIAS_SEMANA_COMPLETO[d.getDay()]}`;
}
export function formatarHora(hora) {
  const h = String(hora).padStart(2, "0");
  const hFim = String((hora + 1) % 24).padStart(2, "0");
  return `${h}:00h às ${hFim}:00h`;
}
export function hojeIso() {
  return dataParaIso(new Date());
}

/* ---------- Agendamento: horários disponíveis em um dia específico, já aplicando os limites
   opcionais de horário de início (no primeiro dia do período) e horário de término (no último
   dia do período). Um horário "de 08h" é considerado como começando às 08:00 — por isso um
   limite de término "08:30" ainda inclui o horário das 08h (ele começa antes das 08:30), e um
   limite de início "09:00" exclui o horário das 08h e inclui o das 09h em diante. ---------- */
// Alterações de agenda de um dia específico (feitas no painel, em "Fechamento e alterações de agenda"):
// diasHorarios.alteracoes = { "aaaa-mm-dd": { fechado: true } | { inicio: "HH:MM", fim: "HH:MM" } }.
// Devolve os limites valendo para o dia: { fechado, inicio, fim } ("" = sem limite). Um início/término
// definido para o dia vale no lugar do horário de início do 1º dia / término do último dia do período.
export function limitesDoDia(diasHorarios, iso) {
  const alteracao = diasHorarios?.alteracoes?.[iso];
  const a = alteracao && typeof alteracao === "object" ? alteracao : {};
  const primeiro = !!diasHorarios && iso === diasHorarios.dataInicio;
  const ultimo = !!diasHorarios && iso === diasHorarios.dataFim;
  return {
    fechado: a.fechado === true,
    inicio: a.inicio || (primeiro ? diasHorarios.horaInicioPrimeiroDia : "") || "",
    fim: a.fim || (ultimo ? diasHorarios.horaFimUltimoDia : "") || ""
  };
}
const minutosDe = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

export function horariosDisponiveisNoDia(diasHorarios, iso) {
  let horas = [...(diasHorarios?.horariosAtivos || [])].sort((a, b) => a - b);
  if (!diasHorarios) return horas;

  const limites = limitesDoDia(diasHorarios, iso);
  if (limites.fechado) return [];
  if (limites.inicio) {
    const limiteMin = minutosDe(limites.inicio);
    horas = horas.filter((hora) => hora * 60 >= limiteMin);
  }
  if (limites.fim) {
    const limiteMin = minutosDe(limites.fim);
    horas = horas.filter((hora) => hora * 60 < limiteMin);
  }
  return horas;
}

/* ---------- Horário automático da Missa de abertura/encerramento: quando um dia tem hora de
   início configurada (o 1º dia do período ou um dia alterado em "Fechamento e alterações de
   agenda"), a Missa é a hora imediatamente anterior a ela (ex.: adoração começa às 09:00 ->
   Missa às 08:00); quando tem hora de término, a Missa é a hora imediatamente seguinte ao
   término (ex.: termina às 18:30 -> Missa às 19:00). É automático — não precisa marcar
   manualmente. ---------- */
export function horasDeMissaNoDia(diasHorarios, iso) {
  const horas = new Set();
  if (!diasHorarios) return horas;

  const limites = limitesDoDia(diasHorarios, iso);
  if (limites.fechado || (!limites.inicio && !limites.fim)) return horas;

  const disponiveis = horariosDisponiveisNoDia(diasHorarios, iso);
  if (disponiveis.length === 0) return horas;

  if (limites.inicio) {
    const primeiraHora = Math.min(...disponiveis);
    horas.add((primeiraHora - 1 + 24) % 24);
  }
  if (limites.fim) {
    const ultimaHora = Math.max(...disponiveis);
    horas.add((ultimaHora + 1) % 24);
  }
  return horas;
}

/* ---------- Divide o período todo (De -> Até) em blocos de 7 dias corridos, um bloco = uma
   "semana" (usado na planilha exportada em Excel pelo admin e na tabela de agendamentos do
   site público). Quando sobra um resto pequeno no final (ex.: o período termina num único
   sábado avulso depois da última semana cheia), esse resto é incorporado à última semana em
   vez de virar um bloco novo quase vazio. ---------- */
export function gerarBlocosDeSemana(dataInicio, dataFim) {
  const todosDias = [];
  let d = isoParaData(dataInicio);
  while (dataParaIso(d) <= dataFim) {
    todosDias.push(dataParaIso(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  if (todosDias.length === 0) return [];

  const numSemanasCheias = Math.floor(todosDias.length / 7);
  const resto = todosDias.length % 7;
  const semanasAntesDaUltima = resto === 0 ? numSemanasCheias : numSemanasCheias - 1;

  const blocos = [];
  let i = 0;
  for (let s = 0; s < semanasAntesDaUltima; s++) {
    blocos.push(todosDias.slice(i, i + 7));
    i += 7;
  }
  if (i < todosDias.length) {
    blocos.push(todosDias.slice(i));
  }
  return blocos;
}

/* ---------- Frase do dia: rotação cíclica de até 30 frases ----------
   Todo mundo vê a mesma frase no mesmo dia (calculado pela data local do aparelho).
   Frases vazias são ignoradas primeiro — a rotação avança um índice por dia dentro da
   lista já filtrada (só as preenchidas), então com N frases cadastradas ela sempre
   percorre as N em sequência e, ao passar da última, volta para a 1ª. */
const EPOCA_FRASES = new Date(2024, 0, 1); // ponto fixo para contar o ciclo dos dias
export function indiceFraseDoDia(agora = new Date(), total = 30) {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.floor((hoje - EPOCA_FRASES) / 86400000);
  const n = total > 0 ? total : 30;
  return ((dias % n) + n) % n;
}
export function escolherFraseDoDia(lista, agora = new Date()) {
  const l = Array.isArray(lista) ? lista : [];
  const preenchidas = l.filter((item) => item && item.frase && item.frase.trim());
  if (preenchidas.length === 0) return null;
  const indice = indiceFraseDoDia(agora, preenchidas.length);
  return preenchidas[indice];
}

/* ---------- Intenções da missa: intenção fixa de "Por alma" ----------
   Entra automaticamente como a última intenção da categoria que tiver "textoFixo" (por padrão,
   "Por alma") — no parágrafo mesclado do painel administrativo e no documento Word (ver
   js/admin.js e js/docx-intencoes.js). Não é uma intenção enviada por ninguém (não existe no
   Firestore), por isso nunca aparece editável/apagável. */
export const INTENCAO_FIXA_ALMA = "Pelas almas do purgatório, falecidas e mais necessitadas.";

/* ---------- Intenções da missa: formulário editável (categorias, tempos de falecimento, PIX) ----------
   Tudo isso é editado no painel administrativo (Intenções > Formulário das intenções) e guardado em
   configuracoes/intencoesForm. Estes são os valores de fábrica, usados enquanto nada foi salvo (e
   também quando algum campo vem vazio/inválido). Este arquivo roda no navegador e no servidor. */
export const PLACEHOLDER_NOME_PADRAO = "Digite o nome completo da pessoa e clique em \"+ Adicionar mais intenções\" para continuar";

export const CATEGORIAS_PADRAO = [
  {
    chave: "gracas", rotulo: "Pedem e agradecem graças", tipo: "nome",
    placeholder: "Digite o nome da pessoa, família ou grupo e clique em \"+ Adicionar mais intenções\" para continuar",
    textoFixo: ""
  },
  { chave: "saude", rotulo: "Pela Recuperação e Saúde de", tipo: "nome", placeholder: PLACEHOLDER_NOME_PADRAO, textoFixo: "" },
  {
    chave: "alma", rotulo: "Por alma", tipo: "falecimento",
    placeholder: "Digite o nome completo da pessoa e clique em \"Adicionar\"",
    textoFixo: INTENCAO_FIXA_ALMA
  },
  { chave: "aniversarios", rotulo: "Aniversários", tipo: "aniversario", placeholder: PLACEHOLDER_NOME_PADRAO, textoFixo: "" }
];

// Mantido por compatibilidade (outros arquivos importam este nome).
export const CATEGORIAS_INTENCAO = CATEGORIAS_PADRAO;

export const PLACEHOLDERS_INTENCAO = Object.fromEntries(CATEGORIAS_PADRAO.map((c) => [c.chave, c.placeholder]));

// "sufixo" é o que aparece entre parênteses depois do nome (vazio = só o nome). Todo nome que
// leva sufixo sai em negrito no documento Word.
export const TEMPOS_FALECIMENTO_PADRAO = [
  { chave: "7dias", rotulo: "7° dia", sufixo: "7 dias", dica: "" },
  { chave: "1mes", rotulo: "1 Mês", sufixo: "1 Mês", dica: "" },
  { chave: "1ano", rotulo: "1 Ano", sufixo: "1 Ano", dica: "" },
  {
    chave: "naoinformar", rotulo: "Prefiro não informar", sufixo: "",
    dica: "Caso não deseje informar o tempo, basta clicar em \"Prefiro não informar\" para mostrar somente o nome da pessoa."
  }
];

export const PIX_PADRAO = {
  chave: "",
  qrCodeUrl: "",
  beneficiario: "",
  mensagem: "Ajude-nos a evangelizar! Sua colaboração irá favorecer esse apostolado.\nQue Nossa Senhora lhe retribua!"
};

export const TEXTOS_ENVIO_PADRAO = {
  enviado: "Muito bem!! Sua lista de intenções foi enviada!!\nCaso deseje editar, você poderá fazer isso até o horário de fechamento da lista."
};
// textos antigos (de antes da mensagem única): se ainda for um deles, vale o texto novo
const TEXTOS_ENVIO_ANTIGOS = ["Muito bem!! Sua lista de intenções foi enviada!!"];

function textoLimpo(v, padrao = "") {
  return typeof v === "string" && v.trim() ? v.trim() : padrao;
}
function chaveSegura(v, padrao) {
  const t = String(v ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  return t || padrao;
}

// Lê o documento configuracoes/intencoesForm de forma tolerante: qualquer parte ausente/inválida
// cai no valor de fábrica, então a página nunca fica sem categorias por causa de um dado ruim.
export function normalizarFormularioIntencoes(dados) {
  const d = dados && typeof dados === "object" ? dados : {};

  let categorias = [];
  if (Array.isArray(d.categorias)) {
    const usadas = new Set();
    d.categorias.forEach((c, i) => {
      if (!c || typeof c !== "object") return;
      const rotulo = textoLimpo(c.rotulo);
      if (!rotulo) return;
      let chave = chaveSegura(c.chave, `cat${i + 1}`);
      while (usadas.has(chave)) chave += "x";
      usadas.add(chave);
      // "aniversario" = Natalício / Matrimônio / Batismo / Outros. A categoria de fábrica "aniversarios"
      // que foi salva antes dessas opções existirem (como "Só nomes") passa a usar o tipo novo.
      let tipo = c.tipo === "falecimento" ? "falecimento" : c.tipo === "aniversario" ? "aniversario" : "nome";
      if (tipo === "nome" && c.chave === "aniversarios") tipo = "aniversario";
      categorias.push({
        chave, rotulo, tipo,
        placeholder: textoLimpo(c.placeholder, tipo === "falecimento" ? CATEGORIAS_PADRAO[2].placeholder : PLACEHOLDER_NOME_PADRAO),
        textoFixo: textoLimpo(c.textoFixo)
      });
    });
  }
  if (categorias.length === 0) categorias = CATEGORIAS_PADRAO.map((c) => ({ ...c }));

  let tempos = [];
  if (Array.isArray(d.temposFalecimento)) {
    const usadas = new Set();
    d.temposFalecimento.forEach((t, i) => {
      if (!t || typeof t !== "object") return;
      const rotulo = textoLimpo(t.rotulo);
      if (!rotulo) return;
      let chave = chaveSegura(t.chave, `tempo${i + 1}`);
      while (usadas.has(chave)) chave += "x";
      usadas.add(chave);
      tempos.push({ chave, rotulo, sufixo: textoLimpo(t.sufixo), dica: textoLimpo(t.dica) });
    });
  }
  if (tempos.length === 0) tempos = TEMPOS_FALECIMENTO_PADRAO.map((t) => ({ ...t }));

  const px = d.pix && typeof d.pix === "object" ? d.pix : {};
  const pix = {
    chave: textoLimpo(px.chave),
    qrCodeUrl: textoLimpo(px.qrCodeUrl),
    beneficiario: textoLimpo(px.beneficiario),
    mensagem: textoLimpo(px.mensagem, PIX_PADRAO.mensagem)
  };

  const tx = d.textos && typeof d.textos === "object" ? d.textos : {};
  const textos = {
    enviado: TEXTOS_ENVIO_ANTIGOS.includes(textoLimpo(tx.enviado)) ? TEXTOS_ENVIO_PADRAO.enviado : textoLimpo(tx.enviado, TEXTOS_ENVIO_PADRAO.enviado)
  };

  return { categorias, temposFalecimento: tempos, pix, textos };
}

// Separa vários nomes digitados juntos ("Ana, Maria; José") em nomes soltos. Só vírgula, ponto e vírgula
// e quebra de linha separam — nomes com "e" ou "/" continuam inteiros.
export function dividirNomes(texto) {
  return String(texto || "").split(/[,;\n]+/).map((n) => n.trim().replace(/[.]+$/, "").trim()).filter(Boolean);
}

// Para intenções já enviadas (inclusive as antigas) de uma categoria "falecimento": se o texto traz
// vários nomes separados por vírgula, devolve um texto por nome. O "(7 dias)" do final, se houver,
// vale para todos os nomes.
export function separarNomesDoItem(texto) {
  const t = String(texto || "").trim();
  const m = t.match(/^(.*?)\s*\(([^()]*)\)\s*$/s);
  const corpo = m ? m[1] : t;
  const nomes = dividirNomes(corpo);
  if (nomes.length <= 1) return [t.replace(/[.,;:]+$/, "").trim()].filter(Boolean);
  return nomes.map((n) => (m ? `${n} (${m[2]})` : n));
}

/* ---------- Intenções de "Aniversários": Natalício, Matrimônio, Batismo e Outros ---------- */
export const ANIVERSARIO_OPCOES = [
  { chave: "natalicio", rotulo: "Natalício" },
  { chave: "matrimonio", rotulo: "Matrimônio" },
  { chave: "batismo", rotulo: "Batismo" },
  { chave: "outros", rotulo: "Outros" }
];

const BODAS = {
  1: "Papel", 5: "Madeira ou Ferro", 10: "Estanho ou Zinco", 15: "Cristal", 20: "Porcelana", 25: "Prata",
  30: "Pérola", 40: "Rubi", 50: "Ouro", 60: "Diamante", 75: "Brilhante", 100: "Jequitibá"
};
export function nomeDasBodas(anos) {
  const n = Number(anos);
  return BODAS[n] ? `Bodas de ${BODAS[n]}` : "";
}
const umOuMais = (n, singular, plural) => `${n} ${Number(n) === 1 ? singular : plural}`;

// Monta o texto final (e se sai em negrito no Word) de uma intenção de aniversário.
//   natalício  → "Nome (50 anos)" ou, sem idade, "Nome (Natalício)"
//   matrimônio → "Noivo e Noiva (25 anos de casados – Bodas de Prata)" (negrito)
//   batismo    → "Nome (10 anos de batismo)" ou "Nome (Batismo)" (negrito)
//   outros     → exatamente o que a pessoa escreveu
export function textoDeAniversario({ tipo, nome = "", nome2 = "", anos = "" }) {
  const n1 = String(nome).trim().replace(/[.,;:]+$/, "");
  const n2 = String(nome2).trim().replace(/[.,;:]+$/, "");
  const a = String(anos).trim();
  const soNumero = /^\d{1,3}$/.test(a) ? Number(a) : null;
  if (tipo === "natalicio") {
    return { texto: `${n1} (${soNumero ? umOuMais(soNumero, "ano", "anos") : "Natalício"})`, destaque: false };
  }
  if (tipo === "batismo") {
    return { texto: `${n1} (${soNumero ? `${umOuMais(soNumero, "ano", "anos")} de batismo` : "Batismo"})`, destaque: true };
  }
  if (tipo === "matrimonio") {
    let detalhe = "Matrimônio";
    if (soNumero) {
      const bodas = nomeDasBodas(soNumero);
      detalhe = `${umOuMais(soNumero, "ano", "anos")} de casados${bodas ? ` – ${bodas}` : ""}`;
    } else if (a) {
      detalhe = a.charAt(0).toUpperCase() + a.slice(1); // a pessoa escreveu algo como "bodas de prata"
    }
    return { texto: `${n1} e ${n2} (${detalhe})`, destaque: true };
  }
  return { texto: n1, destaque: false };
}

// Texto final de uma intenção de falecimento: "Nome (7 dias)" — ou só "Nome" quando o tempo não tem sufixo.
export function textoDaIntencao(nome, tempoChave, tempos) {
  const base = String(nome || "").trim();
  if (!tempoChave) return base;
  const tempo = (tempos || []).find((t) => t.chave === tempoChave);
  return tempo && tempo.sufixo ? `${base} (${tempo.sufixo})` : base;
}

/* ---------- Intenções da missa: horários de missa de um dia específico ----------
   config: { horariosPorDia: [ [domingo], [segunda], ..., [sábado] ], horasAntes: 3, horariosEspeciais: { "aaaa-mm-dd": [horas] } }
   (índice de horariosPorDia = Date.getDay(): 0=domingo ... 6=sábado; um dia sem horários fica com array vazio).
   horariosEspeciais troca o horário de UMA data específica (lista vazia = sem missa nessa data).
   No Firestore, horariosPorDia é guardado como mapa {"0": [..], ..., "6": [..]} porque o Firestore
   não aceita lista dentro de lista; aqui dentro do código sempre vira uma lista de 7 listas. */
export const HORAS_ANTES_PADRAO = 3;
const HORARIOS_POR_DIA_PADRAO = [[10, 18], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19]];

function listaDeHoras(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b);
}

export function normalizarHorariosEspeciais(bruto) {
  const limpo = {};
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    Object.entries(bruto).forEach(([iso, horas]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && Array.isArray(horas)) limpo[iso] = listaDeHoras(horas);
    });
  }
  return limpo;
}

// Categorias liberadas em cada missa de um dia especial: { "aaaa-mm-dd": { "8": ["porAlma", ...] } }.
// Missa sem entrada aqui = todas as categorias do formulário (o comportamento de sempre).
export function normalizarCategoriasPorMissa(bruto) {
  const limpo = {};
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    Object.entries(bruto).forEach(([iso, porHora]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !porHora || typeof porHora !== "object" || Array.isArray(porHora)) return;
      const dia = {};
      Object.entries(porHora).forEach(([hora, chaves]) => {
        const h = Number(hora);
        if (!Number.isInteger(h) || h < 0 || h > 23 || !Array.isArray(chaves)) return;
        const lista = [...new Set(chaves.filter((c) => typeof c === "string" && c))];
        if (lista.length) dia[String(h)] = lista;
      });
      if (Object.keys(dia).length) limpo[iso] = dia;
    });
  }
  return limpo;
}

// Chaves das categorias liberadas para a missa de "iso" às "hora" — ou null quando vale tudo.
export function categoriasPermitidasDaMissa(config, iso, hora) {
  const lista = config && config.categoriasPorMissa && config.categoriasPorMissa[iso] && config.categoriasPorMissa[iso][String(Number(hora))];
  return Array.isArray(lista) && lista.length ? lista : null;
}

// Aceita o formato atual (mapa), o formato "lista de 7 listas" (salvo antes) e o formato bem antigo
// (horariosSemana/horariosDomingo), sempre devolvendo { horariosPorDia, horasAntes, horariosEspeciais }.
export function normalizarConfigIntencoes(dados) {
  if (!dados || typeof dados !== "object") {
    return { horariosPorDia: HORARIOS_POR_DIA_PADRAO.map((h) => [...h]), horasAntes: HORAS_ANTES_PADRAO, horariosEspeciais: {}, categoriasPorMissa: {} };
  }
  const horasAntes = Number(dados.horasAntes) > 0 ? Number(dados.horasAntes) : HORAS_ANTES_PADRAO;
  const horariosEspeciais = normalizarHorariosEspeciais(dados.horariosEspeciais);
  const categoriasPorMissa = normalizarCategoriasPorMissa(dados.categoriasPorMissa);
  const bruto = dados.horariosPorDia;
  const ehLista = Array.isArray(bruto) && bruto.length === 7;
  const ehMapa = bruto && typeof bruto === "object" && !Array.isArray(bruto) && [0, 1, 2, 3, 4, 5, 6].some((d) => Array.isArray(bruto[d]));
  if (ehLista || ehMapa) {
    return { horariosPorDia: [0, 1, 2, 3, 4, 5, 6].map((d) => listaDeHoras(bruto[d])), horasAntes, horariosEspeciais, categoriasPorMissa };
  }
  if (Array.isArray(dados.horariosSemana) || Array.isArray(dados.horariosDomingo)) {
    const semana = listaDeHoras(dados.horariosSemana);
    const domingo = listaDeHoras(dados.horariosDomingo);
    return { horariosPorDia: [domingo, semana, semana, semana, semana, semana, semana], horasAntes, horariosEspeciais, categoriasPorMissa };
  }
  return { horariosPorDia: HORARIOS_POR_DIA_PADRAO.map((h) => [...h]), horasAntes, horariosEspeciais, categoriasPorMissa };
}

// Converte a lista de 7 listas para o formato aceito pelo Firestore (mapa "0".."6").
export function horariosPorDiaParaFirestore(horariosPorDia) {
  const mapa = {};
  for (let d = 0; d < 7; d++) mapa[String(d)] = listaDeHoras((horariosPorDia || [])[d]);
  return mapa;
}

// Retorna as horas de missa (números, em ordem) de "iso": se a data tiver horário especial, vale
// esse; senão, vale o do dia da semana.
export function horariosDoDia(config, iso) {
  const especial = config.horariosEspeciais && config.horariosEspeciais[iso];
  if (Array.isArray(especial)) return [...especial].sort((a, b) => a - b);
  const horariosPorDia = Array.isArray(config.horariosPorDia) ? config.horariosPorDia : [];
  const diaSemana = isoParaData(iso).getDay();
  return [...(horariosPorDia[diaSemana] || [])].sort((a, b) => a - b);
}

// Decide o status da lista de intenções de UMA missa específica (data + hora): se ainda está
// aberta para preenchimento, se já fechou (dentro da janela de "horasAntes" antes da missa) ou
// se a missa já aconteceu.
export function statusMissaEspecifica(iso, hora, horasAntes, agora = new Date()) {
  const d = isoParaData(iso);
  const missa = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0, 0);
  const horas = Number(horasAntes) > 0 ? Number(horasAntes) : 3;
  const fechamento = new Date(missa.getTime() - horas * 3600000);
  return {
    missa,
    fechamento,
    jaAconteceu: agora >= missa,
    aberta: agora < fechamento
  };
}

/* ---------- Avisos: transforma links (http://, https:// ou www.) dentro do texto em
   elementos <a> clicáveis, preservando o resto do texto como texto puro (sem risco de HTML
   injetado). Zera e reconstrói o conteúdo do elemento recebido. ---------- */
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[a-z]{2,}[^\s<>"']*)/gi;
export function linkificarTexto(texto, elemento) {
  elemento.textContent = "";
  const partes = String(texto || "").split(URL_REGEX);
  partes.forEach((parte) => {
    if (!parte) return;
    if (/^(https?:\/\/|www\.)/i.test(parte)) {
      // separa pontuação de fim de frase (. , ! ? ; : ) ]) que não faz parte do link
      const m = parte.match(/^(.*?)([.,!?;:)\]]*)$/s);
      const url = m ? m[1] : parte;
      const sobra = m ? m[2] : "";
      const a = document.createElement("a");
      a.href = url.startsWith("http") ? url : `https://${url}`;
      a.textContent = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "link-aviso";
      elemento.appendChild(a);
      if (sobra) elemento.appendChild(document.createTextNode(sobra));
    } else {
      elemento.appendChild(document.createTextNode(parte));
    }
  });
}

/* ---------- Toast ---------- */
let toastTimeout;
export function mostrarToast(mensagem) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.classList.add("mostrar");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("mostrar"), 3200);
}

/* ---------- Modais genéricos ---------- */
export function abrirModal(elModal) {
  elModal.classList.add("aberto");
  document.body.style.overflow = "hidden";
}
export function fecharModal(elModal) {
  elModal.classList.remove("aberto");
  document.body.style.overflow = "";
}

/* ---------- Sessão local (login automático) ---------- */
const CHAVE_SESSAO = "arautos_usuario";
export function obterUsuarioSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
export function salvarUsuarioSessao(usuario) {
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario));
}
export function limparUsuarioSessao() {
  localStorage.removeItem(CHAVE_SESSAO);
}

/* ---------- Menu lateral (hambúrguer) + dropdown de perfil ----------
   Espera encontrar no HTML da página os elementos com os IDs:
   #btnMenu #btnFecharMenu #menuLateral #overlay
   #btnPerfil #dropdownPerfil #perfilNome #perfilTelefone #btnSair
*/
/* ---------- Ordem das páginas do site público (usada nos botões "Anterior / Próxima" e,
   no painel admin, como lista de páginas de destino dos banners da Home) ---------- */
export const ORDEM_PAGINAS = [
  { chave: "index", label: "Início", href: "/" },
  { chave: "agendamento", label: "Agendar Adoração", href: "agendamento" },
  { chave: "meus-agendamentos", label: "Meus agendamentos da Adoração", href: "meus-agendamentos" },
  { chave: "intencoes", label: "Intenções para a Santa Missa", href: "intencoes" },
  { chave: "cursos", label: "Inscrições de cursos", href: "cursos" },
  { chave: "avisos", label: "Agenda da semana", href: "avisos" },
  { chave: "contatos", label: "Contatos", href: "contatos" },
  { chave: "sobre", label: "Sobre", href: "sobre" }
];

// Insere, no fim do conteúdo principal (antes do rodapé), os botões "‹ Anterior" e "Próxima ›"
// que levam para a página vizinha nesse ciclo. Páginas fora da lista (ex.: admin) não recebem nada.
function inserirNavegacaoEntrePaginas(paginaAtual) {
  if (paginaAtual === "index") return; // página inicial não mostra "Anterior / Próxima"
  const main = document.querySelector("main.conteudo");
  if (!main) return;
  main.querySelector(".navegacao-paginas")?.remove();
  // só entram no ciclo as páginas que o administrador não escondeu
  const visiveis = ORDEM_PAGINAS.filter((p) => p.chave === paginaAtual || !paginasOcultas.has(p.chave));
  const indice = visiveis.findIndex((p) => p.chave === paginaAtual);
  if (indice === -1 || visiveis.length < 2 || paginasOcultas.has(paginaAtual)) return;

  const anterior = visiveis[(indice - 1 + visiveis.length) % visiveis.length];
  const proxima = visiveis[(indice + 1) % visiveis.length];

  const seta = (direcao) => `
    <svg class="navegacao-paginas__seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="${direcao === "esquerda" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}"/>
    </svg>`;

  const nav = document.createElement("div");
  nav.className = "navegacao-paginas";
  nav.innerHTML = `
    <a class="navegacao-paginas__item navegacao-paginas__item--anterior" href="${anterior.href}" aria-label="Página anterior: ${anterior.label}">
      ${seta("esquerda")}
      <span class="navegacao-paginas__textos">
        <span class="navegacao-paginas__rotulo">Anterior</span>
        <span class="navegacao-paginas__nome">${anterior.label}</span>
      </span>
    </a>
    <a class="navegacao-paginas__item navegacao-paginas__item--proxima" href="${proxima.href}" aria-label="Próxima página: ${proxima.label}">
      <span class="navegacao-paginas__textos">
        <span class="navegacao-paginas__rotulo">Próxima</span>
        <span class="navegacao-paginas__nome">${proxima.label}</span>
      </span>
      ${seta("direita")}
    </a>
  `;

  const rodape = main.querySelector(".rodape-simples");
  if (rodape) {
    main.insertBefore(nav, rodape);
  } else {
    main.appendChild(nav);
  }
}

/* ---------- Widget flutuante discreto: leva à página Contatos (contribuição) ----------
   Um botãozinho redondo no canto da tela. Na primeira vez da visita ele abre o texto por uns
   segundos ("Entre em contato conosco e dê a sua colaboração") e depois encolhe só pro ícone.
   Quem fechar no "×" não vê de novo por 7 dias. Não aparece em Contatos nem no painel admin. */
const CHAVE_WIDGET_FECHADO = "arautos_widget_colabore_fechado";
const CHAVE_WIDGET_VISTO = "arautos_widget_colabore_visto";
function iniciarWidgetColaboracao(paginaAtual) {
  if (paginaAtual === "contatos" || paginaAtual === "admin") return;
  try {
    const fechadoAte = Number(localStorage.getItem(CHAVE_WIDGET_FECHADO)) || 0;
    if (Date.now() < fechadoAte) return;
  } catch { /* sem armazenamento: mostra normalmente */ }
  let jaViu = false;
  try { jaViu = sessionStorage.getItem(CHAVE_WIDGET_VISTO) === "1"; } catch { /* ignora */ }

  const caixa = document.createElement("div");
  caixa.className = "widget-colabore";
  caixa.innerHTML = `
    <a class="widget-colabore__link" href="contatos" aria-label="Entre em contato conosco e dê a sua colaboração">
      <svg class="widget-colabore__icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/></svg>
      <span class="widget-colabore__texto">Entre em contato e colabore</span>
    </a>
    <button type="button" class="widget-colabore__fechar" aria-label="Esconder este aviso">&times;</button>`;
  document.body.appendChild(caixa);

  const recolher = () => caixa.classList.remove("aberto");
  caixa.querySelector(".widget-colabore__fechar").addEventListener("click", () => {
    caixa.remove();
    try { localStorage.setItem(CHAVE_WIDGET_FECHADO, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch { /* ignora */ }
  });
  requestAnimationFrame(() => caixa.classList.add("visivel"));
  if (!jaViu) {
    setTimeout(() => caixa.classList.add("aberto"), 2200);
    setTimeout(recolher, 9000);
    try { sessionStorage.setItem(CHAVE_WIDGET_VISTO, "1"); } catch { /* ignora */ }
  }
}

/* ---------- Páginas escondidas pelo administrador (Configurações > Páginas do site) ----------
   A lista vem do Firestore em tempo real; a última lista vista fica guardada no aparelho para
   já aparecer certa ao abrir (sem "piscar" o menu). Esconder = some do menu, dos atalhos e dos
   botões "Anterior / Próxima"; quem abrir o endereço direto vê um aviso de página indisponível. */
const CHAVE_PAGINAS_OCULTAS = "arautos_paginas_ocultas";
let paginasOcultas = new Set();

function lerPaginasOcultasEmCache() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_PAGINAS_OCULTAS) || "[]");
    return Array.isArray(lista) ? lista.filter((c) => typeof c === "string") : [];
  } catch { return []; }
}

function caminhoDoLink(a) {
  try { return new URL(a.getAttribute("href") || "", location.href).pathname.replace(/\/+$/, "").replace(/\.html$/, ""); }
  catch { return ""; }
}

function aplicarPaginasOcultas(paginaAtual) {
  const caminhos = new Map(ORDEM_PAGINAS.filter((p) => p.chave !== "index")
    .map((p) => ["/" + p.href.replace(/^\/+/, ""), p.chave]));
  // links do menu, dos atalhos da página inicial e do menu da conta
  document.querySelectorAll("#menuLateral nav a, .atalho-card, #dropdownPerfil a").forEach((a) => {
    const chave = a.dataset.pagina || caminhos.get(caminhoDoLink(a));
    if (!chave || chave === "index") return;
    a.hidden = paginasOcultas.has(chave);
    a.classList.toggle("pagina-oculta", paginasOcultas.has(chave));
  });
  // "Colabore" leva para Contatos
  const colabore = document.querySelector(".widget-colabore");
  if (colabore) colabore.classList.toggle("pagina-oculta", paginasOcultas.has("contatos"));

  inserirNavegacaoEntrePaginas(paginaAtual);

  // esta própria página foi escondida: troca o conteúdo por um aviso (e volta ao normal se for liberada de novo)
  const main = document.querySelector("main.conteudo");
  const escondida = paginaAtual !== "index" && paginasOcultas.has(paginaAtual);
  document.body.classList.toggle("pagina-indisponivel", escondida);
  if (main) {
    const aviso = main.querySelector(".pagina-indisponivel__aviso");
    if (escondida && !aviso) {
      const div = document.createElement("div");
      div.className = "pagina-indisponivel__aviso";
      div.innerHTML = '<div class="pagina-indisponivel__icone">🕊️</div><h1 class="titulo-pagina">Página indisponível</h1><p>Esta página não está disponível no momento. Volte em breve.</p><a class="btn btn-dourado" href="/">Voltar ao início</a>';
      main.prepend(div);
    } else if (!escondida && aviso) aviso.remove();
  }
}

function iniciarPaginasOcultas(paginaAtual) {
  paginasOcultas = new Set(lerPaginasOcultasEmCache());
  aplicarPaginasOcultas(paginaAtual);
  import("./dados.js").then((m) => m.ouvirPaginasOcultas((lista) => {
    paginasOcultas = new Set(lista);
    try { localStorage.setItem(CHAVE_PAGINAS_OCULTAS, JSON.stringify(lista)); } catch { /* sem armazenamento */ }
    aplicarPaginasOcultas(paginaAtual);
  })).catch(() => {});
}

export function inicializarNavegacao(paginaAtual) {
  aplicarConfigVisualEmCache();
  iniciarWidgetColaboracao(paginaAtual);
  // microfone (ditado por voz) nos campos de texto do site público — carregado à parte, sem atrasar a página
  // aviso de mudança de endereço (só nos links antigos) — no endereço novo nunca aparece
  if (paginaAtual !== "admin") import("./novo-dominio.js").then((m) => m.iniciarAvisoNovoDominio()).catch(() => {});
  if (paginaAtual !== "admin") import("./voz.js").then((m) => m.iniciarVoz({ aviso: mostrarToast })).catch(() => {});
  // faixa vermelha embaixo (só aparece em celulares cuja barra de navegação deixa o app ocupar a tela toda)
  if (!document.querySelector(".barra-inferior-app")) {
    document.body.insertAdjacentHTML("beforeend", '<div class="barra-inferior-app" aria-hidden="true"></div>');
  }

  const btnMenu = document.getElementById("btnMenu");
  const btnFecharMenu = document.getElementById("btnFecharMenu");
  const menuLateral = document.getElementById("menuLateral");
  const overlay = document.getElementById("overlay");
  const btnPerfil = document.getElementById("btnPerfil");
  const dropdownPerfil = document.getElementById("dropdownPerfil");

  function abrirMenu() {
    menuLateral.classList.add("aberto");
    overlay.classList.add("ativo");
    fecharDropdown();
  }
  function fecharMenu() {
    menuLateral.classList.remove("aberto");
    overlay.classList.remove("ativo");
  }
  function abrirDropdown() {
    dropdownPerfil.classList.add("aberto");
  }
  function fecharDropdown() {
    dropdownPerfil?.classList.remove("aberto");
  }

  btnMenu?.addEventListener("click", abrirMenu);
  btnFecharMenu?.addEventListener("click", fecharMenu);
  overlay?.addEventListener("click", () => { fecharMenu(); fecharDropdown(); });
  btnPerfil?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdownPerfil.classList.contains("aberto")) fecharDropdown();
    else abrirDropdown();
  });
  document.addEventListener("click", (e) => {
    if (dropdownPerfil && !dropdownPerfil.contains(e.target) && e.target !== btnPerfil) {
      fecharDropdown();
    }
  });

  // marca o item ativo do menu
  document.querySelectorAll("#menuLateral nav a[data-pagina]").forEach((a) => {
    if (a.dataset.pagina === paginaAtual) a.classList.add("ativa");
  });

  // preenche dados do usuário no dropdown
  const usuario = obterUsuarioSessao();
  const nomeEl = document.getElementById("perfilNome");
  const telEl = document.getElementById("perfilTelefone");
  if (usuario && nomeEl) nomeEl.textContent = usuario.nome;
  if (usuario && telEl) telEl.textContent = usuario.telefone;

  const btnSair = document.getElementById("btnSair");
  btnSair?.addEventListener("click", () => {
    limparUsuarioSessao();
    window.location.href = "/";
  });

  if (paginaAtual !== "admin") iniciarPaginasOcultas(paginaAtual);
  else inserirNavegacaoEntrePaginas(paginaAtual);
}

/* ---------- Aplica logo e fundo dinâmicos vindos da configuração ----------
   Guardamos o último logo/fundo aplicados com sucesso num cache local: assim, ao recarregar
   a página, mostramos de cara a imagem certa (a mais recente já vista neste aparelho) em vez
   da logo/fundo padrão do site enquanto a configuração real ainda não chegou do Firestore —
   sem isso, dava pra ver um "flash" da imagem antiga por uma fração de segundo a cada load. */
const CHAVE_CACHE_VISUAL = "arautos_config_visual_cache";

function lerCacheVisual() {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_VISUAL);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
function salvarCacheVisual(campo, url) {
  try {
    const atual = lerCacheVisual() || {};
    atual[campo] = url;
    localStorage.setItem(CHAVE_CACHE_VISUAL, JSON.stringify(atual));
  } catch {
    // sem localStorage disponível (modo privado etc.) — só perde a otimização, sem quebrar nada
  }
}

// dá uma dica ao navegador pra baixar essa imagem o quanto antes, com prioridade alta — o fundo
// de tela em cache é aplicado via CSS (background-image), que historicamente o navegador
// costuma baixar com prioridade mais baixa do que uma <img> normal, o que atrasava a troca.
/* Imagens que vêm do Cloudinary: pede uma versão já reduzida e otimizada (formato moderno, qualidade
   automática, largura máxima) em vez da foto original enorme — a imagem aparece igual na tela,
   mas baixa bem mais rápido no celular. Se o Cloudinary recusar a versão otimizada por algum motivo,
   quem chama volta sozinho para a URL original (ver definirSrcOtimizado / aplicarFundo). */
export function otimizarImagemUrl(url, largura) {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url || "");
  if (!m) return url;
  return `${m[1]}f_auto,q_auto,c_limit,w_${largura}/${m[2]}`;
}
export function definirSrcOtimizado(img, url, largura) {
  const otimizada = otimizarImagemUrl(url, largura);
  if (otimizada !== url) {
    img.addEventListener("error", () => { if (img.src !== url) img.src = url; }, { once: true });
  }
  img.src = otimizada;
}
function definirFundoCss(url) {
  const otimizada = otimizarImagemUrl(url, 1000);
  document.documentElement.style.setProperty("--fundo-img", `url('${otimizada}')`);
  if (otimizada !== url) {
    const teste = new Image();
    teste.onerror = () => document.documentElement.style.setProperty("--fundo-img", `url('${url}')`);
    teste.src = otimizada;
  }
  return otimizada;
}

function precarregarImagem(url) {
  if (!url || String(url).startsWith("data:")) return; // imagem embutida já está na página — nada a pré-carregar
  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    document.head.appendChild(link);
  } catch {
    // sem problema, é só uma otimização
  }
}

// Chamada bem no início de cada página (dentro de inicializarNavegacao), antes de qualquer
// resposta do Firestore, pra já pintar o logo/fundo vistos da última vez.
export function aplicarConfigVisualEmCache() {
  const cache = lerCacheVisual();
  if (!cache) return;
  if (cache.logoUrl) {
    document.querySelectorAll(".js-logo").forEach((img) => definirSrcOtimizado(img, cache.logoUrl, 500));
  }
  if (cache.fundoUrl) {
    precarregarImagem(definirFundoCss(cache.fundoUrl));
  }
}

export function aplicarLogo(url) {
  document.querySelectorAll(".js-logo").forEach((img) => {
    if (url) definirSrcOtimizado(img, url, 500);
  });
  if (url) salvarCacheVisual("logoUrl", url);
}
export function aplicarFundo(url) {
  if (!url) return;
  definirFundoCss(url);
  salvarCacheVisual("fundoUrl", url);
}

/* ---------- Botão "olho" para mostrar/ocultar senha ----------
   Espera um botão com dois SVGs filhos: .olho-aberto e .olho-fechado */
export function vincularOlhoSenha(botao, input) {
  if (!botao || !input) return;
  const aberto = botao.querySelector(".olho-aberto");
  const fechado = botao.querySelector(".olho-fechado");
  botao.addEventListener("click", () => {
    const vaiMostrar = input.type === "password";
    input.type = vaiMostrar ? "text" : "password";
    aberto?.classList.toggle("oculto", vaiMostrar);
    fechado?.classList.toggle("oculto", !vaiMostrar);
    botao.setAttribute("aria-label", vaiMostrar ? "Ocultar senha" : "Mostrar senha");
    input.focus({ preventScroll: true });
  });
}

/* ---------- Seletor de hora personalizado reutilizável ----------
   container: elemento .seletor-hora (com [data-coluna-horas], [data-coluna-minutos], [data-limpar], [data-confirmar])
   input: campo de texto (readonly) onde o valor "HH:MM" é exibido
   opts: { valorInicial: "HH:MM" ou "", aoSelecionar(valorOuVazio) }
   Retorna { definirValor(hhmm), obterValor() } */
export function criarSeletorHora(container, input, opts = {}) {
  const colHoras = container.querySelector("[data-coluna-horas]");
  const colMinutos = container.querySelector("[data-coluna-minutos]");
  const btnLimpar = container.querySelector("[data-limpar]");
  const btnConfirmar = container.querySelector("[data-confirmar]");
  const aoSelecionar = opts.aoSelecionar || (() => {});
  const MINUTOS_OPCOES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  let horaSel = null;
  let minutoSel = null;

  function centralizarNaColuna(coluna, item) {
    if (!item) return;
    coluna.scrollTop = item.offsetTop - coluna.clientHeight / 2 + item.offsetHeight / 2;
  }

  function aplicarValorInicial(hhmm) {
    if (hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      horaSel = h;
      minutoSel = MINUTOS_OPCOES.includes(m)
        ? m
        : MINUTOS_OPCOES.reduce((maisProximo, v) => (Math.abs(v - m) < Math.abs(maisProximo - m) ? v : maisProximo), 0);
    } else {
      horaSel = null;
      minutoSel = null;
    }
  }
  aplicarValorInicial(opts.valorInicial || "");

  function textoValor() {
    if (horaSel === null || minutoSel === null) return "";
    return `${String(horaSel).padStart(2, "0")}:${String(minutoSel).padStart(2, "0")}`;
  }

  function render() {
    colHoras.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seletor-hora__item";
      btn.textContent = String(h).padStart(2, "0");
      if (h === horaSel) btn.classList.add("selecionado");
      btn.addEventListener("click", () => { horaSel = h; render(); });
      colHoras.appendChild(btn);
    }
    colMinutos.innerHTML = "";
    MINUTOS_OPCOES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seletor-hora__item";
      btn.textContent = String(m).padStart(2, "0");
      if (m === minutoSel) btn.classList.add("selecionado");
      btn.addEventListener("click", () => { minutoSel = m; render(); });
      colMinutos.appendChild(btn);
    });
    if (btnConfirmar) btnConfirmar.disabled = horaSel === null || minutoSel === null;
  }

  input.addEventListener("click", () => {
    document.querySelectorAll(".seletor-hora.aberto").forEach((c) => {
      if (c !== container) c.classList.remove("aberto");
    });
    container.classList.toggle("aberto");
    if (container.classList.contains("aberto")) {
      // centraliza o item selecionado dentro da própria coluna, sem rolar a página
      // (scrollIntoView rolaria a janela inteira, não só a coluna)
      requestAnimationFrame(() => {
        centralizarNaColuna(colHoras, colHoras.querySelector(".selecionado"));
        centralizarNaColuna(colMinutos, colMinutos.querySelector(".selecionado"));
      });
    }
  });
  document.addEventListener("click", (e) => {
    // usa composedPath() em vez de container.contains(e.target): ao clicar numa hora/minuto,
    // o próprio clique dispara render() (que recria os botões), então quando esse listener no
    // document roda (na fase de propagação), o botão clicado já foi removido do DOM e
    // "contains" daria falso positivo de "clique fora", fechando o seletor sem querer.
    // composedPath() reflete a árvore no momento do clique, antes dessa recriação.
    const caminho = typeof e.composedPath === "function" ? e.composedPath() : [];
    const cliqueDentro = caminho.includes(container) || container.contains(e.target);
    if (!cliqueDentro && e.target !== input) {
      container.classList.remove("aberto");
    }
  });

  btnLimpar?.addEventListener("click", () => {
    horaSel = null;
    minutoSel = null;
    input.value = "";
    render();
    container.classList.remove("aberto");
    aoSelecionar("");
  });
  btnConfirmar?.addEventListener("click", () => {
    if (horaSel === null || minutoSel === null) return;
    const valor = textoValor();
    input.value = valor;
    container.classList.remove("aberto");
    aoSelecionar(valor);
  });

  input.value = textoValor();
  render();

  return {
    definirValor(hhmm) {
      aplicarValorInicial(hhmm || "");
      input.value = textoValor();
      render();
    },
    obterValor() {
      return textoValor();
    }
  };
}

/* ---------- Calendário personalizado reutilizável ----------
   container: elemento .calendario (com [data-mes-ano], [data-dias], [data-nav-anterior], [data-nav-proximo])
   input: campo de texto (readonly) onde a data formatada é exibida
   opts: { valorInicial, minIso, maxIso, aoSelecionar(iso) }
   Retorna { definirValor(iso), obterValor() } */
export function criarCalendario(container, input, opts = {}) {
  const elMesAno = container.querySelector("[data-mes-ano]");
  const elDias = container.querySelector("[data-dias]");
  const btnAnterior = container.querySelector("[data-nav-anterior]");
  const btnProximo = container.querySelector("[data-nav-proximo]");
  const aoSelecionar = opts.aoSelecionar || (() => {});
  let minIso = opts.minIso || null;
  let maxIso = opts.maxIso || null;

  let dataSelecionada = opts.valorInicial || null;
  let mesAtual = dataSelecionada
    ? new Date(isoParaData(dataSelecionada).getFullYear(), isoParaData(dataSelecionada).getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function podeSelecionar(iso) {
    if (minIso && iso < minIso) return false;
    if (maxIso && iso > maxIso) return false;
    return true;
  }

  function render() {
    // com data máxima definida, não deixa avançar pra um mês inteiramente depois dela
    if (btnProximo && maxIso) {
      btnProximo.disabled = dataParaIso(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1)) > maxIso;
    }
    const nomeMes = MESES[mesAtual.getMonth()];
    elMesAno.textContent = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${mesAtual.getFullYear()}`;
    elDias.innerHTML = "";

    const primeiroDiaSemana = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).getDay();
    const totalDias = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaSemana; i++) {
      const vazio = document.createElement("span");
      vazio.className = "calendario__vazio";
      elDias.appendChild(vazio);
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const d = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), dia);
      const iso = dataParaIso(d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendario__dia";
      btn.textContent = dia;

      if (podeSelecionar(iso)) {
        btn.classList.add("disponivel");
        if (iso === dataSelecionada) btn.classList.add("selecionado");
        btn.addEventListener("click", () => {
          dataSelecionada = iso;
          input.value = formatarDataBR(iso);
          container.classList.remove("aberto");
          render();
          aoSelecionar(iso);
        });
      }
      elDias.appendChild(btn);
    }
  }

  btnAnterior?.addEventListener("click", () => {
    mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1);
    render();
  });
  btnProximo?.addEventListener("click", () => {
    if (btnProximo.disabled) return;
    mesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1);
    render();
  });

  input.addEventListener("click", () => {
    document.querySelectorAll(".calendario.aberto").forEach((c) => {
      if (c !== container) c.classList.remove("aberto");
    });
    container.classList.toggle("aberto");
  });
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target) && e.target !== input) {
      container.classList.remove("aberto");
    }
  });

  if (dataSelecionada) input.value = formatarDataBR(dataSelecionada);
  render();

  return {
    definirValor(iso) {
      dataSelecionada = iso || null;
      input.value = iso ? formatarDataBR(iso) : "";
      if (iso) mesAtual = new Date(isoParaData(iso).getFullYear(), isoParaData(iso).getMonth(), 1);
      render();
    },
    obterValor() {
      return dataSelecionada;
    },
    definirLimites(novoMinIso, novoMaxIso) {
      minIso = novoMinIso ?? minIso;
      maxIso = novoMaxIso ?? maxIso;
      render();
    }
  };
}


/* ---------- Campo de data com calendário personalizado (datas de nascimento etc.) ----------
   Mostra "Toque para escolher a data"; ao tocar abre um calendário com mês e ano para escolher
   direto (dá para voltar décadas em dois toques). Guarda a data como "aaaa-mm-dd".
   opts: { valorIso, aoMudar(iso), placeholder, maxIso, anoInicial, anosAtras, anosAFrente } */
export function criarCampoData(opts = {}) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const maxIso = opts.maxIso || null;
  const anoMax = maxIso ? Math.min(Number(maxIso.slice(0, 4)), anoAtual + (opts.anosAFrente ?? 0)) : anoAtual + (opts.anosAFrente ?? 5);
  const anoMin = anoAtual - (opts.anosAtras ?? 110);
  let selecionada = opts.valorIso && /^\d{4}-\d{2}-\d{2}$/.test(opts.valorIso) ? opts.valorIso : "";
  const base = selecionada ? isoParaData(selecionada) : null;
  let mes = base ? base.getMonth() : hoje.getMonth();
  let ano = base ? base.getFullYear() : Math.min(opts.anoInicial || anoAtual, anoMax);

  const caixa = document.createElement("div");
  caixa.className = "campo-data";
  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.className = "campo-clicavel";
  input.placeholder = opts.placeholder || "Toque para escolher a data";
  input.autocomplete = "off";
  input.setAttribute("inputmode", "none");
  input.value = selecionada ? formatarDataBR(selecionada) : "";
  const cal = document.createElement("div");
  cal.className = "calendario calendario--campo";
  cal.innerHTML = `
    <div class="calendario__cabecalho calendario__cabecalho--campo">
      <button type="button" class="calendario__nav" data-ant aria-label="Mês anterior">‹</button>
      <span class="calendario__selecoes">
        <select data-mes aria-label="Mês"></select>
        <select data-ano aria-label="Ano"></select>
      </span>
      <button type="button" class="calendario__nav" data-prox aria-label="Próximo mês">›</button>
    </div>
    <div class="calendario__semana"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="calendario__dias" data-dias></div>
    <div class="calendario__rodape"><button type="button" class="calendario__link" data-limpar>Limpar</button><button type="button" class="calendario__link" data-fechar>Fechar</button></div>`;
  caixa.append(input, cal);

  const selMes = cal.querySelector("[data-mes]");
  const selAno = cal.querySelector("[data-ano]");
  const elDias = cal.querySelector("[data-dias]");
  MESES.forEach((m, i) => selMes.add(new Option(m.charAt(0).toUpperCase() + m.slice(1), String(i))));
  for (let a = anoMax; a >= anoMin; a--) selAno.add(new Option(String(a), String(a)));

  function desenhar() {
    selMes.value = String(mes);
    selAno.value = String(ano);
    elDias.innerHTML = "";
    const primeiro = new Date(ano, mes, 1).getDay();
    const total = new Date(ano, mes + 1, 0).getDate();
    for (let i = 0; i < primeiro; i++) { const v = document.createElement("span"); v.className = "calendario__vazio"; elDias.appendChild(v); }
    for (let dia = 1; dia <= total; dia++) {
      const iso = dataParaIso(new Date(ano, mes, dia));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendario__dia";
      btn.textContent = dia;
      if (!maxIso || iso <= maxIso) {
        btn.classList.add("disponivel");
        if (iso === selecionada) btn.classList.add("selecionado");
        btn.addEventListener("click", () => definir(iso, true));
      }
      elDias.appendChild(btn);
    }
    cal.querySelector("[data-ant]").disabled = ano <= anoMin && mes === 0;
    cal.querySelector("[data-prox]").disabled = ano >= anoMax && mes === 11;
  }
  function definir(iso, fechar) {
    selecionada = iso || "";
    input.value = iso ? formatarDataBR(iso) : "";
    if (iso) { const d = isoParaData(iso); mes = d.getMonth(); ano = d.getFullYear(); }
    desenhar();
    if (fechar) cal.classList.remove("aberto");
    opts.aoMudar?.(selecionada);
  }

  const mover = (delta) => {
    const d = new Date(ano, mes + delta, 1);
    mes = d.getMonth(); ano = d.getFullYear();
    desenhar();
  };
  cal.querySelector("[data-ant]").addEventListener("click", () => mover(-1));
  cal.querySelector("[data-prox]").addEventListener("click", () => mover(1));
  selMes.addEventListener("change", () => { mes = Number(selMes.value); desenhar(); });
  selAno.addEventListener("change", () => { ano = Number(selAno.value); desenhar(); });
  cal.querySelector("[data-limpar]").addEventListener("click", () => { definir("", true); });
  cal.querySelector("[data-fechar]").addEventListener("click", () => cal.classList.remove("aberto"));
  input.addEventListener("click", () => {
    document.querySelectorAll(".calendario--campo.aberto").forEach((c) => { if (c !== cal) c.classList.remove("aberto"); });
    cal.classList.toggle("aberto");
  });
  document.addEventListener("click", (e) => { if (!caixa.contains(e.target) && !e.target.closest?.(".calendario--campo")) cal.classList.remove("aberto"); });

  desenhar();
  return caixa;
}

/* ---------- Arquivo de listas de intenções ----------
   Uma lista vai para o "Histórico (arquivo)" do painel quando já foi ENVIADA por e-mail há
   ARQUIVAR_LISTA_APOS_DIAS dias ou mais e a missa já passou. Nada é apagado do banco de dados:
   só muda de lugar na tela do painel administrativo. */
export const ARQUIVAR_LISTA_APOS_DIAS = 2;
export function listaArquivada(envio, dataMissa, horaMissa, agora = new Date()) {
  if (!envio || envio.status !== "enviado" || !envio.enviadoEm) return false;
  const enviadoEm = new Date(envio.enviadoEm).getTime();
  if (!(enviadoEm > 0)) return false;
  if (agora.getTime() - enviadoEm < ARQUIVAR_LISTA_APOS_DIAS * 24 * 3600000) return false;
  const missa = new Date(`${dataMissa}T${String(Number(horaMissa)).padStart(2, "0")}:00:00-03:00`).getTime();
  return agora.getTime() >= missa + 3 * 3600000;
}
