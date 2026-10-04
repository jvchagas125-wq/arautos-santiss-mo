// Geração do PDF de intenções — compartilhado entre o painel administrativo (baixa o arquivo,
// ver js/admin.js) e o envio automático por e-mail (roda no servidor, ver api/enviar-listas.js).
// Centralizado aqui pra nunca ficar um PDF com aparência diferente dependendo de quem gerou.
// Este arquivo roda tanto no navegador quanto no Node (servidor) — por isso nada aqui pode
// depender de "window"/"document" sem passar pelas opções de construirPdfIntencoes.
import { CATEGORIAS_INTENCAO, INTENCAO_FIXA_ALMA, formatarDataComDiaSemana } from "./utils.js";

// O PDF usa uma fonte PRÓPRIA (embutida no arquivo) em vez da fonte "times" padrão do jsPDF.
// Motivo: a fonte "times" padrão não vem embutida no PDF — cada leitor de PDF (navegador,
// celular, impressora...) usa a sua própria versão/substituta de "Times", e descobrimos que
// vários leitores erram justamente nos nomes com acento (ã, õ, ç...): letras somem, e o texto
// aparece "esticado"/com espaçamento estranho. Embutindo a fonte, o texto fica garantido
// idêntico em qualquer lugar que o PDF for aberto. A Liberation Serif foi desenhada pra ter as
// mesmas larguras de letra da Times New Roman, então o visual do PDF não muda.
const NOME_FONTE_PDF = "LiberationSerif";
const CAMINHOS_FONTE_PDF = {
  normal: "assets/fonts/LiberationSerif-Regular.ttf",
  bold: "assets/fonts/LiberationSerif-Bold.ttf",
  italic: "assets/fonts/LiberationSerif-Italic.ttf",
  bolditalic: "assets/fonts/LiberationSerif-BoldItalic.ttf",
};

// Busca os 4 arquivos da fonte e devolve cada um já em base64 (formato que o jsPDF espera pra
// embutir no PDF). Só busca uma vez por carregamento de página — as próximas chamadas (gerar
// outro PDF, baixar de novo etc.) reaproveitam o mesmo resultado.
let promessaBase64DaFonte = null;
function carregarBase64DaFonte() {
  if (!promessaBase64DaFonte) {
    promessaBase64DaFonte = Promise.all(
      Object.entries(CAMINHOS_FONTE_PDF).map(async ([estilo, caminho]) => {
        const resposta = await fetch(caminho);
        if (!resposta.ok) throw new Error(`Não foi possível carregar a fonte do PDF (${caminho}).`);
        const bytes = new Uint8Array(await resposta.arrayBuffer());
        // ArrayBuffer -> base64, em pedaços, pra não estourar a pilha com arquivos grandes
        let binario = "";
        const TAMANHO_PEDACO = 0x8000;
        for (let i = 0; i < bytes.length; i += TAMANHO_PEDACO) {
          binario += String.fromCharCode.apply(null, bytes.subarray(i, i + TAMANHO_PEDACO));
        }
        return [estilo, btoa(binario)];
      })
    ).then((pares) => Object.fromEntries(pares));
  }
  return promessaBase64DaFonte;
}

// Registra a fonte embutida nesse documento jsPDF específico (o registro é por documento, não
// é algo global — cada novo PDF gerado precisa registrar de novo, mas reaproveita os arquivos já
// baixados/convertidos por carregarBase64DaFonte acima).
// No servidor não existe fetch de caminho relativo — quem chama passa "fontesBase64" já pronto
// (lido do disco, ver api/enviar-listas.js); no navegador, busca os arquivos como sempre.
async function registrarFontePdf(docPdf, fontesBase64) {
  const base64PorEstilo = fontesBase64 || (await carregarBase64DaFonte());
  Object.entries(base64PorEstilo).forEach(([estilo, base64]) => {
    const arquivo = `LiberationSerif-${estilo}.ttf`;
    docPdf.addFileToVFS(arquivo, base64);
    docPdf.addFont(arquivo, NOME_FONTE_PDF, estilo);
  });
}

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

