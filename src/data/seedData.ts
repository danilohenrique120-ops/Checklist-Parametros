import { ChecklistRecord } from '../types/bioreactor';

export const INITIAL_OPERATORS = [
  'Matheus Henrique',
  'Vinicius Zanetti',
  'Gustavo Conti',
  'Valdelir Pires',
  'Willian Lins',
  'Uanderson da Silva',
  'Felipe',
  'Nathan',
];

// IDs e lotes fictícios de demonstração antiga que nunca devem reaparecer no ambiente de produção
export const FICTIONAL_SEED_IDS = new Set([
  'chk-101',
  'chk-102',
  'chk-103',
  'chk-104',
  'chk-105',
  'chk-106',
  'chk-107',
  'chk-108',
  'chk-109',
  'chk-110',
  'chk-111',
  'chk-112',
  'chk-01',
  'chk-01b',
  'chk-01c',
  'chk-02',
  'chk-02b',
  'chk-02c',
  'chk-03',
  'chk-03b',
  'chk-03c',
  'chk-04',
  'chk-04b',
  'chk-04c',
  'chk-05',
  'chk-05b',
  'chk-05c',
  'chk-06',
  'chk-06b',
  'chk-06c',
  'chk-07',
  'chk-07b',
  'chk-07c',
  'chk-08',
  'chk-08b',
  'chk-08c',
  'chk-09',
  'chk-09b',
  'chk-10',
  'chk-10b',
  'chk-10c',
  'chk-11',
  'chk-11b',
  'chk-12',
  'chk-12b',
  'chk-13',
  'chk-14',
  'chk-15',
  'chk-16',
  'chk-17',
  'chk-18',
  'chk-18b',
  'chk-19',
  'chk-20',
  'chk-21',
  'chk-22',
  'chk-23',
  'chk-arch-1',
  'chk-arch-2',
  'chk-arch-3',
  'chk-arch-4',
  'chk-arch-5',
]);

export const FICTIONAL_SEED_BATCHES = new Set([
  'L-100-24A',
  'L-100-24B',
  'L-5K-09B',
  'L-500-18B',
  'L-3K-12A',
  'L-100-23Z',
]);

export function isFictionalSeedRecord(rec: ChecklistRecord): boolean {
  if (!rec) return true;
  if (FICTIONAL_SEED_IDS.has(rec.id)) return true;
  if (rec.batchId && FICTIONAL_SEED_BATCHES.has(rec.batchId) && rec.date?.startsWith('2026-09-')) {
    return true;
  }
  return false;
}

export const SEED_CHECKLISTS: ChecklistRecord[] = [];
