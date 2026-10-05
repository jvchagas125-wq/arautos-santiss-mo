# Envio automático das listas de intenção por e-mail — como ativar

Quando uma lista de intenções fecha, o site gera o documento Word dela e manda por e-mail para os endereços
cadastrados em **Painel administrativo → Intenções da Missa → Envio automático por e-mail**.

Funciona assim: o **GitHub** "cutuca" o site a cada ~10 minutos → o site (função `api/enviar-listas.js`
na Vercel) vê quais listas já fecharam → gera o documento Word → envia pelo e-mail remetente.
Cada lista é enviada uma única vez.

Você precisa fazer **uma vez** os passos abaixo (são só configurações, nenhuma senha vai no código).

## 1. Escolher o e-mail que vai ENVIAR (remetente)

Pode ser um Gmail da comunidade (recomendado criar um só pra isso, ex.: `arautos.adoracao@gmail.com`).

1. Entre na conta Google desse e-mail → **Gerenciar sua Conta Google → Segurança**.
2. Ligue a **Verificação em duas etapas** (se ainda não estiver ligada).
3. Procure por **"Senhas de app"** (na busca da página de Segurança) → crie uma com o nome `Site Adoração`.
4. O Google mostra uma senha de 16 letras. **Copie** (ela só aparece uma vez). Não é a senha normal do e-mail.

> Outros provedores (Outlook, Brevo etc.) também servem — é só preencher também `SMTP_HOST` e `SMTP_PORT` na Vercel.

## 2. Vercel — variáveis de ambiente

Vercel → seu projeto → **Settings → Environment Variables** → adicione (marque Production, Preview e Development):

| Nome | Valor |
|---|---|
| `SMTP_USER` | o e-mail remetente (ex.: `arautos.adoracao@gmail.com`) |
| `SMTP_PASS` | a senha de app de 16 letras do passo 1 |
| `CRON_SECRET` | invente uma senha longa (30+ letras e números misturados). Anote: vai usar de novo no passo 3 |

Depois, **Deployments → ⋯ no último deploy → Redeploy** (as variáveis só valem num deploy novo).

## 3. GitHub — o agendador

**3a. Colocar o arquivo do agendador no lugar certo.** Na pasta do projeto existe `agendador\enviar-listas.yml`.
Crie (se não existirem) as pastas `.github` e dentro dela `workflows`, e **mova** o arquivo para
`.github\workflows\enviar-listas.yml`. (A pasta `agendador` pode ser apagada depois.) O nome `.github`
começa com ponto — no Windows, crie pelo Explorador digitando `.github.` (com ponto no fim) que ele ajusta.

**3b. Criar a senha no GitHub.**

Repositório → **Settings → Secrets and variables → Actions → New repository secret**:

- Nome: `CRON_SECRET` — Valor: **exatamente a mesma** senha do passo 2.

(Opcional) na aba **Variables**: `SITE_URL` com o endereço do site, se não for `https://arautos-adoracao.vercel.app`.

Depois vá na aba **Actions** do repositório. Se aparecer um botão pedindo para habilitar os workflows, habilite.
Clique em **Enviar listas de intenção → Run workflow** para testar: deve terminar com ✓ verde.

> Se o repositório for **privado**, o GitHub só dá 2.000 minutos grátis por mês. Abra
> `.github/workflows/enviar-listas.yml` e troque o `cron` pelo valor indicado no comentário do arquivo (a cada 30 min).

## 4. Painel administrativo

1. **Intenções da Missa → Envio automático por e-mail**.
2. Digite os e-mails que vão **receber** os documentos (pode adicionar vários).
3. Marque **Enviar automaticamente quando a lista fechar** e clique em **Salvar**.
4. Clique em **Enviar e-mail de teste** — chega um documento Word de exemplo nesses endereços (olhe também o spam).

Em cada lista preenchida há um botão de **envelope** que envia aquela lista na hora.

## Se algo der errado

- **Teste diz "falta SMTP_USER e SMTP_PASS"** → passo 2 não foi feito, ou faltou o Redeploy.
- **Falha de login (535)** → a senha de app foi copiada errada; gere outra.
- **GitHub Actions fica vermelho** → clique na execução e leia a mensagem; geralmente é `CRON_SECRET` diferente nos dois lugares.
- **Não chegou e-mail** → olhe a caixa de spam; no painel, em "Últimos envios", aparece se foi enviado ou se falhou.
- O GitHub **desliga agendamentos** de repositórios públicos sem nenhuma atividade por 60 dias — se isso acontecer, é só reativar na aba Actions.

---

## Contas do painel administrativo (novo)

- A senha antiga única (`arautos2026`) deixou de existir. Cada pessoa cria o próprio usuário e a própria senha na tela de entrada do painel ("Ainda não tenho acesso — criar cadastro").
- **A primeira conta criada depois de publicar a atualização vira o administrador principal** (acesso a tudo). Por isso, assim que o site for atualizado, abra o painel e crie a sua conta antes de qualquer outra pessoa.
- Os próximos cadastros ficam "aguardando aprovação" na página **Administradores**. Lá você aprova ou recusa e, no botão **Acessos**, escolhe quais páginas (ou só algumas partes delas) cada pessoa verá.
- O login é só pela senha, então **duas pessoas não podem ter a mesma senha** (o site avisa na hora de criar ou trocar).
- As senhas nunca são guardadas: o banco guarda apenas uma "impressão digital" irreversível de cada uma.
- O envio de e-mail pelo painel (botão "Enviar e-mail de teste" e o envelope de cada lista) também confere a conta e as permissões no servidor.
- **Se esquecer a sua senha de principal:** no Firebase (Firestore Database) apague a coleção `administradores`; no próximo acesso a tela volta a pedir o "Primeiro acesso". (Pode também apagar o documento antigo `configuracoes → admin`, que não é mais usado — o painel já tenta apagá-lo sozinho no primeiro cadastro.)
