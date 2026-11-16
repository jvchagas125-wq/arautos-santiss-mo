// Exporta a lista de inscritos de um curso em Excel, Word ou PDF (feito no navegador do administrador).
// Excel usa a biblioteca ExcelJS e Word usa a "docx" (as duas já carregadas em admin.html); o PDF usa jsPDF,
// carregado só na hora de exportar (para não pesar o painel).
import { tabelaDeInscritos, tabelaDePresenca } from "./cursos-comum.js";

const VINHO = "7A0C1E", DOURADO = "CDA434";

function nomeBase(curso, prefixo = "inscritos") {
  const slug = String(curso.nome || "curso").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "curso";
  return `${prefixo}-${slug}`;
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const dataHoje = () => new Date().toLocaleDateString("pt-BR");

/* ---------- Excel ---------- */
async function gerarExcel(curso, { colunas, linhas }) {
  if (typeof window.ExcelJS === "undefined") throw new Error("Não foi possível carregar o gerador de Excel. Verifique sua conexão.");
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Arautos do Evangelho Campos";
  const ws = wb.addWorksheet("Inscritos", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.mergeCells(1, 1, 1, Math.max(colunas.length, 2));
  const titulo = ws.getCell(1, 1);
  titulo.value = `${curso.nome} — ${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"} (gerado em ${dataHoje()})`;
  titulo.font = { bold: true, size: 13, color: { argb: "FF" + VINHO } };
  ws.addRow([]);
  const cab = ws.addRow(colunas.map((c) => c.rotulo));
  cab.eachCell((cel) => {
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + VINHO } };
    cel.alignment = { vertical: "middle", wrapText: true };
  });
  linhas.forEach((l) => ws.addRow(colunas.map((c) => l[c.chave] ?? "")));
  colunas.forEach((c, i) => {
    const maior = Math.max(c.rotulo.length, ...linhas.map((l) => String(l[c.chave] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maior + 3, 14), 50);
  });
  ws.eachRow((row, n) => { if (n > 3) row.alignment = { vertical: "top", wrapText: true }; });
  if (linhas.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colunas.length } };
  const buffer = await wb.xlsx.writeBuffer();
  baixar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nomeBase(curso)}.xlsx`);
}

/* ---------- Word (lista de presença) ---------- */
// Folha 1: uma pessoa por linha (nome, telefone e os dados escolhidos no curso) com uma caixa para marcar
// a presença a caneta. Última folha: a mesma tabela em branco, para anotar quem chegar sem inscrição.
const LINHAS_EM_BRANCO_WORD = 13;
async function gerarWord(curso, inscricoes) {
  if (typeof window.docx === "undefined") throw new Error("Não foi possível carregar o gerador de Word. Verifique sua conexão.");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, PageOrientation, VerticalAlign, HeightRule } = window.docx;
  const { colunas, linhas } = tabelaDePresenca(curso, inscricoes);
  const larguraTotal = 15000; // A4 paisagem com margens estreitas (em twips)
  const pesos = [0.5, ...colunas.map((c) => c.peso), 1];
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  const larguras = pesos.map((p) => Math.floor((larguraTotal * p) / somaPesos));
  const total = larguras.reduce((a, b) => a + b, 0);
  const cabecalhos = ["Nº", ...colunas.map((c) => c.rotulo), "Presença"];

  const celula = (txt, i, { cab = false, centro = false, caixa = false } = {}) => new TableCell({
    width: { size: larguras[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: cab ? { type: ShadingType.CLEAR, fill: VINHO, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: centro || caixa ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun(caixa
        ? { text: "\u2610", size: 34, color: "281810", font: "Segoe UI Symbol" }
        : { text: String(txt ?? ""), bold: cab, size: 19, color: cab ? "FFFFFF" : "281810", font: "Calibri" })]
    })]
  });
  const linhaCab = () => new TableRow({
    tableHeader: true, cantSplit: true,
    children: cabecalhos.map((r, i) => celula(r, i, { cab: true, centro: i === 0 || i === cabecalhos.length - 1 }))
  });
  const linhaDados = (valores, n, altura) => new TableRow({
    cantSplit: true,
    height: { value: altura, rule: HeightRule.ATLEAST },
    children: [
      celula(n, 0, { centro: true }),
      ...colunas.map((c, i) => celula(valores ? valores[c.chave] : "", i + 1)),
      celula("", cabecalhos.length - 1, { caixa: true })
    ]
  });
  const tabela = (rows) => new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: larguras, rows });
  const titulo = (txt, sub) => [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: txt, bold: true, size: 32, color: VINHO, font: "Cambria" })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: sub, size: 20, color: "5A4636", font: "Calibri" })] })
  ];
  const pagina = { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 700, bottom: 700, left: 700, right: 700 } };

  const rowsLista = [linhaCab(), ...linhas.map((l, i) => linhaDados(l, i + 1, 480))];
  const rowsBranco = [linhaCab(), ...Array.from({ length: LINHAS_EM_BRANCO_WORD }, (_, i) => linhaDados(null, "", 640))];
  const doc = new Document({
    creator: "Arautos do Evangelho Campos",
    sections: [
      {
        properties: { page: pagina },
        children: [
          ...titulo(curso.nome, `Lista de presença — ${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"} — gerada em ${dataHoje()}`),
          ...(linhas.length ? [tabela(rowsLista)] : [new Paragraph({ children: [new TextRun({ text: "Nenhuma pessoa inscrita ainda.", italics: true, size: 22, font: "Calibri" })] })])
        ]
      },
      {
        properties: { page: pagina },
        children: [
          ...titulo(`${curso.nome} — novos inscritos`, "Folha para anotar, na hora, quem não se inscreveu pelo site. Marque a presença na caixa ao final de cada linha."),
          tabela(rowsBranco)
        ]
      }
    ]
  });
  baixar(await Packer.toBlob(doc), `${nomeBase(curso, "lista-presenca")}.docx`);
}

