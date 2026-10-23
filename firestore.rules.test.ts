/**
 * Security Rules Verification Suite (Phase 0 TDD Specification)
 * Verifies that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenScenario[] = [
  { id: 1, name: 'Unauthenticated Write', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Spoof', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Identity Spoofing on Create (authorUid != auth.uid)', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow/Ghost Field Injection on Create (isAdmin: true)', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Path ID Poisoning (invalid characters)', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Denial-of-Wallet String Overflow (5000 chars)', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Invalid Scale Enum (99999L)', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Client Timestamp Forgery on Create', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Unauthorized Field Mutation on Update (temperature)', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Immutable Field Mutation on Update (authorUid)', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Unconstrained List Scraping without plantId filter', operation: 'list', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unauthorized Delete by Non-Owner/Non-Admin', operation: 'delete', expected: 'PERMISSION_DENIED' },
];
