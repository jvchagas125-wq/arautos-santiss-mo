# Agendamento — Adoração ao Santíssimo

Site de agendamento de horários de Adoração Eucarística, com painel para a secretaria/padre definir dias, horários e vagas. Front-end estático (`index.html`) + funções serverless (`/api`) publicadas no Vercel, com os agendamentos guardados no Firebase (Firestore).

## O que você precisa fazer antes do primeiro deploy

### 1. Criar o projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto novo (pode ser gratuito, plano Spark).
2. Dentro do projeto, ative o **Firestore Database** (modo produção).
3. Em **Configurações do projeto → Contas de serviço**, clique em **Gerar nova chave privada**. Isso baixa um arquivo `.json` — guarde-o com cuidado, ele dá acesso total ao seu banco.
4. Nas **Regras** do Firestore, deixe tudo bloqueado para acesso direto do navegador (só o servidor do Vercel acessa o banco, usando essa chave):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

### 2. Subir este código para o repositório

Dentro da pasta deste projeto:

```bash
git init
git add .
git commit -m "Site de agendamento da Adoração ao Santíssimo"
git remote add origin https://github.com/jvchagas125-wq/arautos-santiss-mo.git
git push -u origin main
```

(Se o repositório já tiver algum arquivo, ajuste com `git pull --rebase origin main` antes do push, ou apague o conteúdo antigo do repositório antes de subir este.)

### 3. Importar o repositório no Vercel

1. Em [vercel.com](https://vercel.com), clique em **Add New → Project** e selecione o repositório `arautos-santiss-mo`.
2. Antes de clicar em Deploy, abra **Environment Variables** e adicione três variáveis, usando os dados do arquivo `.json` baixado no passo 1:

   | Nome | Valor |
   |---|---|
   | `FIREBASE_PROJECT_ID` | campo `project_id` do JSON |
   | `FIREBASE_CLIENT_EMAIL` | campo `client_email` do JSON |
   | `FIREBASE_PRIVATE_KEY` | campo `private_key` do JSON (cole exatamente como está, com as quebras de linha `\n`) |

3. Clique em **Deploy**.

Depois de qualquer alteração nessas variáveis, é preciso fazer um novo deploy (Vercel → aba Deployments → Redeploy) para elas passarem a valer.

## Uso do site

- **Página pública**: mostra os dias e horários configurados. A pessoa escolhe um horário livre, preenche nome e telefone e confirma.
- **Painel da secretaria**: botão ⚙ no canto inferior direito. Senha inicial: `adoracao2026` — troque assim que entrar, na própria tela do painel.
  - Define nome da igreja, subtítulo, telefone de contato, data inicial/final do período de agendamento, quais horários (00h–23h) ficam abertos e quantas vagas por horário.
  - Mostra a lista de agendamentos (nome e telefone) por dia, com opção de remover algum e exportar tudo em CSV.

Nomes e telefones só ficam visíveis para quem faz login no painel — a página pública só mostra se um horário está livre, reservado ou encerrado.

## Estrutura do projeto

```
index.html              → front-end (uma página só)
api/state.js            → GET: configuração pública + contagem de vagas por horário
api/book.js             → POST: confirma um agendamento
api/admin/login.js      → POST: valida a senha e devolve um token de sessão (4h)
api/admin/config.js     → POST: salva nome, datas, horários e vagas
api/admin/password.js   → POST: troca a senha do painel
api/admin/bookings.js   → POST: lista completa de agendamentos (nome/telefone) — exige token
api/admin/remove-booking.js → POST: remove um agendamento — exige token
lib/firebase.js         → conexão com o Firestore e regras de negócio
```

## Rodando localmente (opcional)

```bash
npm install
npx vercel dev
```

Isso sobe o site em `http://localhost:3000` já lendo as variáveis de ambiente de um arquivo `.env.local` (crie um com as mesmas três variáveis do passo 3).
