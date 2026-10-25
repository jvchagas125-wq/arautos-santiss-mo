// Documento Word (.docx) com a lista de intenções de uma missa — compartilhado entre o painel
// administrativo (baixa o arquivo, ver js/admin.js) e o envio automático por e-mail (roda no
// servidor, ver api/enviar-listas.js). Centralizado aqui pra nunca ficar um documento com
// aparência diferente dependendo de quem gerou.
//
// Este arquivo roda tanto no navegador quanto no Node: quem chama passa a biblioteca "docx"
// (no navegador ela vem do <script> do admin.html em window.docx; no servidor, do npm).
// O documento é EDITÁVEL: as linhas em branco pra acrescentar nomes à mão são parágrafos comuns
// com uma linha embaixo, e todo o texto é texto normal do Word.
import { CATEGORIAS_PADRAO, formatarDataComDiaSemana, separarNomesDoItem } from "./utils.js";

// Fonte que todo computador com Word tem — o documento não embute fonte nenhuma.
const FONTE = "Times New Roman";

// Nenhuma categoria monta frase nenhuma — cada intenção aparece exatamente do jeito que a
// pessoa escreveu, e todas as de uma mesma categoria/missa ficam juntas numa lista corrida,
// separadas por vírgula (com um "e" antes da última), do jeito que fica bom pro padre ler na
// missa. Ex.: "Fulano, Beltrano e Cicrano."
export function extrairTextosCategoria(doGrupo) {
  const textos = doGrupo
    .map((it) => (it.texto || "").trim().replace(/[.,;:]+$/, ""))
    .filter(Boolean);
  if (textos.length === 0) return "";
  if (textos.length === 1) return `${textos[0]}.`;
  return `${textos.slice(0, -1).join(", ")} e ${textos[textos.length - 1]}.`;
}

// Título de uma lista (mesmo texto no painel admin, no documento e no assunto do e-mail).
export function rotuloListaIntencao(dataMissa, horaMissa) {
  return `Missa de ${formatarDataComDiaSemana(dataMissa)} às ${String(horaMissa).padStart(2, "0")}:00`;
}

