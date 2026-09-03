/* =========================================================
   CONFIGURAÇÃO DO FIREBASE
   =========================================================
   Substitua os valores abaixo pelas credenciais do SEU projeto
   Firebase. Você encontra esses dados em:

   Console do Firebase → (ícone de engrenagem) Configurações do
   projeto → aba "Geral" → seção "Seus aplicativos" → app da Web
   (crie um app da Web se ainda não tiver um, clicando em "</>").

   Depois de colar os dados aqui, salve o arquivo. Não é preciso
   mais nada — o site já vai se conectar ao seu Firestore.
   ========================================================= */

export const firebaseConfig = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI_O_PROJECT_ID",
  storageBucket: "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI_O_APP_ID"
};

/* Senha inicial do painel administrativo (do Padre).
   Você pode trocar essa senha a qualquer momento dentro do
   próprio painel admin, em "Configurações". */
export const SENHA_ADMIN_PADRAO = "arautos2026";
