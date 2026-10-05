// Catálogo de páginas/partes do painel administrativo e a regra de quem pode acessar o quê.
// Compartilhado entre o painel (esconde o que a pessoa não pode ver — ver js/admin.js) e o
// servidor (confere se a pessoa pode usar a função de e-mail — ver api/enviar-listas.js).
// Não depende de nada do navegador: só dados e funções puras.
//
// Formato de "acessos" guardado em cada conta (Firestore, coleção "administradores"):
//   { intencoes: ["*"], avisos: ["publicar"], acompanhamento: ["agendados", "cancelados"] }
// "*" = a página toda; uma lista de ids = só essas partes; página ausente = sem acesso.

export const PAGINA_ADMINISTRADORES = "administradores";

export const CATALOGO_ACESSOS = [
  { pagina: "frase", titulo: "Frase do dia", emoji: "💬", partes: [] },
  { pagina: "horarios", titulo: "Dias e horários", emoji: "🗓️", partes: [] },
  {
    pagina: "intencoes", titulo: "Intenções", emoji: "🙏",
    partes: [
      { id: "horarios", titulo: "Horários das missas" },
      { id: "listas", titulo: "Listas preenchidas (baixar Word e enviar por e-mail)" },
      { id: "email", titulo: "Envio automático por e-mail" }
    ]
  },
  {
    pagina: "avisos", titulo: "Avisos", emoji: "📢",
    partes: [
      { id: "publicar", titulo: "Publicar novo aviso" },
      { id: "publicados", titulo: "Avisos publicados" }
    ]
  },
  {
    pagina: "acompanhamento", titulo: "Acompanhamento", emoji: "📋",
    partes: [
      { id: "agendados", titulo: "Agendados" },
      { id: "cancelados", titulo: "Cancelados" }
    ]
  },
  {
    pagina: "contatos", titulo: "Contatos", emoji: "📇",
    partes: [
      { id: "info", titulo: "Informações de contato do site público" },
      { id: "cadastrar", titulo: "Cadastrar pessoa" },
      { id: "pessoas", titulo: "Pessoas cadastradas" }
    ]
  },
  { pagina: PAGINA_ADMINISTRADORES, titulo: "Administradores", emoji: "👥", partes: [], soPrincipalConcede: true },
  {
    pagina: "configuracoes", titulo: "Configurações", emoji: "⚙️",
    partes: [
      { id: "logo", titulo: "Logo padrão" },
      { id: "fundo", titulo: "Foto de fundo do site" },
      { id: "banners", titulo: "Banners da página inicial" }
    ]
  }
];

export function paginaDoCatalogo(pagina) {
  return CATALOGO_ACESSOS.find((p) => p.pagina === pagina) || null;
}

// A conta pode acessar a página (e, se "parte" vier, essa parte dela)?
// A conta principal acessa tudo; as demais só enquanto estiverem aprovadas.
export function temAcesso(conta, pagina, parte = null) {
  if (!conta) return false;
  if (conta.principal === true) return true;
  if (conta.status !== "aprovado") return false;
  const lista = conta.acessos && conta.acessos[pagina];
  if (!Array.isArray(lista) || lista.length === 0) return false;
  if (lista.includes("*")) return true;
  if (parte === null) return true; // alguma parte da página já basta pra página aparecer no menu
  return lista.includes(parte);
}

// Limpa um objeto de acessos qualquer deixando só páginas/partes que existem no catálogo.
// Se todas as partes de uma página estiverem marcadas, vira "*" (página toda).
export function normalizarAcessos(acessos) {
  const limpo = {};
  CATALOGO_ACESSOS.forEach((pg) => {
    const lista = acessos && Array.isArray(acessos[pg.pagina]) ? acessos[pg.pagina] : null;
    if (!lista || lista.length === 0) return;
    if (lista.includes("*") || pg.partes.length === 0) { limpo[pg.pagina] = ["*"]; return; }
    const validas = pg.partes.map((p) => p.id).filter((id) => lista.includes(id));
    if (validas.length === 0) return;
    limpo[pg.pagina] = validas.length === pg.partes.length ? ["*"] : validas;
  });
  return limpo;
}

// Texto curto descrevendo os acessos de uma conta (mostrado na lista de administradores).
export function resumoDeAcessos(conta) {
  if (conta.principal) return "Acesso total (administrador principal)";
  const acessos = conta.acessos || {};
  const partes = CATALOGO_ACESSOS.filter((pg) => Array.isArray(acessos[pg.pagina]) && acessos[pg.pagina].length > 0).map((pg) => {
    const lista = acessos[pg.pagina];
    if (lista.includes("*")) return pg.titulo;
    const nomes = lista.map((id) => pg.partes.find((p) => p.id === id)?.titulo).filter(Boolean);
    return `${pg.titulo} (${nomes.join(", ")})`;
  });
  return partes.length ? partes.join(" · ") : "Nenhum acesso definido";
}
