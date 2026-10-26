import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import localConfig from '../../firebase-applet-config.json';

// Verifica se o ambiente (ex: Vercel) está usando um projeto Firebase diferente do arquivo local
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const isUsingCustomEnvProject =
  Boolean(envProjectId) && envProjectId !== localConfig.projectId;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localConfig.authDomain,
  projectId: envProjectId || localConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localConfig.appId,
};

// Só usa o databaseId do arquivo local se estivermos no mesmo projeto
const databaseId = isUsingCustomEnvProject
  ? import.meta.env.VITE_FIREBASE_DATABASE_ID || undefined
  : import.meta.env.VITE_FIREBASE_DATABASE_ID || localConfig.firestoreDatabaseId || undefined;

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializa o Firestore ignorando campos `undefined` para nunca quebrar o setDoc
function initDb(): Firestore {
  try {
    return databaseId && databaseId !== '(default)'
      ? initializeFirestore(app, { ignoreUndefinedProperties: true }, databaseId)
      : initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return databaseId && databaseId !== '(default)'
      ? getFirestore(app, databaseId)
      : getFirestore(app);
  }
}

export const db = initDb();

// Valida conexão inicial com o Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp };
