# Adoração ao Santíssimo Sacramento — Arautos do Evangelho

Site de agendamento para a exposição do Santíssimo Sacramento, com cadastro rápido
(nome + telefone), agendamento por dia/horário, área "Meus agendamentos" e um
painel administrativo para o Padre gerenciar tudo.

Site 100% estático (HTML/CSS/JS puro) + banco de dados no **Firebase Firestore**.
Não precisa de Node.js, build nem servidor próprio — funciona direto no Vercel.

---

## 1. Estrutura de arquivos

```
arautos-adoracao/
├── index.html                 → Página inicial (frase do dia + botão agendar)
├── agendamento.html           → Escolher data e horário
├── meus-agendamentos.html     → Agendamentos do usuário (com cancelar)
├── admin.html                 → Painel do Padre (protegido por senha)
├── css/
│   ├── style.css               → Tema visual (vermelho, dourado, branco)
│   └── admin.css                → Estilos exclusivos do painel admin
├── js/
│   ├── firebase-config.js      → SUAS credenciais do Firebase (editar aqui)
│   ├── firebase-init.js        → Inicialização do Firebase
│   ├── dados.js                 → Todas as leituras/gravações no Firestore
│   ├── utils.js                  → Máscaras, formatação de data/telefone, menu, etc.
│   ├── auth.js                    → Modal de cadastro (nome + telefone)
│   ├── main.js, agendamento.js, meus-agendamentos.js, admin.js → lógica de cada página
├── assets/
│   ├── logo.png                → Logo enviada por você
│   └── fundo-altar.jpg          → Foto do Santíssimo enviada por você (fundo do site)
└── README.md
```

---

## 2. Configurar o Firebase (obrigatório)

Você disse que já criou o banco de dados no Firebase — falta só conectar o site a ele.

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e abra o seu projeto.
2. No menu lateral, confirme que o **Firestore Database** está criado (se não estiver,
   clique em "Firestore Database" → "Criar banco de dados" → modo produção → escolha a região `southamerica-east1` (São Paulo), se disponível).
3. Clique no ícone de engrenagem ⚙️ → **Configurações do projeto**.
4. Na aba **Geral**, role até "Seus aplicativos". Se não houver nenhum app da Web, clique
   no ícone `</>` para criar um (nome sugerido: "Site Adoração").
5. Copie o objeto `firebaseConfig` que aparece — algo assim:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "seu-projeto.firebaseapp.com",
     projectId: "seu-projeto",
     storageBucket: "seu-projeto.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```

6. Abra o arquivo **`js/firebase-config.js`** neste projeto e cole seus valores no lugar
   dos textos `COLE_AQUI...`. Salve o arquivo.

### Regras de segurança do Firestore

No console do Firebase, vá em **Firestore Database → Regras** e cole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{id} {
      allow read, write: if true;
    }
    match /agendamentos/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }
    match /slots/{id} {
      allow read, write: if true;
    }
    match /configuracoes/{id} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Como o site não usa login "de verdade" (Firebase Authentication), essas regras
> ficam abertas para que o cadastro e o agendamento funcionem para qualquer visitante.
> Isso é normal para um site interno de paróquia, mas **não coloque nada sigiloso**
> no banco. Se um dia quiser reforçar a segurança, dá para evoluir para Firebase
> Authentication + regras mais restritas.

---

## 3. Testar no seu computador antes de publicar

Como o site usa módulos JavaScript (`type="module"`), ele **não abre direto clicando
duas vezes no `index.html`** — o navegador bloqueia por segurança. Use um servidor local:

**Com Python (já vem no Windows/Mac normalmente):**
```
cd C:\Users\jvcha\OneDrive\Arautos_Adoracao
python -m http.server 8000
```
Depois abra `http://localhost:8000` no navegador.

**Ou com a extensão "Live Server" do VS Code**, se preferir.

---

## 4. Subir para o GitHub (repositório que você já criou)

Você mencionou o repositório `https://github.com/jvchagas125-wq/arautos-santiss-mo`
e que os arquivos ficarão em `C:\Users\jvcha\OneDrive\Arautos_Adoracao`.

No seu computador, dentro dessa pasta (com todos os arquivos deste projeto já copiados
para lá), abra o terminal (PowerShell ou Prompt de Comando) e rode:

```
cd C:\Users\jvcha\OneDrive\Arautos_Adoracao
git init
git add .
git commit -m "Site de agendamento da Adoração ao Santíssimo"
git branch -M main
git remote add origin https://github.com/jvchagas125-wq/arautos-santiss-mo.git
git push -u origin main
```

Se o repositório já tiver algum arquivo (ex: um README criado pelo GitHub), troque o
`git push` por:
```
git pull origin main --allow-unrelated-histories
git push -u origin main
```

---

## 5. Publicar no Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login (pode usar sua conta do GitHub).
2. Clique em **Add New → Project**.
3. Selecione o repositório `arautos-santiss-mo`.
4. Em "Framework Preset", escolha **Other** (site estático, sem build).
5. Não é necessário configurar "Build Command" nem "Output Directory" — deixe em branco
   ou o padrão. Clique em **Deploy**.
6. Pronto! O Vercel te dá um link (algo como `arautos-santiss-mo.vercel.app`) que já
   pode ser compartilhado com a paróquia.

Sempre que você der `git push` de novo, o Vercel republica o site automaticamente.

---

## 6. Como usar o Painel do Padre (admin)

Acesse `seusite.vercel.app/admin.html`.

- **Senha inicial:** `arautos2026` (definida em `js/firebase-config.js`, na constante
  `SENHA_ADMIN_PADRAO`). Você pode trocar essa senha a qualquer momento dentro do
  próprio painel, em **Configurações → Senha do painel administrativo**.
- **Frase do dia** — edite a frase e o autor exibidos na página inicial.
- **Dias e horários** — escolha o período (data inicial e final) em que a adoração vai
  acontecer, e marque quais horários (00h às 23h, de hora em hora) ficam disponíveis
  para agendamento em cada dia do período.
- **Acompanhamento** — duas abas: "Agendados" (quem está confirmado) e "Cancelados"
  (com o motivo informado pela pessoa, clicando em "Ver motivo").
- **Configurações** — trocar a logo e a foto de fundo do site (enviando um arquivo ou
  colando um link de imagem já hospedada), e trocar a senha do painel.

> Dica: se enviar uma foto de fundo muito grande (vários MB), prefira colar um link de
> imagem já hospedada (por exemplo, no Firebase Storage ou Imgur) em vez de fazer
> upload direto, pois o Firestore tem um limite de 1 MB por registro.

---

## 7. Observações importantes

- **Cadastro (nome + telefone)** não é uma senha/login tradicional — é apenas uma
  identificação salva no navegador da pessoa (localStorage) e no Firestore. Ao trocar
  de celular/navegador ou limpar os dados do site, será pedido um novo cadastro.
- Cada horário só pode ser agendado por **uma pessoa por vez** (evita duplicidade).
  Se quiser permitir mais de uma pessoa no mesmo horário, isso pode ser ajustado.
- As imagens de fundo (`assets/fundo-altar.jpg`) e a logo (`assets/logo.png`) que você
  enviou já estão aplicadas por padrão; o painel admin permite trocá-las depois sem
  precisar editar código.
