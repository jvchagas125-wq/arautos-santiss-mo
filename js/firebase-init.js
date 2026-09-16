// Inicialização do Firebase (SDK modular via CDN) — usado por todas as páginas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// IMPORTANTE: já testamos usar cache local persistente (IndexedDB) aqui pra deixar as telas mais
// rápidas, mas em alguns celulares/recarregamentos de página isso travava a conexão com o
// Firestore (o app ficava esperando pra sempre, sem erro nenhum, sem carregar nada). Como os
// dados PRECISAM estar sempre em tempo real, voltamos para o modo padrão do Firestore — mais
// simples e confiável. A velocidade agora vem só do cache dos arquivos do site (js/sw.js).
export const db = getFirestore(app);

export {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
};
