// Exporta a lista de inscritos de um curso em Excel, Word ou PDF (feito no navegador do administrador).
// Os arquivos são montados por js/inscritos-documentos.js (o mesmo código que o servidor usa no envio
// automático por e-mail). Excel usa a biblioteca ExcelJS e Word usa a "docx" (as duas já carregadas em
// admin.html); o PDF usa jsPDF, carregado só na hora de exportar (para não pesar o painel).
import { tabelaDeInscritos } from "./cursos-comum.js";
import { construirExcel, construirWord, construirPdf } from "./inscritos-documentos.js";

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

async function gerarExcel(curso, inscricoes) {
  if (typeof window.ExcelJS === "undefined") throw new Error("Não foi possível carregar o gerador de Excel. Verifique sua conexão.");
  const wb = construirExcel(curso, tabelaDeInscritos(curso, inscricoes), { ExcelJS: window.ExcelJS, hoje: dataHoje() });
  const buffer = await wb.xlsx.writeBuffer();
  baixar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nomeBase(curso)}.xlsx`);
}

async function gerarWord(curso, inscricoes) {
  if (typeof window.docx === "undefined") throw new Error("Não foi possível carregar o gerador de Word. Verifique sua conexão.");
  const doc = construirWord(curso, inscricoes, { docx: window.docx, hoje: dataHoje() });
  baixar(await window.docx.Packer.toBlob(doc), `${nomeBase(curso, "lista-presenca")}.docx`);
}

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
  const pdf = construirPdf(curso, inscricoes, { jsPDF: window.jspdf.jsPDF, autoTable: (doc, opcoes) => doc.autoTable(opcoes), hoje: dataHoje() });
  pdf.save(`${nomeBase(curso, "lista-presenca")}.pdf`);
}

export async function exportarInscritos(formato, curso, inscricoes) {
  if (formato === "excel") return gerarExcel(curso, inscricoes);
  if (formato === "word") return gerarWord(curso, inscricoes);
  if (formato === "pdf") return gerarPdf(curso, inscricoes);
  throw new Error("Formato desconhecido.");
}
