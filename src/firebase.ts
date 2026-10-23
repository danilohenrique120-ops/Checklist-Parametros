import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { ChecklistRecord } from './types/bioreactor';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const PLANT_ID = 'biotrack-main';
export const CHECKLISTS_COLLECTION = 'checklists';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup
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

// Blueprint constants for defensive payload validation
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned.length > 0 && ID_REGEX.test(cleaned) ? cleaned : `chk-${Date.now()}`;
}

function clampString(val: string | undefined, maxLen: number, fallback = ''): string {
  const str = (val ?? fallback).trim();
  return str.slice(0, maxLen);
}

function clampNumber(val: number, min: number, max: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function buildFirestoreChecklistPayload(record: ChecklistRecord, authorUid: string) {
  const safeId = sanitizeId(record.id);
  const safeAuthorUid = sanitizeId(authorUid);

  const payload: Record<string, unknown> = {
    id: safeId,
    plantId: PLANT_ID,
    authorUid: safeAuthorUid,
    reactorId: clampNumber(Math.round(record.reactorId), 1, 16),
    reactorTag: clampString(record.reactorTag, 16, 'BR-01'),
    scale: ['100L', '500L', '3000L', '5000L'].includes(record.scale) ? record.scale : '100L',
    batchId: clampString(record.batchId, 64, 'L-100-24A'),
    operatorName: clampString(record.operatorName, 100, 'Operador'),
    date: clampString(record.date, 16, new Date().toISOString().slice(0, 10)),
    time: clampString(record.time, 10, '08:00'),
    timestamp: Math.max(0, Number(record.timestamp) || Date.now()),
    processHours: clampNumber(Number(record.processHours), 0, 10000),
    archived: Boolean(record.archived),
    temperature: clampNumber(Number(record.temperature), -50, 200),
    dissolvedOxygen: clampNumber(Number(record.dissolvedOxygen), 0, 500),
    agitation: clampNumber(Number(record.agitation), 0, 5000),
    pressure: clampNumber(Number(record.pressure), -10, 100),
    airflow: clampNumber(Number(record.airflow), 0, 50000),
    isTemperatureNominal: Boolean(record.isTemperatureNominal),
    isPressureNominal: Boolean(record.isPressureNominal),
    isAgitationNominal: Boolean(record.isAgitationNominal),
    isAirflowNominal: Boolean(record.isAirflowNominal),
    isDONominal: Boolean(record.isDONominal),
    isFullyNominal: Boolean(record.isFullyNominal),
    deviationsCount: clampNumber(Math.round(record.deviationsCount), 0, 5),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof record.standardCurveO2 === 'number' && !Number.isNaN(record.standardCurveO2)) {
    payload.standardCurveO2 = clampNumber(record.standardCurveO2, 0, 500);
  }
  if (record.deviationNotes && record.deviationNotes.trim().length > 0) {
    payload.deviationNotes = clampString(record.deviationNotes, 1000);
  }
  if (record.operatorSignature && record.operatorSignature.trim().length > 0) {
    payload.operatorSignature = clampString(record.operatorSignature, 120);
  }
  if (record.notes && record.notes.trim().length > 0) {
    payload.notes = clampString(record.notes, 1000);
  }

  return { safeId, payload };
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

export async function saveChecklistRecordToFirestore(record: ChecklistRecord): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Autenticação necessária para salvar na nuvem.');
  }
  const { safeId, payload } = buildFirestoreChecklistPayload(record, currentUser.uid);
  const docPath = `${CHECKLISTS_COLLECTION}/${safeId}`;
  try {
    await setDoc(doc(db, CHECKLISTS_COLLECTION, safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function toggleBatchArchiveInFirestore(
  recordsToUpdate: ChecklistRecord[],
  archive: boolean
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Autenticação necessária para atualizar lotes na nuvem.');
  }
  for (const rec of recordsToUpdate) {
    const safeId = sanitizeId(rec.id);
    const docPath = `${CHECKLISTS_COLLECTION}/${safeId}`;
    try {
      await updateDoc(doc(db, CHECKLISTS_COLLECTION, safeId), {
        archived: Boolean(archive),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }
}

export async function deleteChecklistFromFirestore(id: string): Promise<void> {
  const safeId = sanitizeId(id);
  const docPath = `${CHECKLISTS_COLLECTION}/${safeId}`;
  try {
    await deleteDoc(doc(db, CHECKLISTS_COLLECTION, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function seedInitialChecklistsIfNeeded(seedRecords: ChecklistRecord[]): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const q = query(collection(db, CHECKLISTS_COLLECTION), where('plantId', '==', PLANT_ID));
  try {
    const existingSnap = await getDocs(q);
    if (!existingSnap.empty) {
      return;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CHECKLISTS_COLLECTION);
  }

  try {
    const batch = writeBatch(db);
    for (const rec of seedRecords) {
      const { safeId, payload } = buildFirestoreChecklistPayload(rec, currentUser.uid);
      batch.set(doc(db, CHECKLISTS_COLLECTION, safeId), payload);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CHECKLISTS_COLLECTION);
  }
}

export async function resetCloudChecklistsToSeed(seedRecords: ChecklistRecord[]): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const q = query(collection(db, CHECKLISTS_COLLECTION), where('plantId', '==', PLANT_ID));
  try {
    const existingSnap = await getDocs(q);
    for (const d of existingSnap.docs) {
      try {
        await deleteDoc(doc(db, CHECKLISTS_COLLECTION, d.id));
      } catch {
        // Ignore individual delete if another user created it and current user isn't admin
      }
    }
    const batch = writeBatch(db);
    for (const rec of seedRecords) {
      const { safeId, payload } = buildFirestoreChecklistPayload(rec, currentUser.uid);
      batch.set(doc(db, CHECKLISTS_COLLECTION, safeId), payload);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CHECKLISTS_COLLECTION);
  }
}

export function subscribeToPlantChecklists(
  onData: (records: ChecklistRecord[]) => void,
  onError?: (err: unknown) => void
) {
  const q = query(collection(db, CHECKLISTS_COLLECTION), where('plantId', '==', PLANT_ID));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChecklistRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id ?? docSnap.id),
          reactorId: Number(d.reactorId),
          reactorTag: String(d.reactorTag),
          scale: d.scale,
          batchId: String(d.batchId),
          operatorName: String(d.operatorName),
          date: String(d.date),
          time: String(d.time),
          timestamp: Number(d.timestamp),
          processHours: Number(d.processHours),
          archived: Boolean(d.archived),
          temperature: Number(d.temperature),
          dissolvedOxygen: Number(d.dissolvedOxygen),
          standardCurveO2: typeof d.standardCurveO2 === 'number' ? d.standardCurveO2 : undefined,
          agitation: Number(d.agitation),
          pressure: Number(d.pressure),
          airflow: Number(d.airflow),
          isTemperatureNominal: Boolean(d.isTemperatureNominal),
          isPressureNominal: Boolean(d.isPressureNominal),
          isAgitationNominal: Boolean(d.isAgitationNominal),
          isAirflowNominal: Boolean(d.isAirflowNominal),
          isDONominal: Boolean(d.isDONominal),
          isFullyNominal: Boolean(d.isFullyNominal),
          deviationsCount: Number(d.deviationsCount),
          deviationNotes: d.deviationNotes ? String(d.deviationNotes) : undefined,
          operatorSignature: d.operatorSignature ? String(d.operatorSignature) : undefined,
          notes: d.notes ? String(d.notes) : undefined,
        };
      });
      // Sort descending by timestamp
      list.sort((a, b) => b.timestamp - a.timestamp);
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, CHECKLISTS_COLLECTION);
    }
  );
}
