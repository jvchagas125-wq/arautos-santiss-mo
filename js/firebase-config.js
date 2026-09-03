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
  apiKey: "AIzaSyD9iWPLJcLQhteOfzcB2Metp1CfoETF2QY",
  authDomain: "arautos-santissimo.firebaseapp.com",
  projectId: "arautos-santissimo",
  storageBucket: "arautos-santissimo.firebasestorage.app",
  messagingSenderId: "879082779467",
  appId: "1:879082779467:web:f42656ebdffe3733ce2ece"
};

/* Senha inicial do painel administrativo (do Padre).
   Você pode trocar essa senha a qualquer momento dentro do
   próprio painel admin, em "Configurações". */
export const SENHA_ADMIN_PADRAO = "arautos2026";