export function nomeArquivoDocx(rotulo) {
  const base = `intencoes-${rotulo}`
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}.docx`;
}

// Monta o objeto Document (da biblioteca docx) com as intenções da lista, organizadas por
// categoria — mesma ordem/agrupamento exibido na tela. Quem chamou transforma em arquivo:
// no navegador com docx.Packer.toBlob(doc), no servidor com docx.Packer.toBuffer(doc).
export function construirDocxIntencoes(rotulo, itens, opcoes = {}) {
  const docx = opcoes.docx || window.docx;
  const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, Footer, SectionType } = docx;
  // categorias editáveis no painel; sem elas (ou nos testes), as de fábrica
  let categorias = Array.isArray(opcoes.categorias) && opcoes.categorias.length ? opcoes.categorias : CATEGORIAS_PADRAO;
  // missa com categorias liberadas só para algumas (dias com horário diferente): o documento mostra apenas elas
  if (Array.isArray(opcoes.categoriasPermitidas) && opcoes.categoriasPermitidas.length) {
    const liberadas = new Set(opcoes.categoriasPermitidas);
    categorias = categorias.filter((c) => liberadas.has(c.chave));
    itens = itens.filter((it) => liberadas.has(it.categoria));
  }

  const VINHO = "7A0C1E", DOURADO = "CDA434", MARROM = "5A4636", TEXTO = "281810", LINHA = "C4B29E";
  const RECUO = 240; // 12pt, como no modelo antigo

  // tamanhos em "meio ponto" (docx usa half-points): 11pt = 22
  const run = (texto, o = {}) => new TextRun({ text: texto, font: FONTE, size: 22, color: TEXTO, ...o });
  const regra = (cor, espessura, espaco = 1) => ({
    bottom: { style: BorderStyle.SINGLE, size: espessura, color: cor, space: espaco }
  });

  // O documento é uma sequência de "blocos" (seções contínuas do Word): os blocos de 1 coluna levam
  // títulos, linhas em branco etc.; os de 2 ou 3 colunas levam só os nomes, que o próprio Word
  // distribui (um embaixo do outro, coluna por coluna) e equilibra no fim do bloco.
  const blocos = [{ colunas: 1, filhos: [] }];
  const novoBloco = (colunas) => { blocos.push({ colunas, filhos: [] }); };
  const filhos = { push: (...itens) => blocos[blocos.length - 1].filhos.push(...itens) };

  filhos.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [run("Arautos do Evangelho Campos", { bold: true, size: 32, color: VINHO })]
  }));
  filhos.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    border: regra(DOURADO, 8, 8),
    children: [run("Intenções da Santa Missa", { size: 22, color: MARROM })]
  }));
  filhos.push(new Paragraph({
    spacing: { before: 200, after: 280 }, keepNext: true,
    children: [run(rotulo, { bold: true, size: 26 })]
  }));

  const LINHAS_EXTRAS_POR_TOPICO = 2; // linhas em branco pro padre acrescentar à mão um nome de última hora
  // Obs.: o Word junta parágrafos seguidos com a mesma borda num só (as duas linhas virariam uma).
  // Por isso cada linha em branco vem acompanhada de um parágrafo "espaçador" minúsculo sem borda.
  const linhaEmBranco = () => [
    new Paragraph({
      spacing: { before: 280, after: 0 }, indent: { left: RECUO },
      border: regra(LINHA, 4), children: [run("")]
    }),
    new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: "exact" }, children: [run("", { size: 2 })] })
  ];

  // Uma categoria sempre entra quando tem um "texto fixo" (por padrão, "Por alma": termina com a
  // intenção fixa, então nunca fica realmente vazia no documento); as demais só entram quando
  // alguém colocou algum nome.
  // Intenções de categorias que foram apagadas do painel depois de enviadas não somem: viram "Outras intenções".
  const chavesConhecidas = new Set(categorias.map((c) => c.chave));
  const orfas = itens.filter((it) => !chavesConhecidas.has(it.categoria));
  const categoriasDoDocumento = orfas.length
    ? [...categorias, { chave: "__outras__", rotulo: "Outras intenções", textoFixo: "" }]
    : categorias;
  const itensDe = (chave) => (chave === "__outras__" ? orfas : itens.filter((it) => it.categoria === chave));

  const categoriasComItens = categoriasDoDocumento.filter(
    (c) => c.textoFixo || itensDe(c.chave).length > 0
  );

  // Nomes em colunas de verdade do Word (um embaixo do outro, coluna por coluna) pra não ocupar
  // várias páginas. Falecimento/nomes: até 4 nomes numa coluna, até 8 em duas, acima disso três.
  // Aniversários têm textos mais longos (ex.: "Fulano e Fulana (25 anos de casados – Bodas de Prata)"):
  // uma coluna, ou duas quando são muitos.
  const LARGURA_UTIL = 11906 - 2 * 1000 - RECUO;
  const ESPACO_COLUNAS = 360;
  function nomesDoGrupo(doGrupo, tipo) {
    // Categoria de falecimento: se alguém colocou vários nomes numa intenção só (separados por
    // vírgula), cada nome vira uma linha própria — também nas intenções antigas.
    const textos = doGrupo.flatMap((it) => {
      const destaque = it.destaque === true;
      const partes = tipo === "falecimento" ? separarNomesDoItem(it.texto) : [(it.texto || "").trim().replace(/[.,;:]+$/, "")];
      return partes.map((texto) => ({ texto, negrito: destaque }));
    });
    return textos.filter((n) => n.texto);
  }
  function colunasPara(tipo, quantidade) {
    if (tipo === "aniversario") return quantidade <= 8 ? 1 : 2;
    return quantidade <= 4 ? 1 : quantidade <= 8 ? 2 : 3;
  }
  // Devolve true se colocou os nomes (num bloco próprio de colunas).
  function colocarNomes(doGrupo, tipo) {
    const nomes = nomesDoGrupo(doGrupo, tipo);
    if (nomes.length === 0) return false;
    const colunas = colunasPara(tipo, nomes.length);
    if (colunas > 1) novoBloco(colunas);
    nomes.forEach((n) => filhos.push(new Paragraph({
      spacing: { after: 80, line: 276 }, indent: { left: colunas > 1 ? 0 : RECUO }, keepLines: true,
      children: [run(n.texto, n.negrito ? { bold: true } : {})]
    })));
    if (colunas > 1) novoBloco(1);
    filhos.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [run("", { size: 4 })] }));
    return true;
  }

  categoriasComItens.forEach(({ chave, rotulo: rotuloCategoria, textoFixo, tipo }, indice) => {
    const doGrupo = itensDe(chave);

    // o título de uma categoria nunca fica sozinho no fim de uma página
    filhos.push(new Paragraph({
      spacing: { before: 120, after: 160 }, keepNext: true,
      children: [run(rotuloCategoria, { bold: true, size: 24, color: VINHO })]
    }));

    colocarNomes(doGrupo, tipo);

    if (textoFixo) {
      // 1ª linha reservada: fica em branco, pra escreverem à mão na hora da missa, se precisar.
      filhos.push(...linhaEmBranco());
      // 2ª linha reservada: já vem com a intenção fixa impressa, pra ser a última intenção falada.
      filhos.push(new Paragraph({
        spacing: { before: 200, after: 120 }, indent: { left: RECUO },
        children: [run(textoFixo, { italics: true })]
      }));
    } else {
      for (let i = 0; i < LINHAS_EXTRAS_POR_TOPICO; i++) filhos.push(...linhaEmBranco());
    }

    // linha separadora entre um tópico e o próximo (não desenha depois do último)
    if (indice < categoriasComItens.length - 1) {
      filhos.push(new Paragraph({
        spacing: { before: 200, after: 200 }, border: regra(DOURADO, 6), children: [run("")]
      }));
    }
  });

  // "Por alma" sempre aparece (com a intenção fixa), então a lista nunca fica realmente vazia —
  // esse aviso só entraria se um dia não houvesse categoria nenhuma pra mostrar.
  if (categoriasComItens.length === 0) {
    filhos.push(new Paragraph({
      children: [run("Nenhuma intenção foi adicionada a esta lista.", { italics: true, color: MARROM })]
    }));
  }

  // sempre no horário de Brasília — no servidor (que roda em UTC) o carimbo sairia 3h adiantado
  const carimbo = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } };
  const rodape = new Footer({
    children: [new Paragraph({ children: [new TextRun({ text: `Gerado em ${carimbo}`, font: FONTE, size: 16, color: "8C7864" })] })]
  });
  const secoes = blocos
    .filter((b) => b.filhos.length > 0)
    .map((b, i) => ({
      properties: {
        // A4, margens de 50pt (1000 twips) como no modelo antigo
        page: pagina,
        // seções seguintes continuam na mesma página (só muda o número de colunas)
        ...(i > 0 ? { type: SectionType.CONTINUOUS } : {}),
        ...(b.colunas > 1 ? { column: { count: b.colunas, space: ESPACO_COLUNAS, equalWidth: true } } : {})
      },
      // o rodapé é do documento inteiro: só a primeira seção o define, as outras herdam
      ...(i === 0 ? { footers: { default: rodape } } : {}),
      children: b.filhos
    }));

  return new Document({
    creator: "Arautos do Evangelho Campos",
    title: `Intenções da Santa Missa — ${rotulo}`,
    styles: { default: { document: { run: { font: FONTE, size: 22 } } } },
    sections: secoes
  });
}
