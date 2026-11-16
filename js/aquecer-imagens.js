// Deixa as imagens do Simpósio e dos cursos já baixadas antes de a pessoa abrir essas páginas.
// Roda em segundo plano, em qualquer página do site público, sem atrapalhar o que está na tela:
// (1) baixa as imagens das listas que já estão guardadas no aparelho e (2) de tempos em tempos
// confere no banco se há imagens novas e baixa também. Os endereços são exatamente os que as páginas
// usam (mesma largura), então o navegador reaproveita o arquivo e a imagem aparece na hora.
import { listasPublicasEmCache, atualizarListasPublicasEmCache } from "./dados.js";
import { otimizarImagemUrl } from "./utils.js";

const CHAVE_ULTIMA_CONFERENCIA = "arautos_aquecer_em";
const INTERVALO_MS = 5 * 60 * 1000;
const jaPedidas = new Set();
const emAndamento = []; // mantém as imagens referenciadas até terminarem de baixar

function baixar(url) {
  if (!url || jaPedidas.has(url) || String(url).startsWith("data:")) return;
  jaPedidas.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  emAndamento.push(img);
}

function baixarDasListas({ simposio, cursos }) {
  simposio.forEach((i) => { if (i && i.imagemUrl) baixar(otimizarImagemUrl(i.imagemUrl, 1200)); });
  cursos.forEach((c) => {
    if (!c || !c.imagemUrl || c.ativo === false) return;
    baixar(otimizarImagemUrl(c.imagemUrl, 120));  // miniatura da lista
    baixar(otimizarImagemUrl(c.imagemUrl, 900));  // imagem do curso aberto
  });
}

export async function aquecerImagens() {
  try {
    if (navigator.connection && navigator.connection.saveData) return; // modo "economizar dados"
    const guardado = listasPublicasEmCache();
    baixarDasListas(guardado);
    let ultima = 0;
    try { ultima = Number(localStorage.getItem(CHAVE_ULTIMA_CONFERENCIA)) || 0; } catch { /* sem localStorage */ }
    const temAlgo = guardado.simposio.length > 0 || guardado.cursos.length > 0;
    if (temAlgo && Date.now() - ultima < INTERVALO_MS) return;
    const novas = await atualizarListasPublicasEmCache();
    try { localStorage.setItem(CHAVE_ULTIMA_CONFERENCIA, String(Date.now())); } catch { /* ok */ }
    baixarDasListas(novas);
  } catch {
    // só uma otimização: se falhar (sem internet, por exemplo), o site segue normal
  }
}
