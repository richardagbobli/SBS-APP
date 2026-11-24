# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity & Privilege Isolation**: No user may self-assign `School Administrator`, `Headteacher`, `Academic Coordinator`, `Class Teacher`, or `Subject Teacher` on profile creation unless their verified email matches the bootstrap administrator (`richardagbobli6@gmail.com` with `email_verified == true`). Self-created accounts default to `role: 'Pending'` and `isActive: false`.
2. **Verified Authentication**: Every read and write operation requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Class & Subject Scoping**:
   - `School Administrator`, `Headteacher`, and `Academic Coordinator` have school-wide read/write authority over academic configurations, approvals, and reports.
   - `Class Teacher` may create/update assessment records, KG competency ratings, personality assessments, and `Draft` / `Submitted` report cards ONLY for classes listed in their `assignedClassIds`.
   - `Subject Teacher` may create/update `assessmentRecords` ONLY for classes in `assignedClassIds` and subjects in `assignedSubjectIds`.
4. **Report Card Approval Terminal/Transition Guard**: Only `Headteacher` or `School Administrator` may transition a report card to `Approved`, `Published`, or `Returned for Correction`, or modify `headteacherRemarks`. Teachers may only submit `Draft` or `Returned for Correction` reports to `Submitted`. Once `Published`, only `School Administrator` / `Headteacher` can amend or unpublish.
5. **Immutable Audit Logs**: `auditLogs` are append-only (`create` allowed for active staff with `actorUid == request.auth.uid`; `update` and `delete` strictly forbidden).
6. **Path ID & Size Hardening**: All document IDs match `^[a-zA-Z0-9_-]{1,128}$`. Every string field has strict `.size()` bounds and arrays are bounded.

## 2. Adversarial "Dirty Dozen" Test Payloads
1. **Self-Escalation Profile Create**: `{ uid: "attacker", role: "School Administrator", isActive: true }` -> `PERMISSION_DENIED`
2. **Unverified Email Spoof**: Token with `email: "richardagbobli6@gmail.com"`, `email_verified: false` -> `PERMISSION_DENIED`
3. **Shadow Field Injection on Pupil**: Valid pupil payload + `{ isAdmin: true }` -> `PERMISSION_DENIED`
4. **Cross-Class Assessment Write**: Class Teacher assigned to `kg_1` writing `assessmentRecords` for `jhs_3` -> `PERMISSION_DENIED`
5. **Subject Teacher Out-of-Scope Subject**: Subject Teacher assigned to `math` writing `english` -> `PERMISSION_DENIED`
6. **Teacher Self-Approving Report Card**: Class Teacher updating `reportCards` status to `Approved` -> `PERMISSION_DENIED`
7. **Teacher Editing Published Report Card**: Class Teacher updating `teacherRemarks` when `existing().status == 'Published'` -> `PERMISSION_DENIED`
8. **Score Range Poisoning**: `assessmentRecords` with `totalScore: 999` or negative score -> `PERMISSION_DENIED`
9. **KG Rating Poisoning**: `competencyRatings` with `overallAverageRating: 10` -> `PERMISSION_DENIED`
10. **Audit Log Tampering**: Any user attempting `update` or `delete` on `/auditLogs/{id}` -> `PERMISSION_DENIED`
11. **Oversized ID Poisoning**: Document ID of 500 characters or invalid characters `../admin` -> `PERMISSION_DENIED`
12. **PII Cross-User Scrape**: Non-admin authenticated user executing `list` on `/users` -> `PERMISSION_DENIED`
