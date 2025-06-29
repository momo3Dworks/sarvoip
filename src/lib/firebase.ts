import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// IMPORTANTE: Reemplaza esto con tu propia configuración de Firebase
// desde la configuración de tu proyecto en la consola de Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyDeKRqhO6mOi4suJTdoOKMOPPL4ZdiHayw",
  authDomain: "sarvoip-9a4a5.firebaseapp.com",
  projectId: "sarvoip-9a4a5",
  storageBucket: "sarvoip-9a4a5.firebasestorage.app",
  messagingSenderId: "212334592557",
  appId: "1:212334592557:web:f1ebe458dc26022def2ea4",
  measurementId: "G-KL71LP7KPE"
};
// Inicializar Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider };
