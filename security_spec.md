# BioTrack Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched under `/databases/{database}/documents` are strictly denied (`allow read, write: if false;`).
2. **Verified Plant Identity**: Every read and write operation on `/checklists/{checklistId}` requires an authenticated user with a verified Google email (`request.auth != null && request.auth.token.email_verified == true`).
3. **ID Poisoning Guard**: Every single-document operation (`get`, `create`, `update`, `delete`) validates `checklistId` via `isValidId(checklistId)` (`size() <= 128 && matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Strict Blueprint Schema (`isValidChecklist`)**:
   - Enforces required keys via `hasAll` and prevents shadow/ghost fields via `hasOnly`.
   - Enforces `plantId == 'biotrack-main'` (`size() <= 32`).
   - Enforces `authorUid` matches `^[a-zA-Z0-9_\-]+$` (`size() <= 128`).
   - Enforces string `.size()` bounds on every string field (`reactorTag <= 16`, `scale <= 10`, `batchId <= 64`, `operatorName <= 100`, `date <= 16`, `time <= 10`, `deviationNotes <= 1000`, `operatorSignature <= 120`, `notes <= 1000`).
   - Enforces numeric range bounds (`reactorId >= 1 && reactorId <= 16`, `deviationsCount >= 0 && deviationsCount <= 5`).
5. **Temporal Integrity**:
   - On `create`: `incoming().createdAt == request.time && incoming().updatedAt == request.time`.
   - On `update`: `incoming().updatedAt == request.time && incoming().createdAt == existing().createdAt`.
6. **Immutable Ownership & Action-Based Updates**:
   - On `create`: `incoming().authorUid == request.auth.uid`.
   - On `update`: Wraps with `isValidChecklist(incoming())`, locks `authorUid`, `plantId`, `id`, and `createdAt`, and only allows the `ArchiveToggle` action (`incoming().diff(existing()).affectedKeys().hasOnly(['archived', 'updatedAt'])`).
7. **Query Enforcer on `list`**:
   - `allow list` explicitly checks `existing().plantId == 'biotrack-main'`, forcing clients to filter by `where('plantId', '==', 'biotrack-main')`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Creating a checklist with `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Creating a checklist with `email_verified = false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: Setting `authorUid` to another user's UID -> `PERMISSION_DENIED`.
4. **Shadow/Ghost Field Injection on Create**: Including `"isAdmin": true` in checklist payload -> `PERMISSION_DENIED`.
5. **Path ID Poisoning**: Creating a document with ID containing spaces or special characters (`bad/id$1`) -> `PERMISSION_DENIED`.
6. **Denial-of-Wallet String Overflow**: Sending a 5,000-character string in `operatorName` or `deviationNotes` -> `PERMISSION_DENIED`.
7. **Invalid Scale Enum**: Setting `scale: "99999L"` outside `['100L', '500L', '3000L', '5000L']` -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery on Create**: Sending a past or future `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Unauthorized Field Mutation on Update**: Attempting to modify `temperature` or `operatorName` during an update -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation on Update**: Attempting to change `authorUid` or `createdAt` during an update -> `PERMISSION_DENIED`.
11. **Unconstrained List Scraping**: Querying `/checklists` without `where('plantId', '==', 'biotrack-main')` or reading a doc with another `plantId` -> `PERMISSION_DENIED`.
12. **Unauthorized Delete by Non-Owner/Non-Admin**: Attempting to delete a checklist created by another operator without admin rights -> `PERMISSION_DENIED`.
