// Painel administrativo: página inicial — blocos que levam a cada página do painel.
// (O gráfico de pessoas cadastradas foi removido: lia a coleção de cadastros inteira e gastava a cota gratuita do banco.)

/* ---------------- Blocos das páginas do painel ---------------- */

const DESCRICOES = {
  frase: "Frases que aparecem no início do site",
  horarios: "Dias e horários da Adoração",
  intencoes: "Listas das missas e envio por e-mail",
  avisos: "Agenda da semana e comunicados",
  acompanhamento: "Agendamentos e cancelamentos",
  inscricoes: "Cursos, inscritos e avisos",
  contatos: "Pessoas cadastradas no site",
  visitas: "De onde vêm as visitas do site, em números e gráficos",
  administradores: "Contas e acessos do painel",
  configuracoes: "Páginas, logo, fundo e banners"
};

function iniciarBlocos() {
  const grade = document.getElementById("blocosInicio");
  const links = [...document.querySelectorAll("#menuLateral nav a[data-secao]")].filter((a) => a.dataset.secao !== "inicio");
  links.forEach((a) => {
    const secao = a.dataset.secao;
    const emoji = a.querySelector(".emoji")?.textContent || "";
    const titulo = [...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    const bloco = document.createElement("button");
    bloco.type = "button";
    bloco.className = "bloco-inicio";
    bloco.dataset.secao = secao;
    bloco.innerHTML = `<span class="bloco-inicio__emoji"></span><span class="bloco-inicio__titulo"></span><span class="bloco-inicio__desc"></span><span class="bloco-inicio__selo oculto"></span>`;
    bloco.querySelector(".bloco-inicio__emoji").textContent = emoji;
    bloco.querySelector(".bloco-inicio__titulo").textContent = titulo;
    bloco.querySelector(".bloco-inicio__desc").textContent = DESCRICOES[secao] || "";
    bloco.addEventListener("click", () => a.click()); // faz o mesmo que o menu: abre a página
    grade.appendChild(bloco);
    // espelha o selo de pendências do menu (ex.: Administradores aguardando aprovação)
    const selo = a.querySelector(".menu-selo");
    if (selo) {
      const meu = bloco.querySelector(".bloco-inicio__selo");
      const copiar = () => { meu.textContent = selo.textContent; meu.classList.toggle("oculto", selo.classList.contains("oculto")); };
      new MutationObserver(copiar).observe(selo, { attributes: true, childList: true, characterData: true, subtree: true });
      copiar();
    }
  });
}

export function iniciarInicioAdmin() {
  // botão fixo no canto inferior: de qualquer página volta para a Página inicial
  const voltar = document.getElementById("btnVoltarInicio");
  if (voltar) {
    voltar.addEventListener("click", () => {
      document.querySelector('#menuLateral nav a[data-secao="inicio"]')?.click();
    });
    // só aparece fora da Página inicial (e fora da tela "sem acesso")
    const atualizarVoltar = () => {
      const aberta = document.querySelector(".admin-secao:not(.oculto)");
      voltar.hidden = !aberta || aberta.id === "secao-inicio" || aberta.id === "secao-sem-acesso";
    };
    const obs = new MutationObserver(atualizarVoltar);
    document.querySelectorAll(".admin-secao").forEach((sec) => obs.observe(sec, { attributes: true, attributeFilter: ["class"] }));
    atualizarVoltar();
  }
  iniciarBlocos();
}
