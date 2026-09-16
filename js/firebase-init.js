// Inicialização do Firebase (SDK modular via CDN) — usado por todas as páginas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// Cache local persistente (IndexedDB): guarda os dados já vistos no aparelho, então ao reabrir
// o site/app as telas já aparecem preenchidas na hora (com o último dado conhecido) enquanto o
// Firestore sincroniza em segundo plano — sem precisar mostrar uma tela de "carregando".
// Se o navegador não suportar (ex: modo privado, várias abas em versões antigas), cai para o
// modo padrão sem cache local, sem quebrar o site.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (err) {
  console.warn("Cache local do Firestore indisponível, usando modo padrão:", err);
  db = getFirestore(app);
}
export { db };

export {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
};
