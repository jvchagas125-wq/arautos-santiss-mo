// Geração do PDF de intenções — compartilhado entre o painel administrativo (baixa o arquivo,
// ver js/admin.js) e o site público (abre numa aba nova só pra visualizar, ver js/intencoes.js).
// Centralizado aqui pra nunca ficar um PDF com aparência diferente dependendo de quem gerou.
import { CATEGORIAS_INTENCAO } from "./utils.js";

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
export function construirPdfIntencoes(rotulo, itens) {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ unit: "pt", format: "a4" });
  const larguraPagina = docPdf.internal.pageSize.getWidth();
  const alturaPagina = docPdf.internal.pageSize.getHeight();
  const margem = 50;
  const larguraUtil = larguraPagina - margem * 2;
  let y = margem;

  function quebrarPaginaSeNecessario(alturaNecessaria) {
    if (y + alturaNecessaria > alturaPagina - margem) {
      docPdf.addPage();
      y = margem;
    }
  }

  docPdf.setFont("times", "bold");
  docPdf.setFontSize(16);
  docPdf.setTextColor(122, 12, 30);
  docPdf.text("Arautos do Evangelho Campos", larguraPagina / 2, y, { align: "center" });
  y += 20;

  docPdf.setFont("times", "normal");
  docPdf.setFontSize(11);
  docPdf.setTextColor(90, 70, 54);
  docPdf.text("Intenções da Santa Missa", larguraPagina / 2, y, { align: "center" });
  y += 24;

  docPdf.setDrawColor(205, 164, 52);
  docPdf.setLineWidth(1);
  docPdf.line(margem, y, larguraPagina - margem, y);
  y += 26;

  docPdf.setFont("times", "bold");
  docPdf.setFontSize(13);
  docPdf.setTextColor(40, 24, 16);
  docPdf.text(rotulo, margem, y);
  y += 26;

  let totalItens = 0;
  const LINHAS_EXTRAS_POR_TOPICO = 2; // linhas em branco pro padre acrescentar à mão um nome de última hora
  const categoriasComItens = CATEGORIAS_INTENCAO.filter(
    ({ chave }) => itens.filter((it) => it.categoria === chave).length > 0
  );
  categoriasComItens.forEach(({ chave, rotulo: rotuloCategoria }, indice) => {
    const doGrupo = itens.filter((it) => it.categoria === chave);
    totalItens += doGrupo.length;

    quebrarPaginaSeNecessario(28);
    docPdf.setFont("times", "bold");
    docPdf.setFontSize(12);
    docPdf.setTextColor(122, 12, 30);
    docPdf.text(rotuloCategoria, margem, y);
    y += 20;

    docPdf.setFont("times", "normal");
    docPdf.setFontSize(11);
    docPdf.setTextColor(40, 24, 16);

    const linhas = docPdf.splitTextToSize(extrairTextosCategoria(doGrupo), larguraUtil - 12);
    quebrarPaginaSeNecessario(linhas.length * 15 + 6);
    docPdf.text(linhas, margem + 12, y);
    y += linhas.length * 15 + 6;
    y += 10;

    // linhas em branco extras, pra dar espaço de acrescentar nomes à mão depois de impresso
    quebrarPaginaSeNecessario(LINHAS_EXTRAS_POR_TOPICO * 20);
    docPdf.setDrawColor(196, 178, 158);
    docPdf.setLineWidth(0.6);
    for (let i = 0; i < LINHAS_EXTRAS_POR_TOPICO; i++) {
      docPdf.line(margem + 12, y, larguraPagina - margem, y);
      y += 20;
    }
    y += 4;

    // linha separadora entre um tópico e o próximo (não desenha depois do último)
    if (indice < categoriasComItens.length - 1) {
      quebrarPaginaSeNecessario(20);
      docPdf.setDrawColor(205, 164, 52);
      docPdf.setLineWidth(0.7);
      docPdf.line(margem, y, larguraPagina - margem, y);
      y += 20;
    }
  });

  if (totalItens === 0) {
    docPdf.setFont("times", "italic");
    docPdf.setFontSize(11);
    docPdf.setTextColor(90, 70, 54);
    docPdf.text("Nenhuma intenção foi adicionada a esta lista.", margem, y);
  }

  const carimbo = new Date().toLocaleString("pt-BR");
  docPdf.setFontSize(8);
  docPdf.setTextColor(140, 120, 100);
  docPdf.text(`Gerado em ${carimbo}`, margem, alturaPagina - 24);

  return docPdf;
}

export function nomeArquivoPdf(rotulo) {
  const base = `intencoes-${rotulo}`
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}.pdf`;
}

// Carrega a biblioteca jsPDF sob demanda — usado no site público, que não carrega ela de cara
// (só quem realmente clicar em "Ver PDF da lista" paga esse custo). No painel administrativo a
// biblioteca já vem carregada direto no admin.html, então essa função só confirma que já está
// pronta e resolve na hora.
let promessaJsPDF = null;
export function carregarJsPDF() {
  if (typeof window.jspdf !== "undefined") return Promise.resolve();
  if (!promessaJsPDF) {
    promessaJsPDF = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      script.onload = () => resolve();
      script.onerror = () => {
        promessaJsPDF = null; // permite tentar de novo numa próxima chamada
        reject(new Error("Não foi possível carregar o gerador de PDF."));
      };
      document.head.appendChild(script);
    });
  }
  return promessaJsPDF;
}
