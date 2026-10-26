import { db, doc, onSnapshot, setDoc, serverTimestamp } from '../lib/firebase';

// Remove qualquer campo `undefined` recursivamente
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// 1. Escutar dados em tempo real da nuvem
export function subscribeToCloudDoc<T>(
  collectionName: string,
  docId: string,
  onUpdate: (data: T | null) => void,
  onError: (error: Error) => void
) {
  let isFirstSnapshot = true;
  const docRef = doc(db, collectionName, docId);

  return onSnapshot(
    docRef,
    (snapshot) => {
      // Ignora o eco das nossas próprias gravações locais após o primeiro carregamento
      if (!isFirstSnapshot && snapshot.metadata.hasPendingWrites) {
        return;
      }
      isFirstSnapshot = false;

      if (snapshot.exists()) {
        onUpdate(snapshot.data() as T);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.error('Erro no listener do Firestore:', err);
      onError(err);
    }
  );
}

// 2. Salvar dados na nuvem com merge e carimbo de data/hora ISO
export async function saveToCloudDoc<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  const docRef = doc(db, collectionName, docId);
  const sanitizedPayload = sanitizeForFirestore({
    ...data,
    lastUpdatedISO: data.lastUpdatedISO || new Date().toISOString(),
  });

  await setDoc(
    docRef,
    {
      ...sanitizedPayload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
