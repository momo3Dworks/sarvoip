import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// IMPORTANTE: Reemplaza esto con tu propia configuración de Firebase
// desde la configuración de tu proyecto en la consola de Firebase.
const firebaseConfig = {
  apiKey: "dasdasd",
  authDomain: "sarvoip-9a4a5.firebaseapp.com",
  projectId: "sarvoip-9a4a5",
  storageBucket: "sarvoip-9a4a5.firebasestorage.app",
  messagingSenderId: "212334592557",
  appId: "1:212334592557:web:fefa700a1f08f113ef2ea4",
  measurementId: "G-J3MK94TLNL"
};
// Inicializar Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
