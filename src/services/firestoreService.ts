import { db, doc, onSnapshot, setDoc, serverTimestamp } from '../lib/firebase';

// Remove qualquer campo `undefined` ou `NaN` recursivamente para evitar erros no Firestore
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return 0;
      }
      return value;
    })
  );
}

// 1. Escutar dados em tempo real da nuvem
export function subscribeToCloudDoc<T>(
  collectionName: string,
  docId: string,
  onUpdate: (data: T | null, fromCache: boolean) => void,
  onError: (error: Error) => void
) {
  const docRef = doc(db, collectionName, docId);

  return onSnapshot(
    docRef,
    (snapshot) => {
      // Ignora o eco das próprias gravações pendentes locais (o estado local já é atualizado sincronamente)
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }

      if (snapshot.exists()) {
        onUpdate(snapshot.data() as T, snapshot.metadata.fromCache);
      } else {
        onUpdate(null, snapshot.metadata.fromCache);
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

