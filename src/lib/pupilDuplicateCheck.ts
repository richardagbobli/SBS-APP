import { normalizeSchoolCodePrefix } from './calculations';

export interface PupilDuplicateCandidate {
  id?: string;
  admissionNumber?: string;
  firstName?: string;
  otherNames?: string;
  lastName?: string;
  fullName?: string;
  gender?: string;
  dateOfBirth?: string;
  currentClassId?: string;
  currentClassName?: string;
  guardianPhone?: string;
}

export interface PupilDuplicateMatch<T extends PupilDuplicateCandidate = PupilDuplicateCandidate> {
  reason: 'admission_number' | 'identity';
  matchedPupil: T;
  message: string;
}

export function normalizeAdmissionKey(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizePersonName(
  firstName?: string | null,
  otherNames?: string | null,
  lastName?: string | null,
  fullName?: string | null
): string {
  const combined = [firstName, otherNames, lastName]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const raw = combined || String(fullName ?? '');
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizePhoneDigits(phone: string | undefined | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function normalizeGenderKey(gender: string | undefined | null): string {
  const g = String(gender ?? '')
    .trim()
    .toLowerCase();
  if (g === 'm' || g === 'male' || g === 'boy') return 'male';
  if (g === 'f' || g === 'female' || g === 'girl') return 'female';
  return g;
}

export function normalizeDobKey(dob: string | undefined | null): string {
  return String(dob ?? '').trim();
}

function formatMatchedPupilLabel(pupil: PupilDuplicateCandidate): string {
  const name =
    [pupil.firstName, pupil.otherNames, pupil.lastName]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .join(' ') ||
    pupil.fullName ||
    'Existing Pupil';
  const adm = pupil.admissionNumber ? ` (${pupil.admissionNumber})` : '';
  const cls = pupil.currentClassName ? ` in ${pupil.currentClassName}` : '';
  return `"${name}"${adm}${cls}`;
}

/**
 * Checks whether `candidate` duplicates an existing pupil in `existingPupils`
 * by either:
 *  1) Matching Registration / Admission Number (case-insensitive), or
 *  2) Matching Pupil Identity (Full Name + Gender + Date of Birth / Guardian Phone / Same Class).
 *
 * Rows sharing `excludeDocId` (e.g. editing or promoting an existing pupil) are ignored.
 */
export function findDuplicatePupil<T extends PupilDuplicateCandidate>(
  existingPupils: readonly T[],
  candidate: PupilDuplicateCandidate,
  excludeDocId?: string
): PupilDuplicateMatch<T> | null {
  const candAdm = normalizeAdmissionKey(candidate.admissionNumber);

  if (candAdm) {
    for (const existing of existingPupils) {
      if (excludeDocId && existing.id === excludeDocId) continue;
      const existingAdm = normalizeAdmissionKey(existing.admissionNumber);
      if (existingAdm && existingAdm === candAdm) {
        return {
          reason: 'admission_number',
          matchedPupil: existing,
          message: `Duplicate enrollment restricted: Registration / Admission Number "${candidate.admissionNumber?.trim()}" is already assigned to ${formatMatchedPupilLabel(existing)}.`,
        };
      }
    }
  }

  const candName = normalizePersonName(
    candidate.firstName,
    candidate.otherNames,
    candidate.lastName,
    candidate.fullName
  );
  const candGender = normalizeGenderKey(candidate.gender);

  if (!candName || !candGender) {
    return null;
  }

  const candDob = normalizeDobKey(candidate.dateOfBirth);
  const candPhone = normalizePhoneDigits(candidate.guardianPhone);
  const candClassId = String(candidate.currentClassId ?? '').trim();

  for (const existing of existingPupils) {
    if (excludeDocId && existing.id === excludeDocId) continue;
    const existingName = normalizePersonName(
      existing.firstName,
      existing.otherNames,
      existing.lastName,
      existing.fullName
    );
    const existingGender = normalizeGenderKey(existing.gender);
    if (!existingName || existingName !== candName || existingGender !== candGender) {
      continue;
    }

    const existingDob = normalizeDobKey(existing.dateOfBirth);
    const existingPhone = normalizePhoneDigits(existing.guardianPhone);
    const existingClassId = String(existing.currentClassId ?? '').trim();

    const dobMatches = Boolean(candDob && existingDob && candDob === existingDob);
    const dobContradicts = Boolean(candDob && existingDob && candDob !== existingDob);

    const phoneMatches = Boolean(candPhone && existingPhone && candPhone === existingPhone);
    const phoneContradicts = Boolean(candPhone && existingPhone && candPhone !== existingPhone);

    const sameClass = Boolean(candClassId && existingClassId && candClassId === existingClassId);

    if (dobMatches || phoneMatches || (sameClass && !dobContradicts && !phoneContradicts)) {
      return {
        reason: 'identity',
        matchedPupil: existing,
        message: `Duplicate enrollment restricted: ${formatMatchedPupilLabel(existing)} is already enrolled with matching details.`,
      };
    }
  }

  return null;
}

/**
 * Checks whether a sign-in / registration code starts with the school's normalized code prefix.
 */
export function hasSchoolCodePrefix(code: string | undefined, schoolCode: string | undefined): boolean {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return false;
  const prefix = normalizeSchoolCodePrefix(schoolCode);
  return cleanCode.startsWith(`${prefix}-`) && cleanCode.length > prefix.length + 2;
}

/**
 * Generates the next guaranteed-unused Admission / Parent Sign-In Code for a school
 * using the `${SCHOOL_CODE}-${YEAR}-${SEQ}` format without colliding after deletions.
 */
export function generateNextAdmissionNumber(
  schoolCode: string | undefined,
  existingPupils: readonly PupilDuplicateCandidate[],
  extraUsedCodes: readonly string[] = []
): string {
  const prefix = normalizeSchoolCodePrefix(schoolCode);
  const year = new Date().getFullYear();
  const usedNumbers = new Set<string>(
    [
      ...existingPupils.map((p) => normalizeAdmissionKey(p.admissionNumber)),
      ...extraUsedCodes.map((c) => normalizeAdmissionKey(c)),
    ].filter(Boolean)
  );

  let maxSeq = existingPupils.length + 100;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}-${year}-(\\d+)$`, 'i');
  for (const p of existingPupils) {
    const match = pattern.exec(String(p.admissionNumber ?? '').trim());
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxSeq) {
        maxSeq = n;
      }
    }
  }

  let seq = maxSeq + 1;
  let candidate = `${prefix}-${year}-${seq}`;
  while (usedNumbers.has(candidate.toUpperCase())) {
    seq++;
    candidate = `${prefix}-${year}-${seq}`;
  }
  return candidate;
}

/**
 * Generates a brand-new unique Parent Sign-In / Registration Code starting with the school code
 * (used exclusively when the School Administrator regenerates a user's code).
 */
export function regeneratePupilAdmissionNumber(
  schoolCode: string | undefined,
  existingCodes: readonly string[],
  currentCode?: string
): string {
  const prefix = normalizeSchoolCodePrefix(schoolCode);
  const year = new Date().getFullYear();
  const used = new Set(
    existingCodes.map((c) => normalizeAdmissionKey(c)).filter(Boolean)
  );
  if (currentCode) {
    used.add(normalizeAdmissionKey(currentCode));
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${year}-${num}`;
    if (!used.has(candidate.toUpperCase())) {
      return candidate;
    }
  }

  let seq = 10000;
  let candidate = `${prefix}-${year}-${seq}`;
  while (used.has(candidate.toUpperCase())) {
    seq++;
    candidate = `${prefix}-${year}-${seq}`;
  }
  return candidate;
}
