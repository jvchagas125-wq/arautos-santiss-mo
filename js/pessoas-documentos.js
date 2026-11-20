// Lista de todas as pessoas cadastradas no site (nome e telefone) em Excel e Word — baixada pelo painel
// administrativo (Contatos > Pessoas cadastradas). Não depende do navegador: as bibliotecas ExcelJS e docx
// entram por parâmetro (o painel usa as carregadas em admin.html).

const VINHO = "7A0C1E", DOURADO = "CDA434", MARROM = "5A4636", TEXTO = "281810", CREME = "FAF3E6";

const digitos = (t) => String(t || "").replace(/\D/g, "");
// (22) 99851-6195 — usa o telefone como foi cadastrado; se faltar, monta a partir dos números
export function telefoneParaExibir(p) {
  const bruto = String(p.telefone || "").trim();
  const d = digitos(bruto) || digitos(p.telefoneDigits);
  if (!bruto || !/\d/.test(bruto)) {
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return bruto || d;
}

// Linhas já ordenadas por nome (A–Z) e só com quem tem nome ou telefone.
export function linhasDePessoas(pessoas) {
  return (Array.isArray(pessoas) ? pessoas : [])
    .map((p) => ({ nome: String(p.nome || "").trim(), telefone: telefoneParaExibir(p) }))
    .filter((l) => l.nome || l.telefone)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

const textoTotal = (n) => `${n} ${n === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}`;

/* ---------- Excel ---------- */
export function construirExcelPessoas(pessoas, { ExcelJS, hoje }) {
  const linhas = linhasDePessoas(pessoas);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arautos do Evangelho Campos";
  const ws = wb.addWorksheet("Pessoas cadastradas", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 } }
  });
  ws.columns = [{ width: 7 }, { width: 46 }, { width: 20 }];

  ws.mergeCells("A1:C1");
  const titulo = ws.getCell("A1");
  titulo.value = "Arautos do Evangelho Campos";
  titulo.font = { name: "Cambria", bold: true, size: 18, color: { argb: "FF" + VINHO } };
  titulo.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;

  ws.mergeCells("A2:C2");
  const sub = ws.getCell("A2");
  sub.value = `Pessoas cadastradas — ${textoTotal(linhas.length)} — gerado em ${hoje}`;
  sub.font = { name: "Calibri", size: 11, color: { argb: "FF" + MARROM } };
  ws.getRow(2).height = 20;
  ["A2", "B2", "C2"].forEach((ref) => { ws.getCell(ref).border = { bottom: { style: "medium", color: { argb: "FF" + DOURADO } } }; });

  ws.getRow(3).height = 8;
  const cab = ws.getRow(4);
  cab.values = ["Nº", "Nome", "Telefone"];
  cab.height = 24;
  cab.eachCell((cel, col) => {
    cel.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + VINHO } };
    cel.alignment = { vertical: "middle", horizontal: col === 1 ? "center" : "left", indent: col === 1 ? 0 : 1 };
  });

  linhas.forEach((l, i) => {
    const row = ws.addRow([i + 1, l.nome, l.telefone]);
    row.height = 20;
    row.eachCell((cel, col) => {
      cel.font = { name: "Calibri", size: 11, color: { argb: "FF" + TEXTO } };
      cel.alignment = { vertical: "middle", horizontal: col === 1 ? "center" : "left", indent: col === 1 ? 0 : 1 };
      cel.border = { bottom: { style: "thin", color: { argb: "FFE6DCC8" } } };
      if (i % 2 === 1) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + CREME } };
    });
    row.getCell(3).numFmt = "@"; // telefone sempre como texto
  });

  if (linhas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 3 } };
  ws.headerFooter.oddFooter = "&L&8Arautos do Evangelho Campos&R&8Página &P de &N";
  ws.pageSetup.printTitlesRow = "4:4";
  return wb;
}

/* ---------- Word ---------- */
export function construirWordPessoas(pessoas, { docx, hoje }) {
  const linhas = linhasDePessoas(pessoas);
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, VerticalAlign, BorderStyle, Footer, PageNumber } = docx;
  const larguras = [800, 5400, 2800]; // A4 retrato com margens de 1000 (soma 9000)
  const total = larguras.reduce((a, b) => a + b, 0);
  const sem = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const fino = { style: BorderStyle.SINGLE, size: 4, color: "E6DCC8" };

  const celula = (txt, i, { cab = false, zebra = false } = {}) => new TableCell({
    width: { size: larguras[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: cab ? { type: ShadingType.CLEAR, fill: VINHO, color: "auto" } : zebra ? { type: ShadingType.CLEAR, fill: CREME, color: "auto" } : undefined,
    borders: { top: sem, left: sem, right: sem, bottom: cab ? sem : fino },
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: String(txt ?? ""), bold: cab, size: cab ? 21 : 21, color: cab ? "FFFFFF" : TEXTO, font: "Calibri" })]
    })]
  });
  const linhaCab = new TableRow({ tableHeader: true, cantSplit: true, children: ["Nº", "Nome", "Telefone"].map((r, i) => celula(r, i, { cab: true })) });
  const linhasTabela = linhas.map((l, n) => new TableRow({
    cantSplit: true,
    children: [celula(n + 1, 0, { zebra: n % 2 === 1 }), celula(l.nome, 1, { zebra: n % 2 === 1 }), celula(l.telefone, 2, { zebra: n % 2 === 1 })]
  }));

  const rodape = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Arautos do Evangelho Campos — página ", font: "Calibri", size: 16, color: "8C7864" }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: "8C7864" }),
        new TextRun({ text: " de ", font: "Calibri", size: 16, color: "8C7864" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Calibri", size: 16, color: "8C7864" })
      ]
    })]
  });

  return new Document({
    creator: "Arautos do Evangelho Campos",
    title: "Pessoas cadastradas",
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: { default: rodape },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Arautos do Evangelho Campos", bold: true, size: 36, color: VINHO, font: "Cambria" })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 280 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: DOURADO, space: 8 } },
          children: [new TextRun({ text: `Pessoas cadastradas — ${textoTotal(linhas.length)} — gerado em ${hoje}`, size: 21, color: MARROM, font: "Calibri" })]
        }),
        ...(linhas.length
          ? [new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: larguras, rows: [linhaCab, ...linhasTabela] })]
          : [new Paragraph({ children: [new TextRun({ text: "Nenhuma pessoa cadastrada ainda.", italics: true, size: 22, color: MARROM })] })])
      ]
    }]
  });
}