// Monta o PDF com as intenções de uma lista específica, organizadas por categoria (mesma
// ordem/agrupamento exibido na tela) — pronto pra imprimir e levar pra missa. Devolve o objeto
// jsPDF já pronto; quem chamou decide o que fazer com ele (salvar como arquivo, abrir numa aba
// nova etc.) — ver construirPdfIntencoes() sendo usado em js/admin.js e js/intencoes.js.
// É assíncrona porque precisa buscar e embutir a fonte (ver registrarFontePdf acima) antes de
// desenhar qualquer texto.
// opcoes (só usadas no servidor): { jsPDF } = a classe jsPDF vinda do npm (no navegador vem de
// window.jspdf), { fontesBase64 } = fontes já lidas do disco em base64 (ver CAMINHOS_FONTE_PDF).
export async function construirPdfIntencoes(rotulo, itens, opcoes = {}) {
  const jsPDF = opcoes.jsPDF || window.jspdf.jsPDF;
  const docPdf = new jsPDF({ unit: "pt", format: "a4" });
  await registrarFontePdf(docPdf, opcoes.fontesBase64);
  const larguraPagina = docPdf.internal.pageSize.getWidth();
  const alturaPagina = docPdf.internal.pageSize.getHeight();
  const margem = 50;
  const larguraUtil = larguraPagina - margem * 2;
  const ALTURA_LINHA_TEXTO = 15;
  let y = margem;

  function quebrarPaginaSeNecessario(alturaNecessaria) {
    if (y + alturaNecessaria > alturaPagina - margem) {
      docPdf.addPage();
      y = margem;
    }
  }

  docPdf.setFont(NOME_FONTE_PDF, "bold");
  docPdf.setFontSize(16);
  docPdf.setTextColor(122, 12, 30);
  docPdf.text("Arautos do Evangelho Campos", larguraPagina / 2, y, { align: "center" });
  y += 20;

  docPdf.setFont(NOME_FONTE_PDF, "normal");
  docPdf.setFontSize(11);
  docPdf.setTextColor(90, 70, 54);
  docPdf.text("Intenções da Santa Missa", larguraPagina / 2, y, { align: "center" });
  y += 24;

  docPdf.setDrawColor(205, 164, 52);
  docPdf.setLineWidth(1);
  docPdf.line(margem, y, larguraPagina - margem, y);
  y += 26;

  docPdf.setFont(NOME_FONTE_PDF, "bold");
  docPdf.setFontSize(13);
  docPdf.setTextColor(40, 24, 16);
  docPdf.text(rotulo, margem, y);
  y += 26;

  const LINHAS_EXTRAS_POR_TOPICO = 2; // linhas em branco pro padre acrescentar à mão um nome de última hora
  // "Por alma" sempre entra, mesmo sem ninguém ter colocado nome nenhum — ela sempre termina com
  // a intenção fixa (INTENCAO_FIXA_ALMA), então nunca fica realmente "vazia" no PDF.
  const categoriasComItens = CATEGORIAS_INTENCAO.filter(
    ({ chave }) => chave === "alma" || itens.filter((it) => it.categoria === chave).length > 0
  );
  categoriasComItens.forEach(({ chave, rotulo: rotuloCategoria }, indice) => {
    const doGrupo = itens.filter((it) => it.categoria === chave);
    const ehAlma = chave === "alma";

    // em "Por alma" a intenção fixa NÃO entra misturada com o "e" dos nomes reais (só entra se
    // tiver algum nome real) — ela ganha sua própria linha reservada mais abaixo, pra ser a
    // última coisa lida.
    docPdf.setFont(NOME_FONTE_PDF, "normal");
    docPdf.setFontSize(11);
    const textoReal = extrairTextosCategoria(doGrupo);
    const linhas = textoReal ? docPdf.splitTextToSize(textoReal, larguraUtil - 12) : [];

    // o título de uma categoria nunca fica sozinho no fim de uma página — exige espaço pra ele
    // junto de pelo menos o começo do que vem logo depois (uma linha do parágrafo, ou a primeira
    // linha reservada em branco, se a categoria não tiver nenhum nome real)
    const alturaDoComeco = linhas.length > 0 ? ALTURA_LINHA_TEXTO : 20;
    quebrarPaginaSeNecessario(28 + alturaDoComeco);

    docPdf.setFont(NOME_FONTE_PDF, "bold");
    docPdf.setFontSize(12);
    docPdf.setTextColor(122, 12, 30);
    docPdf.text(rotuloCategoria, margem, y);
    y += 20;

    docPdf.setFont(NOME_FONTE_PDF, "normal");
    docPdf.setFontSize(11);
    docPdf.setTextColor(40, 24, 16);

    // desenha uma linha de cada vez (em vez do parágrafo inteiro de uma vez) — assim, numa lista
    // comprida, dá pra pular de página exatamente onde o espaço acaba, aproveitando o que sobrou
    // na página atual em vez de jogar a lista inteira pra página seguinte.
    linhas.forEach((linha) => {
      quebrarPaginaSeNecessario(ALTURA_LINHA_TEXTO);
      docPdf.text(linha, margem + 12, y);
      y += ALTURA_LINHA_TEXTO;
    });
    if (linhas.length > 0) y += 8;

    if (ehAlma) {
      // 1ª linha reservada: fica em branco, pra escreverem à mão na hora da missa, se precisar.
      quebrarPaginaSeNecessario(20);
      docPdf.setDrawColor(196, 178, 158);
      docPdf.setLineWidth(0.6);
      docPdf.line(margem + 12, y, larguraPagina - margem, y);
      y += 20;

      // 2ª linha reservada: já vem com a intenção fixa impressa, pra ser a última intenção falada.
      quebrarPaginaSeNecessario(20);
      docPdf.setFont(NOME_FONTE_PDF, "italic");
      docPdf.setFontSize(11);
      docPdf.setTextColor(40, 24, 16);
      docPdf.text(INTENCAO_FIXA_ALMA, margem + 12, y - 6);
      y += 20 + 4;
    } else {
      // linhas em branco extras, pra dar espaço de acrescentar nomes à mão depois de impresso
      quebrarPaginaSeNecessario(LINHAS_EXTRAS_POR_TOPICO * 20);
      docPdf.setDrawColor(196, 178, 158);
      docPdf.setLineWidth(0.6);
      for (let i = 0; i < LINHAS_EXTRAS_POR_TOPICO; i++) {
        docPdf.line(margem + 12, y, larguraPagina - margem, y);
        y += 20;
      }
      y += 4;
    }

    // linha separadora entre um tópico e o próximo (não desenha depois do último)
    if (indice < categoriasComItens.length - 1) {
      quebrarPaginaSeNecessario(20);
      docPdf.setDrawColor(205, 164, 52);
      docPdf.setLineWidth(0.7);
      docPdf.line(margem, y, larguraPagina - margem, y);
      y += 20;
    }
  });

  // "Por alma" sempre aparece (com a intenção fixa), então a lista nunca fica realmente vazia —
  // esse aviso só entraria se um dia não houvesse categoria nenhuma pra mostrar.
  if (categoriasComItens.length === 0) {
    docPdf.setFont(NOME_FONTE_PDF, "italic");
    docPdf.setFontSize(11);
    docPdf.setTextColor(90, 70, 54);
    docPdf.text("Nenhuma intenção foi adicionada a esta lista.", margem, y);
  }

  // sempre no horário de Brasília — no servidor (que roda em UTC) o carimbo sairia 3h adiantado
  const carimbo = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  docPdf.setFontSize(8);
  docPdf.setTextColor(140, 120, 100);
  docPdf.text(`Gerado em ${carimbo}`, margem, alturaPagina - 24);

  return docPdf;
}

// Título de uma lista (mesmo texto no painel admin, no PDF e no assunto do e-mail).
export function rotuloListaIntencao(dataMissa, horaMissa) {
  return `Missa de ${formatarDataComDiaSemana(dataMissa)} às ${String(horaMissa).padStart(2, "0")}:00`;
}

// Caminhos das fontes (relativos à raiz do projeto) — o servidor lê estes arquivos do disco.
export { CAMINHOS_FONTE_PDF };

export function nomeArquivoPdf(rotulo) {
  const base = `intencoes-${rotulo}`
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}.pdf`;
}
