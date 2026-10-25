// Exporta a lista de inscritos de um curso em Excel, Word ou PDF (feito no navegador do administrador).
// Excel usa a biblioteca ExcelJS e Word usa a "docx" (as duas já carregadas em admin.html); o PDF usa jsPDF,
// carregado só na hora de exportar (para não pesar o painel).
import { tabelaDeInscritos } from "./cursos-comum.js";

const VINHO = "7A0C1E", DOURADO = "CDA434";

function nomeBase(curso) {
  const slug = String(curso.nome || "curso").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "curso";
  return `inscritos-${slug}`;
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

/* ---------- Word ---------- */
async function gerarWord(curso, { colunas, linhas }) {
  if (typeof window.docx === "undefined") throw new Error("Não foi possível carregar o gerador de Word. Verifique sua conexão.");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, PageOrientation } = window.docx;
  const larguraTotal = 15000; // A4 paisagem com margens estreitas (em twips)
  const larg = Math.floor(larguraTotal / Math.max(colunas.length, 1));
  const celula = (txt, cab = false) => new TableCell({
    width: { size: larg, type: WidthType.DXA },
    shading: cab ? { type: ShadingType.CLEAR, fill: VINHO, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: String(txt ?? ""), bold: cab, size: 17, color: cab ? "FFFFFF" : "281810", font: "Calibri" })] })]
  });
  const tabela = new Table({
    width: { size: larg * colunas.length, type: WidthType.DXA },
    columnWidths: colunas.map(() => larg),
    rows: [
      new TableRow({ tableHeader: true, children: colunas.map((c) => celula(c.rotulo, true)) }),
      ...linhas.map((l) => new TableRow({ children: colunas.map((c) => celula(l[c.chave])) }))
    ]
  });
  const doc = new Document({
    creator: "Arautos do Evangelho Campos",
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 80 }, children: [new TextRun({ text: curso.nome, bold: true, size: 32, color: VINHO, font: "Cambria" })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"} — gerado em ${dataHoje()}`, size: 20, color: "5A4636", font: "Calibri" })] }),
        tabela
      ]
    }]
  });
  baixar(await Packer.toBlob(doc), `${nomeBase(curso)}.docx`);
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
async function gerarPdf(curso, { colunas, linhas }) {
  if (!window.jspdf) {
    await carregarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    await carregarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js");
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFontSize(15);
  pdf.setTextColor(122, 12, 30);
  pdf.text(String(curso.nome), 30, 36);
  pdf.setFontSize(9);
  pdf.setTextColor(90, 70, 54);
  pdf.text(`${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"} — gerado em ${dataHoje()}`, 30, 52);
  pdf.autoTable({
    startY: 64,
    head: [colunas.map((c) => c.rotulo)],
    body: linhas.map((l) => colunas.map((c) => String(l[c.chave] ?? ""))),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [122, 12, 30], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 243, 230] },
    margin: { left: 30, right: 30 }
  });
  pdf.save(`${nomeBase(curso)}.pdf`);
}

export async function exportarInscritos(formato, curso, inscricoes) {
  const tabela = tabelaDeInscritos(curso, inscricoes);
  if (formato === "excel") return gerarExcel(curso, tabela);
  if (formato === "word") return gerarWord(curso, tabela);
  if (formato === "pdf") return gerarPdf(curso, tabela);
  throw new Error("Formato desconhecido.");
}