/* ---------- PDF ---------- */
function carregarScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-lib="${url}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = url;
    s.dataset.lib = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Não foi possível carregar o gerador de PDF. Verifique sua conexão."));
    document.head.appendChild(s);
  });
}
async function gerarPdf(curso, inscricoes) {
  if (!window.jspdf) {
    await carregarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    await carregarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js");
  }
  const { jsPDF } = window.jspdf;
  const { colunas, linhas } = tabelaDePresenca(curso, inscricoes);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const larguraUtil = pdf.internal.pageSize.getWidth() - 60;
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const pesos = [0.5, ...colunas.map((c) => c.peso), 1];
  const soma = pesos.reduce((a, b) => a + b, 0);
  const estiloColunas = {};
  pesos.forEach((p, i) => { estiloColunas[i] = { cellWidth: (larguraUtil * p) / soma }; });
  const ultima = pesos.length - 1;
  const cabecalho = [["Nº", ...colunas.map((c) => c.rotulo), "Presença"]];
  const TAM_CAIXA = 12;

  const titulo = (txt, sub) => {
    pdf.setFontSize(15); pdf.setTextColor(122, 12, 30); pdf.text(String(txt), 30, 36);
    pdf.setFontSize(9); pdf.setTextColor(90, 70, 54); pdf.text(sub, 30, 52);
  };
  // caixa quadrada, para marcar a caneta, no centro da última coluna
  const desenharCaixa = (dados) => {
    if (dados.section !== "body" || dados.column.index !== ultima) return;
    const { x, y, width, height } = dados.cell;
    pdf.setDrawColor(40, 24, 16);
    pdf.setLineWidth(0.9);
    pdf.rect(x + (width - TAM_CAIXA) / 2, y + (height - TAM_CAIXA) / 2, TAM_CAIXA, TAM_CAIXA);
  };
  const tabela = (corpo, altura, inicioY) => pdf.autoTable({
    startY: inicioY,
    head: cabecalho,
    body: corpo,
    columnStyles: { ...estiloColunas, 0: { ...estiloColunas[0], halign: "center" } },
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, minCellHeight: altura, valign: "middle", overflow: "linebreak", lineColor: [180, 160, 110], lineWidth: 0.4 },
    headStyles: { fillColor: [122, 12, 30], textColor: 255, minCellHeight: 20, halign: "left" },
    alternateRowStyles: { fillColor: [250, 243, 230] },
    margin: { left: 30, right: 30, bottom: 30 },
    didDrawCell: desenharCaixa
  });

  titulo(curso.nome, `Lista de presença — ${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"} — gerada em ${dataHoje()}`);
  if (linhas.length) {
    tabela(linhas.map((l, i) => [String(i + 1), ...colunas.map((c) => String(l[c.chave] ?? "")), ""]), 24, 64);
  } else {
    pdf.setFontSize(11); pdf.setTextColor(90, 70, 54); pdf.text("Nenhuma pessoa inscrita ainda.", 30, 84);
  }

  // última folha: tabela em branco para quem chegar sem inscrição (as linhas ocupam a folha toda)
  pdf.addPage();
  titulo(`${curso.nome} — novos inscritos`, "Folha para anotar, na hora, quem não se inscreveu pelo site. Marque a presença na caixa ao final de cada linha.");
  const ALTURA_BRANCO = 30, inicioBranco = 64;
  const qtd = Math.max(1, Math.floor((alturaPagina - inicioBranco - 30 - 20) / ALTURA_BRANCO) - 1);
  tabela(Array.from({ length: qtd }, () => ["", ...colunas.map(() => ""), ""]), ALTURA_BRANCO, inicioBranco);
  pdf.save(`${nomeBase(curso, "lista-presenca")}.pdf`);
}

export async function exportarInscritos(formato, curso, inscricoes) {
  if (formato === "excel") return gerarExcel(curso, tabelaDeInscritos(curso, inscricoes));
  if (formato === "word") return gerarWord(curso, inscricoes);
  if (formato === "pdf") return gerarPdf(curso, inscricoes);
  throw new Error("Formato desconhecido.");
}
