# Envio automático das listas de intenção por e-mail — como ativar

Quando uma lista de intenções fecha, o site gera o PDF dela e manda por e-mail para os endereços
cadastrados em **Painel administrativo → Intenções da Missa → Envio automático por e-mail**.

Funciona assim: o **GitHub** "cutuca" o site a cada ~10 minutos → o site (função `api/enviar-listas.js`
na Vercel) vê quais listas já fecharam → gera o PDF → envia pelo e-mail remetente.
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
2. Digite os e-mails que vão **receber** os PDFs (pode adicionar vários).
3. Marque **Enviar automaticamente quando a lista fechar** e clique em **Salvar**.
4. Clique em **Enviar e-mail de teste** — chega um PDF de exemplo nesses endereços (olhe também o spam).

Em cada lista preenchida há um botão de **envelope** que envia aquela lista na hora.

## Se algo der errado

- **Teste diz "falta SMTP_USER e SMTP_PASS"** → passo 2 não foi feito, ou faltou o Redeploy.
- **Falha de login (535)** → a senha de app foi copiada errada; gere outra.
- **GitHub Actions fica vermelho** → clique na execução e leia a mensagem; geralmente é `CRON_SECRET` diferente nos dois lugares.
- **Não chegou e-mail** → olhe a caixa de spam; no painel, em "Últimos envios", aparece se foi enviado ou se falhou.
- O GitHub **desliga agendamentos** de repositórios públicos sem nenhuma atividade por 60 dias — se isso acontecer, é só reativar na aba Actions.
