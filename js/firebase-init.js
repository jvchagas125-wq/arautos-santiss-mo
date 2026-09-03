// Inicialização do Firebase (SDK modular via CDN) — usado por todas as páginas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, onSnapshot, orderBy,
  runTransaction, serverTimestamp
};
