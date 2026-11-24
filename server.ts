import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  getEffectiveLockNotice,
  portalStore,
  SchoolCollectionName,
  signPortalToken,
  verifyPassword,
  verifyPortalToken,
} from './server/portalStore';
import { getOrCreateUser } from './src/db/users.ts';
import {
  getSchoolDivisions,
  isLevelCategoryEnabled,
  isSubjectLevelEnabled,
  normalizeSubjectLevels,
} from './src/lib/calculations';
import {
  findDuplicatePupil,
  generateNextAdmissionNumber,
  hasSchoolCodePrefix,
} from './src/lib/pupilDuplicateCheck';
import { JhsAssignment, LevelCategory, PortalSession, SubjectLevel } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');
const MAX_UPLOAD_BYTES = 1_500_000; // 1.5 MB decoded image ceiling

const authRateBuckets = new Map<string, number[]>();
function isRateLimited(bucketKey: string, maxRequests = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  if (authRateBuckets.size > 1000) {
    for (const [key, timestamps] of authRateBuckets.entries()) {
      const fresh = timestamps.filter((ts) => now - ts < 15 * 60_000);
      if (fresh.length === 0) {
        authRateBuckets.delete(key);
      } else if (fresh.length !== timestamps.length) {
        authRateBuckets.set(key, fresh);
      }
    }
  }
  const prev = authRateBuckets.get(bucketKey) || [];
  const recent = prev.filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    authRateBuckets.set(bucketKey, recent);
    return true;
  }
  recent.push(now);
  authRateBuckets.set(bucketKey, recent);
  return false;
}

function formatPhoneDigitsForDispatch(phone: string, defaultCountryCode = '233'): string | null {
  const digits = (phone || '').replace(/[^\d]/g, '');
  if (digits.length < 7) return null;
  if (digits.startsWith('0') && digits.length === 10) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  return digits;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  if (lower.startsWith('::ffff:')) {
    return isPrivateOrLoopbackIp(lower.slice(7));
  }
  const parts = lower.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return net.isIP(ip) === 6 ? false : true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function isSafeExternalWebhookUrl(rawUrl: string): Promise<URL | null> {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return null;
    }
    if (net.isIP(hostname)) {
      return isPrivateOrLoopbackIp(hostname) ? null : parsed;
    }
    const resolved = await dns.lookup(hostname, { all: true });
    if (!resolved.length || resolved.some((entry) => isPrivateOrLoopbackIp(entry.address))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function dispatchRecoveryVerificationCode(params: {
  channel: 'email' | 'phone';
  recipient: string;
  otp: string;
  accountLabels: string[];
  schoolName?: string;
}): Promise<'email' | 'webhook' | 'admin_relay'> {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RECOVERY_FROM_EMAIL || '').trim();
  const webhookUrl = (process.env.RECOVERY_WEBHOOK_URL || '').trim();
  const schoolLabel = (params.schoolName || '').trim() || 'Basic School Portal';

  if (params.channel === 'email' && resendKey && fromEmail) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.recipient],
          subject: `${schoolLabel} — Password Recovery Verification Code`,
          text:
            `Your ${schoolLabel} password recovery verification code is: ${params.otp}\n\n` +
            `This code expires in 15 minutes and matches: ${params.accountLabels.join(', ')}.\n` +
            `If you did not request a password reset, you can safely ignore this message.`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        return 'email';
      }
      console.warn('Resend password recovery email returned non-OK status:', resp.status);
    } catch (err) {
      console.warn('Password recovery email dispatch failed:', err);
    }
  }

  if (webhookUrl) {
    const safeUrl = await isSafeExternalWebhookUrl(webhookUrl);
    if (safeUrl) {
      try {
        const resp = await fetch(safeUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: params.channel,
            recipient: params.recipient,
            code: params.otp,
            expiresInMinutes: 15,
            accountLabels: params.accountLabels,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          return 'webhook';
        }
        console.warn('Recovery webhook returned non-OK status:', resp.status);
      } catch (err) {
        console.warn('Recovery webhook dispatch failed:', err);
      }
    }
  }

  return 'admin_relay';
}

function detectImageSignature(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

async function saveValidatedImageUpload(
  dataUrl: string,
  safePrefix: 'logo' | 'pupil' | 'teacher' | 'signature'
): Promise<{ url: string } | { status: number; error: string }> {
  const trimmed = typeof dataUrl === 'string' ? dataUrl.trim() : '';
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (!match) {
    return { status: 400, error: 'Only PNG, JPEG, or WebP image uploads are supported.' };
  }

  const declaredMime = match[1];
  const base64Payload = match[2];
  const buffer = Buffer.from(base64Payload, 'base64');

  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    return { status: 400, error: 'Image file size must be 1.5 MB or smaller.' };
  }

  const detected = detectImageSignature(buffer);
  if (!detected || detected.mime !== declaredMime) {
    return { status: 400, error: 'Uploaded file failed image signature verification.' };
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${safePrefix}_${crypto.randomUUID().replace(/-/g, '')}.${detected.ext}`;
  const targetPath = path.resolve(UPLOADS_DIR, filename);
  if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
    return { status: 403, error: 'Invalid upload destination.' };
  }

  await fs.promises.writeFile(targetPath, buffer);
  return { url: `/api/uploads/${filename}` };
}

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();

type ActorContext =
  | {
      kind: 'school_admin';
      uid: string;
      schoolId: string;
      email: string;
      displayName: string;
      role: 'School Administrator';
      authMethod: 'password' | 'google';
    }
  | {
      kind: 'class_teacher';
      uid: string;
      schoolId: string;
      displayName: string;
      role: 'Class Teacher';
      teacherId?: string;
      assignedClassIds: string[];
    }
  | {
      kind: 'jhs_teacher';
      uid: string;
      schoolId: string;
      displayName: string;
      role: 'Subject Teacher';
      teacherId?: string;
      assignedClassIds: string[];
      assignedSubjectIds: string[];
      jhsAssignments?: JhsAssignment[];
    }
  | {
      kind: 'parent';
      uid: string;
      schoolId: string;
      pupilId: string;
      admissionNumber: string;
      displayName: string;
      role: 'Parent';
    };

interface AuthRequest extends Request {
  actor?: ActorContext;
}

const VALID_COLLECTIONS: ReadonlySet<string> = new Set<SchoolCollectionName>([
  'schoolSettings',
  'academicYears',
  'terms',
  'classes',
  'subjects',
  'learningAreas',
  'assessmentConfigs',
  'gradingScales',
  'pupils',
  'assessmentRecords',
  'competencyRatings',
  'personalityAssessments',
  'reportCards',
  'promotionRecords',
  'auditLogs',
  'teachers',
]);

async function requireAnyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();

  // 1. Check HMAC-signed Portal Session Token first (2 base64url segments)
  if (token.split('.').length === 2) {
    const portalPayload = verifyPortalToken(token);
    if (!portalPayload) {
      res.status(401).json({ error: 'Invalid or expired portal session. Please sign in again.' });
      return;
    }

    if (portalPayload.sessionType === 'school_admin') {
      if (
        typeof portalPayload.sessionVersion !== 'number' ||
        portalPayload.sessionVersion !== portalStore.getSchoolAdminSessionVersion()
      ) {
        res.status(401).json({
          error:
            'Your School Administrator session has been revoked or credentials were changed. Please sign in again.',
        });
        return;
      }
      const primarySchoolId = portalStore.getPrimarySchoolId();
      req.actor = {
        kind: 'school_admin',
        uid: 'school_admin_portal',
        schoolId: primarySchoolId,
        email: portalPayload.email || portalStore.getSchoolAdminEmail(),
        displayName: portalPayload.displayName || 'School Administrator',
        role: 'School Administrator',
        authMethod: 'password',
      };
      next();
      return;
    }

    const bucket = portalStore.getBucket(portalPayload.schoolId);
    if (!bucket || !bucket.school.isActive) {
      res.status(403).json({ error: 'This school portal is currently inactive.' });
      return;
    }
    if (bucket.school.isLocked) {
      const lockNotice = getEffectiveLockNotice(bucket.school);
      res.status(403).json({
        error: lockNotice,
        schoolLocked: true,
        lockNotice,
      });
      return;
    }

    if (portalPayload.sessionType === 'class_teacher') {
      req.actor = {
        kind: 'class_teacher',
        uid: portalPayload.teacherId || `class_${portalPayload.schoolId}_${portalPayload.assignedClassIds[0] || 'cls'}`,
        schoolId: portalPayload.schoolId,
        displayName: portalPayload.displayName,
        role: 'Class Teacher',
        teacherId: portalPayload.teacherId,
        assignedClassIds: portalPayload.assignedClassIds,
      };
    } else if (portalPayload.sessionType === 'jhs_teacher') {
      req.actor = {
        kind: 'jhs_teacher',
        uid: portalPayload.teacherId || `jhs_${portalPayload.schoolId}_${portalPayload.assignedSubjectIds[0] || 'subj'}`,
        schoolId: portalPayload.schoolId,
        displayName: portalPayload.displayName,
        role: 'Subject Teacher',
        teacherId: portalPayload.teacherId,
        assignedClassIds: portalPayload.assignedClassIds,
        assignedSubjectIds: portalPayload.assignedSubjectIds,
        jhsAssignments: portalPayload.jhsAssignments,
      };
    } else if (portalPayload.sessionType === 'parent' && portalPayload.pupilId) {
      req.actor = {
        kind: 'parent',
        uid: `parent_${portalPayload.pupilId}`,
        schoolId: portalPayload.schoolId,
        pupilId: portalPayload.pupilId,
        admissionNumber: portalPayload.admissionNumber || '',
        displayName: portalPayload.displayName,
        role: 'Parent',
      };
    } else {
      res.status(401).json({ error: 'Invalid portal session type.' });
      return;
    }
    next();
    return;
  }

  // 2. Otherwise verify Firebase Google ID Token (School Administrator — strictly locked to authorized Google email)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();
    const allowedGoogleEmail = portalStore.getSchoolAdminGoogleEmail();
    if (email !== allowedGoogleEmail || decoded.email_verified !== true) {
      res.status(403).json({
        error: 'Access Denied: you are not authorize to use google sign in',
      });
      return;
    }
    const primarySchoolId = portalStore.getPrimarySchoolId();
    req.actor = {
      kind: 'school_admin',
      uid: decoded.uid,
      schoolId: primarySchoolId,
      email: decoded.email || allowedGoogleEmail,
      displayName: decoded.name || 'School Administrator',
      role: 'School Administrator',
      authMethod: 'google',
    };
    void getOrCreateUser(
      decoded.uid,
      decoded.email || allowedGoogleEmail,
      decoded.name || 'School Administrator',
      'School Administrator'
    ).catch((syncErr) => {
      console.error('Non-blocking user sync failed:', syncErr);
    });
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
}

function ensureSchoolAccess(actor: ActorContext, schoolId: string): boolean {
  if (actor.kind === 'school_admin') return true;
  return actor.schoolId === schoolId;
}

function canActorMutateDoc(
  actor: ActorContext,
  schoolId: string,
  collectionName: SchoolCollectionName,
  data: Record<string, unknown>,
  docId?: string
): string | null {
  if (!ensureSchoolAccess(actor, schoolId)) {
    return 'Access denied for this school.';
  }
  if (actor.kind === 'parent') {
    return 'Parents have read-only access and cannot modify school records.';
  }

  // Enforce enabled school divisions across all write operations
  const bucket = portalStore.getBucket(schoolId);
  if (bucket) {
    const divs = getSchoolDivisions(bucket.school);
    if (collectionName === 'classes') {
      const lvl = typeof data.levelCategory === 'string' ? (data.levelCategory as LevelCategory) : null;
      if (lvl && !isLevelCategoryEnabled(lvl, divs)) {
        return 'This school division is not enabled for this school. Only the School Administrator can enable divisions.';
      }
    } else if (collectionName === 'learningAreas' || collectionName === 'competencyRatings') {
      if (!divs.hasKg) {
        return 'Kindergarten (KG 1–2) is not enabled for this school.';
      }
    } else if (collectionName === 'assessmentConfigs') {
      const lvl = typeof data.levelCategory === 'string' ? (data.levelCategory as LevelCategory) : null;
      if (lvl && !isLevelCategoryEnabled(lvl, divs)) {
        return 'This school division is not enabled for this school.';
      }
    } else if (collectionName === 'gradingScales') {
      const lvl = typeof data.levelCategory === 'string' ? (data.levelCategory as LevelCategory) : null;
      if (lvl === 'JHS' && !divs.hasJhs) {
        return 'Junior High School (JHS 1–3) is not enabled for this school.';
      }
      if (lvl === 'PRIMARY' && !divs.hasPrimary && !divs.hasKg) {
        return 'Primary / Kindergarten division is not enabled for this school.';
      }
    } else if (collectionName === 'subjects') {
      if (Array.isArray(data.applicableLevels)) {
        const normalized = normalizeSubjectLevels(data.applicableLevels as Array<SubjectLevel | 'PRIMARY'>);
        const hasDisabled = normalized.some((lvl) => !isSubjectLevelEnabled(lvl, divs));
        if (hasDisabled) {
          return 'One or more selected subject levels belong to a school division that is not enabled for this school.';
        }
      }
    } else if (collectionName === 'pupils') {
      const clsId = typeof data.currentClassId === 'string' ? data.currentClassId : '';
      const cls = clsId ? bucket.classes[clsId] : undefined;
      if (cls && !isLevelCategoryEnabled(cls.levelCategory, divs)) {
        return 'Selected class belongs to a school division that is not enabled for this school.';
      }
    } else if (
      collectionName === 'assessmentRecords' ||
      collectionName === 'personalityAssessments' ||
      collectionName === 'reportCards'
    ) {
      const clsId = typeof data.classId === 'string' ? data.classId : '';
      const cls = clsId ? bucket.classes[clsId] : undefined;
      if (cls && !isLevelCategoryEnabled(cls.levelCategory, divs)) {
        return 'Selected class belongs to a school division that is not enabled for this school.';
      }
    }
  }

  if (actor.kind === 'school_admin') {
    return null;
  }

  // Teachers can write to instructional assessment/report/audit collections and enroll pupils in their assigned class(es)
  const teacherWritable: ReadonlySet<SchoolCollectionName> = new Set([
    'pupils',
    'assessmentRecords',
    'competencyRatings',
    'personalityAssessments',
    'reportCards',
    'auditLogs',
  ]);
  if (!teacherWritable.has(collectionName)) {
    return `Teachers cannot modify ${collectionName}.`;
  }

  if (collectionName === 'auditLogs') {
    return null;
  }

  if (collectionName === 'pupils') {
    const targetClassId =
      typeof data.currentClassId === 'string' ? data.currentClassId.trim() : '';
    if (!targetClassId || !actor.assignedClassIds.includes(targetClassId)) {
      return 'Teachers can only enroll or update pupils in their assigned class(es).';
    }
    if (bucket && !bucket.classes[targetClassId]) {
      return 'Selected class was not found in this school.';
    }
    if (docId && bucket?.pupils[docId]) {
      const existingClassId = bucket.pupils[docId].currentClassId;
      if (existingClassId && !actor.assignedClassIds.includes(existingClassId)) {
        return 'Teachers cannot modify or move pupils enrolled in another class.';
      }
    }
    return null;
  }

  const classId = typeof data.classId === 'string' ? data.classId : '';
  if (!classId || !actor.assignedClassIds.includes(classId)) {
    return 'You can only save records for your assigned class(es).';
  }

  if (collectionName === 'reportCards') {
    const status = typeof data.status === 'string' ? data.status : 'Draft';
    if (status === 'Approved' || status === 'Published' || status === 'Returned for Correction') {
      return 'Only the School Administrator can approve, return, or publish report cards.';
    }
  }

  if (actor.kind === 'jhs_teacher' && collectionName === 'assessmentRecords') {
    const subjectId = typeof data.subjectId === 'string' ? data.subjectId : '';
    const hasGranularAssignments = Boolean(actor.jhsAssignments && actor.jhsAssignments.length > 0);
    const matchesAssignment = hasGranularAssignments
      ? actor.jhsAssignments!.some((a) => a.classId === classId && a.subjectId === subjectId)
      : actor.assignedSubjectIds.includes(subjectId);
    if (!subjectId || !actor.assignedSubjectIds.includes(subjectId) || !matchesAssignment) {
      return 'You can only save scores for your assigned JHS class and subject(s).';
    }
  }

  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const asyncHandler =
    (
      fn: (req: AuthRequest, res: Response, next: NextFunction) => unknown | Promise<unknown>
    ) =>
    (req: AuthRequest, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // Automatically guard all /api route handlers & middleware against unhandled async rejections
  for (const method of ['get', 'post', 'patch', 'put', 'delete'] as const) {
    const original = app[method].bind(app);
    (app as unknown as Record<string, (...args: unknown[]) => unknown>)[method] = (
      routePath: unknown,
      ...handlers: unknown[]
    ) => {
      if (typeof routePath === 'string' && routePath.startsWith('/api')) {
        const wrapped = handlers.map((h) =>
          typeof h === 'function' && h.length < 4
            ? asyncHandler(h as (req: AuthRequest, res: Response, next: NextFunction) => unknown)
            : h
        );
        return (original as (...args: unknown[]) => unknown)(routePath, ...wrapped);
      }
      return (original as (...args: unknown[]) => unknown)(routePath, ...handlers);
    };
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', asyncHandler(async (_req: Request, _res: Response, next: NextFunction) => {
    await portalStore.ensureHydrated();
    next();
  }));

  // Safe uploaded image serving with strict filename allowlist & path confinement
  app.get('/api/uploads/:filename', (req: Request, res: Response) => {
    const filename = typeof req.params?.filename === 'string' ? req.params.filename : '';
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid image filename.' });
      return;
    }
    const resolvedPath = path.resolve(UPLOADS_DIR, filename);
    if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(403).json({ error: 'Forbidden path.' });
      return;
    }
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(resolvedPath);
  });

  // Public School Portal Registration Status & Branding (NO secrets, NO PII)
  app.get('/api/public/portal-info', (_req, res) => {
    res.json(portalStore.getPublicPortalInfo());
  });

  // One-Time Public School Registration (blocked permanently once registered)
  app.post('/api/public/register-school', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`register_school:${ip}`, 10, 5 * 60_000)) {
      res.status(429).json({
        error: 'Too many registration attempts from this network. Please wait a moment and try again.',
      });
      return;
    }

    const body = req.body ?? {};
    const result = await portalStore.registerSingleSchool({
      name: typeof body.name === 'string' ? body.name : '',
      motto: typeof body.motto === 'string' ? body.motto : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      telephone: typeof body.telephone === 'string' ? body.telephone : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      headteacherName:
        typeof body.headteacherName === 'string' ? body.headteacherName : undefined,
      academicCoordinatorName:
        typeof body.academicCoordinatorName === 'string'
          ? body.academicCoordinatorName
          : undefined,
      hasKg: typeof body.hasKg === 'boolean' ? body.hasKg : undefined,
      hasPrimary: typeof body.hasPrimary === 'boolean' ? body.hasPrimary : undefined,
      hasJhs: typeof body.hasJhs === 'boolean' ? body.hasJhs : undefined,
      adminEmail: typeof body.adminEmail === 'string' ? body.adminEmail : '',
      adminPhone: typeof body.adminPhone === 'string' ? body.adminPhone : '',
      adminPassword: typeof body.adminPassword === 'string' ? body.adminPassword : '',
      ipAddress: ip,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      ok: true,
      portalInfo: result.portalInfo,
      school: result.school,
    });
  });

  // Public School Directory for Login Dropdowns (NO secrets, NO PII)
  app.get('/api/public/schools', (_req, res) => {
    res.json({ schools: portalStore.getPublicSchools() });
  });

  // Unified Public Lookup by School Code or Pupil Registration Number (rate-limited; NO secrets, NO PII)
  app.get('/api/public/unified-lookup', (req: Request, res: Response) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`unified_lookup:${ip}`, 50, 60_000)) {
      res.status(429).json({ error: 'Too many lookup attempts. Please wait a moment and try again.' });
      return;
    }
    const identifier =
      typeof req.query?.identifier === 'string' ? req.query.identifier.trim() : '';
    if (identifier.length < 2) {
      res.json({ kind: 'none', schoolCodeMatches: [], parentMatches: [] });
      return;
    }

    const schoolCodeMatches = portalStore.lookupSchoolsByCode(identifier);
    if (schoolCodeMatches.length > 0) {
      res.json({ kind: 'school_code', schoolCodeMatches, parentMatches: [] });
      return;
    }

    const parentMatches = portalStore.lookupSchoolsByAdmissionNumber(identifier);
    if (parentMatches.length > 0) {
      res.json({ kind: 'parent', schoolCodeMatches: [], parentMatches });
      return;
    }

    res.json({ kind: 'none', schoolCodeMatches: [], parentMatches: [] });
  });

  // Public Parent Portal Lookup by Exact Pupil Registration Number (rate-limited; NO secrets)
  app.get('/api/public/parent-lookup', (req: Request, res: Response) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`parent_lookup:${ip}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many lookup attempts. Please wait a moment and try again.' });
      return;
    }
    const admissionNumber =
      typeof req.query?.admissionNumber === 'string' ? req.query.admissionNumber.trim() : '';
    if (admissionNumber.length < 2) {
      res.json({ matches: [] });
      return;
    }
    const matches = portalStore.lookupSchoolsByAdmissionNumber(admissionNumber);
    res.json({ matches });
  });

  // Public School Lookup by Exact School Code (rate-limited; NO secrets, NO PII)
  app.get('/api/public/school-code-lookup', (req: Request, res: Response) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`school_code_lookup:${ip}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many lookup attempts. Please wait a moment and try again.' });
      return;
    }
    const code = typeof req.query?.code === 'string' ? req.query.code.trim() : '';
    if (code.length < 2) {
      res.json({ matches: [] });
      return;
    }
    const matches = portalStore.lookupSchoolsByCode(code);
    res.json({ matches });
  });

  // Public School Admin Auth Status (non-PII lockout / initialization indicator)
  app.get('/api/public/school-admin-status', (_req: Request, res: Response) => {
    res.json(portalStore.getPublicSchoolAdminAuthStatus());
  });

  // School Admin Email + Password Sign-In (strict rate limit + 5-attempt lockout + constant-time scrypt)
  app.post('/api/auth/school-admin-login', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`school_admin_login:${ip}`, 10, 5 * 60_000)) {
      res.status(429).json({
        error: 'Too many School Administrator sign-in requests from this network. Please wait 5 minutes and try again.',
      });
      return;
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'School Administrator email and password are required.' });
      return;
    }

    const result = await portalStore.verifySchoolAdminPasswordLogin(email, password, ip);
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
        remainingAttempts: result.remainingAttempts,
      });
      return;
    }

    const firstBucket = portalStore.getBucket(result.defaultSchoolId);
    const session = signPortalToken({
      sessionType: 'school_admin',
      schoolId: result.defaultSchoolId,
      schoolName: firstBucket?.school.name || 'School Admin Portal',
      displayName: 'School Administrator',
      email: result.email,
      role: 'School Administrator',
      assignedClassIds: [],
      assignedSubjectIds: [],
      sessionVersion: result.sessionVersion,
    });

    res.json({ session });
  });

  // School Administrator Email + Password Sign-In
  app.post('/api/auth/email-login', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`email_login:${ip}`, 25, 5 * 60_000)) {
      res.status(429).json({
        error: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.',
      });
      return;
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const schoolAdminEmail = portalStore.getSchoolAdminEmail().toLowerCase();
    if (email === schoolAdminEmail) {
      const result = await portalStore.verifySchoolAdminPasswordLogin(email, password, ip);
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
          remainingAttempts: result.remainingAttempts,
        });
        return;
      }

      const firstBucket = portalStore.getBucket(result.defaultSchoolId);
      const session = signPortalToken({
        sessionType: 'school_admin',
        schoolId: result.defaultSchoolId,
        schoolName: firstBucket?.school.name || 'School Admin Portal',
        displayName: 'School Administrator',
        email: result.email,
        role: 'School Administrator',
        assignedClassIds: [],
        assignedSubjectIds: [],
        sessionVersion: result.sessionVersion,
      });

      res.json({ session });
      return;
    }

    res.status(401).json({ error: 'Incorrect email or password.' });
  });

  // One-time School Admin Password Initialization (ONLY works if no password hash or env var exists)
  app.post('/api/auth/school-admin-bootstrap', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`school_admin_bootstrap:${ip}`, 5, 5 * 60_000)) {
      res.status(429).json({ error: 'Too many setup attempts. Please wait and try again.' });
      return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and new password are required.' });
      return;
    }
    const result = await portalStore.bootstrapSchoolAdminPassword(email, password, ip);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const firstBucket = portalStore.getBucket(result.defaultSchoolId);
    const session = signPortalToken({
      sessionType: 'school_admin',
      schoolId: result.defaultSchoolId,
      schoolName: firstBucket?.school.name || 'School Admin Portal',
      displayName: 'School Administrator',
      email: result.email,
      role: 'School Administrator',
      assignedClassIds: [],
      assignedSubjectIds: [],
      sessionVersion: result.sessionVersion,
    });
    res.json({ session });
  });

  // Record Verified Google School Admin Sign-In & Clear Password Lockout
  app.post('/api/auth/school-admin-google-verify', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin' || actor.authMethod !== 'google') {
      res.status(403).json({ error: 'Verified Google School Administrator session required.' });
      return;
    }
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    await portalStore.recordSchoolAdminGoogleSignIn(actor.email, ip);
    res.json({ ok: true, status: portalStore.getSchoolAdminSecurityStatus() });
  });

  // School Admin Security Settings & Audit Status
  app.get('/api/portal/school-admin/security', requireAnyAuth, (req: AuthRequest, res: Response) => {
    if (req.actor?.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can view security settings.' });
      return;
    }
    res.json({ status: portalStore.getSchoolAdminSecurityStatus() });
  });

  // Update School Admin Login Email and/or Password
  app.patch('/api/portal/school-admin/credentials', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can update these credentials.' });
      return;
    }
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newEmail = typeof req.body?.newEmail === 'string' ? req.body.newEmail.trim() : undefined;
    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : undefined;
    const newRecoveryEmail =
      typeof req.body?.newRecoveryEmail === 'string' ? req.body.newRecoveryEmail.trim() : undefined;
    const newRecoveryPhone =
      typeof req.body?.newRecoveryPhone === 'string' ? req.body.newRecoveryPhone.trim() : undefined;

    const result = await portalStore.updateSchoolAdminCredentials({
      currentPassword,
      verifiedByGoogle: actor.authMethod === 'google',
      newEmail,
      newPassword,
      newRecoveryEmail,
      newRecoveryPhone,
      ipAddress: ip,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    let refreshedSession = undefined;
    if (actor.authMethod === 'password') {
      const firstBucket = portalStore.getBucket(result.defaultSchoolId);
      refreshedSession = signPortalToken({
        sessionType: 'school_admin',
        schoolId: result.defaultSchoolId,
        schoolName: firstBucket?.school.name || 'School Admin Portal',
        displayName: 'School Administrator',
        email: result.status.email,
        role: 'School Administrator',
        assignedClassIds: [],
        assignedSubjectIds: [],
        sessionVersion: result.sessionVersion,
      });
    }

    res.json({ status: result.status, session: refreshedSession });
  });

  // Revoke All Other School Admin Password Sessions
  app.post('/api/portal/school-admin/revoke-sessions', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can revoke sessions.' });
      return;
    }
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const result = await portalStore.revokeSchoolAdminSessions(ip);
    let refreshedSession = undefined;
    if (actor.authMethod === 'password') {
      const firstBucket = portalStore.getBucket(result.defaultSchoolId);
      refreshedSession = signPortalToken({
        sessionType: 'school_admin',
        schoolId: result.defaultSchoolId,
        schoolName: firstBucket?.school.name || 'School Admin Portal',
        displayName: 'School Administrator',
        email: result.status.email,
        role: 'School Administrator',
        assignedClassIds: [],
        assignedSubjectIds: [],
        sessionVersion: result.sessionVersion,
      });
    }
    res.json({ status: result.status, session: refreshedSession });
  });

  // Public Password Recovery Step 1: Request 6-digit Verification Code via Email or Phone Number
  app.post('/api/auth/password-recovery/request', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`pwd_recovery_req_ip:${ip}`, 10, 15 * 60_000)) {
      res.status(429).json({
        error: 'Too many password recovery requests from this network. Please wait 15 minutes and try again.',
      });
      return;
    }

    const contact = typeof req.body?.contact === 'string' ? req.body.contact.trim() : '';
    if (!contact) {
      res.status(400).json({ error: 'Please enter your registered email address or phone number.' });
      return;
    }

    const contactBucketKey = contact.toLowerCase().replace(/\s+/g, '');
    if (isRateLimited(`pwd_recovery_req_contact:${contactBucketKey}`, 5, 15 * 60_000)) {
      res.status(429).json({
        error: 'Too many recovery codes requested for this contact. Please wait 15 minutes and try again.',
      });
      return;
    }

    const hasEmailGateway =
      Boolean((process.env.RESEND_API_KEY || '').trim()) &&
      Boolean((process.env.RECOVERY_FROM_EMAIL || '').trim());
    const hasWebhookGateway = Boolean((process.env.RECOVERY_WEBHOOK_URL || '').trim());
    const initialMode: 'email' | 'webhook' | 'admin_relay' =
      contact.includes('@') && hasEmailGateway
        ? 'email'
        : hasWebhookGateway
        ? 'webhook'
        : 'admin_relay';

    const created = await portalStore.createPasswordRecoveryChallenge({
      contact,
      deliveryMode: initialMode,
    });

    if (!created.ok) {
      res.status(created.status).json({ error: created.error });
      return;
    }

    const actualMode = await dispatchRecoveryVerificationCode({
      channel: created.challenge.contactType,
      recipient: contact,
      otp: created.otp,
      accountLabels: created.publicAccounts.map((a) => a.displayLabel),
      schoolName: portalStore.getPublicPortalInfo().schoolName,
    });

    if (actualMode !== created.challenge.deliveryMode) {
      await portalStore.updateRecoveryChallengeDeliveryMode(created.challenge.id, actualMode);
    }

    const deliveryMessage =
      actualMode === 'email'
        ? `A 6-digit verification code has been sent to ${created.challenge.contactMasked}. It expires in 15 minutes.`
        : actualMode === 'webhook'
        ? `A 6-digit verification code has been dispatched to ${created.challenge.contactMasked}. It expires in 15 minutes.`
        : created.publicAccounts.some((a) => a.accountKind === 'school_admin')
        ? `Verification challenge created for ${created.challenge.contactMasked}. Contact your School Administrator recovery console (or configure email delivery in Secrets) for the 6-digit code.`
        : `Verification code generated for ${created.challenge.contactMasked}. Request the 6-digit code from your School Administrator (visible under Teachers & Access -> Active Password Recovery Requests), then enter it below within 15 minutes.`;

    res.json({
      challengeId: created.challenge.id,
      channel: created.challenge.contactType,
      contactMasked: created.challenge.contactMasked,
      deliveryMode: actualMode,
      expiresInMinutes: 15,
      accounts: created.publicAccounts,
      message: deliveryMessage,
    });
  });

  // Public Password Recovery Step 2: Verify 6-digit Code & Reset Password
  app.post('/api/auth/password-recovery/verify-reset', async (req: Request, res: Response) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    if (isRateLimited(`pwd_recovery_verify_ip:${ip}`, 15, 15 * 60_000)) {
      res.status(429).json({
        error: 'Too many password reset verification attempts. Please wait 15 minutes and try again.',
      });
      return;
    }

    const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId.trim() : '';
    const accountKey = typeof req.body?.accountKey === 'string' ? req.body.accountKey.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    const result = await portalStore.completePasswordRecovery({
      challengeId,
      accountKey,
      code,
      newPassword,
      ipAddress: ip,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      ok: true,
      accountLabel: result.accountLabel,
      loginHint: result.loginHint,
      message: `Password updated for ${result.accountLabel}. You can now sign in with your new password.`,
    });
  });

  // Authenticated School Admin Recovery Queue
  app.get(
    '/api/portal/schools/:schoolId/password-recovery-requests',
    requireAnyAuth,
    (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can view active recovery requests.',
        });
        return;
      }
      const includeSchoolAdmin = req.query?.includeGlobal === '1';
      const requests = portalStore.listActiveRecoveryChallenges({
        schoolId,
        includeSchoolAdmin,
      });
      res.json({ requests });
    }
  );

  app.post(
    '/api/portal/schools/:schoolId/password-recovery-requests/:challengeId/revoke',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, challengeId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can cancel recovery requests.',
        });
        return;
      }
      const revoked = await portalStore.revokeRecoveryChallenge(challengeId, {
        isSchoolAdmin: true,
        schoolId,
      });
      if (!revoked) {
        res.status(404).json({ error: 'Active recovery request was not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // Password Login for Class Teacher, JHS Subject Teacher, and Parent
  app.post('/api/auth/school-login', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`school_login:${ip}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait a moment and try again.' });
      return;
    }
    const body = req.body ?? {};
    const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
    const loginType = typeof body.loginType === 'string' ? body.loginType.trim() : '';

    if (!schoolId || !loginType) {
      res.status(400).json({ error: 'Please select a school and sign-in mode.' });
      return;
    }

    const bucket = portalStore.getBucket(schoolId);
    if (!bucket || !bucket.school.isActive) {
      res.status(404).json({ error: 'Selected school was not found or is inactive.' });
      return;
    }

    if (bucket.school.isLocked) {
      const lockNotice = getEffectiveLockNotice(bucket.school);
      res.status(423).json({
        error: lockNotice,
        schoolLocked: true,
        lockNotice,
      });
      return;
    }


    if (loginType === 'class_teacher') {
      const requestedClassId = typeof body.classId === 'string' ? body.classId.trim() : '';
      const teacherId = typeof body.teacherId === 'string' ? body.teacherId.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!password.trim()) {
        res.status(400).json({ error: 'Please enter your class teacher password.' });
        return;
      }

      const divs = getSchoolDivisions(bucket.school);
      if (!divs.hasKg && !divs.hasPrimary) {
        res.status(403).json({
          error: 'This school does not operate Kindergarten or Primary divisions.',
        });
        return;
      }

      let cls = requestedClassId ? bucket.classes[requestedClassId] : undefined;

      if (requestedClassId) {
        if (!cls || cls.levelCategory === 'JHS') {
          res.status(400).json({ error: 'Please select a valid Kindergarten or Primary class.' });
          return;
        }
        if (!isLevelCategoryEnabled(cls.levelCategory, bucket.school)) {
          res.status(403).json({ error: `${cls.name} belongs to a division that is not enabled for this school.` });
          return;
        }
        const classHash = bucket.credentials.classPasswordHashes[requestedClassId];
        if (!classHash) {
          res.status(403).json({
            error: `No password has been generated for ${cls.name} yet. Ask your School Administrator.`,
          });
          return;
        }
        if (!verifyPassword(password, classHash)) {
          res.status(401).json({ error: `Incorrect password for ${cls.name}.` });
          return;
        }
      } else {
        const enabledKgPrimaryClasses = Object.values(bucket.classes)
          .filter((c) => c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const hasAnyClassPassword = enabledKgPrimaryClasses.some((c) =>
          Boolean(bucket.credentials.classPasswordHashes[c.id])
        );
        if (!hasAnyClassPassword) {
          res.status(403).json({
            error: 'No KG/Primary class passwords have been generated for this school yet. Ask your School Administrator.',
          });
          return;
        }

        cls = enabledKgPrimaryClasses.find((c) => {
          const hash = bucket.credentials.classPasswordHashes[c.id];
          return Boolean(hash && verifyPassword(password, hash));
        });

        if (!cls) {
          res.status(401).json({
            error: 'Incorrect KG/Primary class password for this school. Please check with your School Admin.',
          });
          return;
        }
      }

      const classId = cls.id;
      const explicitTeacher = teacherId ? bucket.teachers[teacherId] : undefined;
      const matchedTeacher =
        explicitTeacher && explicitTeacher.isActive && explicitTeacher.assignedClassIds.includes(classId)
          ? explicitTeacher
          : Object.values(bucket.teachers).find(
              (t) => t.isActive && t.teacherType === 'CLASS' && t.assignedClassIds.includes(classId)
            );

      const displayName = matchedTeacher?.fullName || cls.classTeacherName || `${cls.name} Teacher`;
      const assignedClassIds =
        matchedTeacher && matchedTeacher.assignedClassIds.length > 0
          ? Array.from(new Set([classId, ...matchedTeacher.assignedClassIds]))
          : [classId];

      const session = signPortalToken({
        sessionType: 'class_teacher',
        schoolId,
        schoolName: bucket.school.name,
        displayName,
        role: 'Class Teacher',
        teacherId: matchedTeacher?.id,
        assignedClassIds,
        assignedSubjectIds: [],
      });

      await portalStore.appendAuditLog(schoolId, {
        actorUid: matchedTeacher?.id || `class_${classId}`,
        actorName: displayName,
        actorEmail: matchedTeacher?.email || '',
        actorRole: 'Class Teacher',
        action: 'CLASS_TEACHER_SIGN_IN',
        targetCollection: 'classes',
        targetId: classId,
        summary: `${displayName} signed in to ${cls.name} portal`,
        createdAt: new Date().toISOString(),
      });

      res.json({ session });
      return;
    }

    if (loginType === 'jhs_teacher') {
      const teacherPassword =
        typeof body.teacherPassword === 'string'
          ? body.teacherPassword
          : typeof body.password === 'string'
          ? body.password
          : '';

      if (!getSchoolDivisions(bucket.school).hasJhs) {
        res.status(403).json({
          error: 'Junior High School (JHS 1 – JHS 3) is not enabled for this school.',
        });
        return;
      }

      if (!teacherPassword.trim()) {
        res.status(400).json({ error: 'Please enter your JHS teacher password.' });
        return;
      }

      const activeJhsTeachers = Object.values(bucket.teachers).filter(
        (t) => t.isActive && t.teacherType === 'JHS'
      );

      if (activeJhsTeachers.length === 0) {
        res.status(403).json({
          error: 'No active JHS teachers have been registered for this school yet. Ask your School Admin.',
        });
        return;
      }

      const teacherHashes = bucket.credentials.jhsTeacherPasswordHashes || {};
      const matchedTeacher = activeJhsTeachers.find((t) => {
        const hash = teacherHashes[t.id];
        return Boolean(hash && verifyPassword(teacherPassword, hash));
      });

      if (!matchedTeacher) {
        res.status(401).json({
          error: 'Incorrect JHS teacher password. Please check with your School Admin.',
        });
        return;
      }

      const jhsClassIds = Object.values(bucket.classes)
        .filter((c) => c.levelCategory === 'JHS')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.id);
      const jhsClassSet = new Set(jhsClassIds);

      const validTeacherAssignments = (matchedTeacher.jhsAssignments || []).filter(
        (a) =>
          jhsClassSet.has(a.classId) &&
          Boolean(bucket.subjects[a.subjectId]) &&
          bucket.subjects[a.subjectId].applicableLevels.includes('JHS')
      );

      const allAssignedSubjectIds = Array.from(
        new Set(
          [
            ...(matchedTeacher.assignedSubjectIds || []),
            ...validTeacherAssignments.map((a) => a.subjectId),
          ].filter(
            (sid) =>
              Boolean(bucket.subjects[sid]) && bucket.subjects[sid].applicableLevels.includes('JHS')
          )
        )
      );

      if (allAssignedSubjectIds.length === 0) {
        res.status(403).json({
          error:
            'You have not been assigned any JHS subjects yet. Ask your School Admin to assign your subjects.',
        });
        return;
      }

      const teacherAssignedClassIdSet = new Set<string>([
        ...validTeacherAssignments.map((a) => a.classId),
        ...(matchedTeacher.assignedClassIds || []).filter((cid) => jhsClassSet.has(cid)),
      ]);

      const assignedClassIds =
        teacherAssignedClassIdSet.size > 0
          ? jhsClassIds.filter((cid) => teacherAssignedClassIdSet.has(cid))
          : jhsClassIds;

      const normalizedJhsAssignments =
        validTeacherAssignments.length > 0 ? validTeacherAssignments : undefined;

      const assignedSubjectNames = allAssignedSubjectIds
        .map((sid) => bucket.subjects[sid]?.name || sid)
        .join(', ');

      const displayName = matchedTeacher.fullName;
      const session = signPortalToken({
        sessionType: 'jhs_teacher',
        schoolId,
        schoolName: bucket.school.name,
        displayName,
        role: 'Subject Teacher',
        teacherId: matchedTeacher.id,
        assignedClassIds,
        assignedSubjectIds: allAssignedSubjectIds,
        jhsAssignments: normalizedJhsAssignments,
      });

      await portalStore.appendAuditLog(schoolId, {
        actorUid: matchedTeacher.id,
        actorName: displayName,
        actorEmail: matchedTeacher.email || '',
        actorRole: 'Subject Teacher',
        action: 'JHS_TEACHER_SIGN_IN',
        targetCollection: 'teachers',
        targetId: matchedTeacher.id,
        summary: `${displayName} signed in to JHS portal (${allAssignedSubjectIds.length} subject${allAssignedSubjectIds.length === 1 ? '' : 's'}: ${assignedSubjectNames})`,
        createdAt: new Date().toISOString(),
      });

      res.json({ session });
      return;
    }

    if (loginType === 'parent') {
      const admissionNumber =
        typeof body.admissionNumber === 'string' ? body.admissionNumber.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!admissionNumber || !password.trim()) {
        res.status(400).json({ error: 'Pupil registration code and Parent Portal password are required.' });
        return;
      }
      const matchedPupil = portalStore.findPupilByAdmissionNumber(schoolId, admissionNumber);
      if (!matchedPupil) {
        res.status(404).json({ error: 'No pupil matched that registration number in this school.' });
        return;
      }
      const parentHash = bucket.credentials.parentPasswordHashes?.[matchedPupil.id];
      if (!parentHash) {
        res.status(403).json({
          error: `No Parent Portal password has been assigned to ${matchedPupil.admissionNumber} yet.`,
        });
        return;
      }
      if (!verifyPassword(password, parentHash)) {
        res.status(401).json({ error: 'Incorrect Parent Portal password.' });
        return;
      }

      const displayName = (matchedPupil.guardianName || '').trim() || `${matchedPupil.fullName} (Parent)`;
      const session = signPortalToken({
        sessionType: 'parent',
        schoolId,
        schoolName: bucket.school.name,
        displayName,
        role: 'Parent',
        pupilId: matchedPupil.id,
        admissionNumber: matchedPupil.admissionNumber,
        assignedClassIds: matchedPupil.currentClassId ? [matchedPupil.currentClassId] : [],
        assignedSubjectIds: [],
      });

      await portalStore.appendAuditLog(schoolId, {
        actorUid: `parent_${matchedPupil.id}`,
        actorName: displayName,
        actorEmail: '',
        actorRole: 'Parent',
        action: 'PARENT_SIGN_IN',
        targetCollection: 'pupils',
        targetId: matchedPupil.id,
        summary: `Parent ${displayName} signed in for pupil ${matchedPupil.fullName} (${matchedPupil.admissionNumber})`,
        createdAt: new Date().toISOString(),
      });

      res.json({ session });
      return;
    }

    res.status(400).json({ error: 'Unsupported sign-in mode.' });
  });

  // Unified Sign-In for School Admin, KG/Primary Class Teachers & JHS Subject Teachers (by School Code + Password)
  app.post('/api/auth/unified-login', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`unified_login:${ip}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait a moment and try again.' });
      return;
    }

    const body = req.body ?? {};
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const schoolIdInput = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const credentialKind =
      body.credentialKind === 'parent' || body.credentialKind === 'school_code'
        ? body.credentialKind
        : undefined;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Credential identifier and password are required.' });
      return;
    }

    let resolvedSchoolId = schoolIdInput;
    if (!resolvedSchoolId) {
      const codeMatches = portalStore.lookupSchoolsByCode(identifier);
      if (codeMatches.length > 0) {
        resolvedSchoolId = codeMatches[0].schoolId;
      } else {
        const parentMatches = portalStore.lookupSchoolsByAdmissionNumber(identifier);
        if (parentMatches.length > 0) {
          resolvedSchoolId = parentMatches[0].schoolId;
        }
      }
    }

    if (!resolvedSchoolId) {
      res.status(404).json({
        error: 'No school, staff ID, or pupil registration number matched that credential.',
      });
      return;
    }

    const bucket = portalStore.getBucket(resolvedSchoolId);
    if (!bucket || !bucket.school.isActive) {
      res.status(404).json({ error: 'Selected school was not found or is inactive.' });
      return;
    }

    if (bucket.school.isLocked) {
      const lockNotice = getEffectiveLockNotice(bucket.school);
      res.status(423).json({
        error: lockNotice,
        schoolLocked: true,
        lockNotice,
      });
      return;
    }

    // 1. Parent Portal sign-in (by Pupil Registration Code + Parent Password)
    const matchedPupil = portalStore.findPupilByAdmissionNumber(resolvedSchoolId, identifier);
    if (credentialKind === 'parent' || (credentialKind !== 'school_code' && matchedPupil)) {
      if (!matchedPupil) {
        res.status(404).json({
          error: 'No pupil matched that registration code in the selected school.',
        });
        return;
      }
      const parentHash = bucket.credentials.parentPasswordHashes?.[matchedPupil.id];
      if (!parentHash) {
        res.status(403).json({
          error: `No Parent Portal password has been assigned to ${matchedPupil.admissionNumber} yet. Ask your school or teacher to generate one.`,
        });
        return;
      }
      if (!verifyPassword(password, parentHash)) {
        res.status(401).json({
          error: `Incorrect Parent Portal password for ${matchedPupil.fullName}.`,
        });
        return;
      }

      const displayName =
        (matchedPupil.guardianName || '').trim() || `${matchedPupil.fullName} (Parent)`;
      const session = signPortalToken({
        sessionType: 'parent',
        schoolId: resolvedSchoolId,
        schoolName: bucket.school.name,
        displayName,
        role: 'Parent',
        pupilId: matchedPupil.id,
        admissionNumber: matchedPupil.admissionNumber,
        assignedClassIds: matchedPupil.currentClassId ? [matchedPupil.currentClassId] : [],
        assignedSubjectIds: [],
      });

      await portalStore.appendAuditLog(resolvedSchoolId, {
        actorUid: `parent_${matchedPupil.id}`,
        actorName: displayName,
        actorEmail: '',
        actorRole: 'Parent',
        action: 'PARENT_SIGN_IN',
        targetCollection: 'pupils',
        targetId: matchedPupil.id,
        summary: `Parent ${displayName} signed in for pupil ${matchedPupil.fullName} (${matchedPupil.admissionNumber})`,
        createdAt: new Date().toISOString(),
      });

      res.json({ session });
      return;
    }

    // 2. School Teacher sign-in by Registered Staff ID (or Teacher Code) + Password
    const divs = getSchoolDivisions(bucket.school);
    const matchedTeacherByCode = portalStore.findTeacherByCode(identifier, resolvedSchoolId);
    if (matchedTeacherByCode && matchedTeacherByCode.bucket.school.id === resolvedSchoolId) {
      const targetTeacher = matchedTeacherByCode.teacher;

      if (targetTeacher.teacherType === 'CLASS') {
        if (!divs.hasKg && !divs.hasPrimary) {
          res.status(403).json({
            error: 'Kindergarten and Primary divisions are not enabled for this school.',
          });
          return;
        }
        const assignedClasses = (targetTeacher.assignedClassIds || [])
          .map((cid) => bucket.classes[cid])
          .filter(
            (c): c is NonNullable<typeof c> =>
              Boolean(c) && c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs)
          );
        if (assignedClasses.length === 0) {
          res.status(403).json({
            error: `${targetTeacher.fullName} has no active KG/Primary class assigned yet. Ask your School Admin.`,
          });
          return;
        }
        const hasAnyPassword = assignedClasses.some((c) =>
          Boolean(bucket.credentials.classPasswordHashes[c.id])
        );
        if (!hasAnyPassword) {
          res.status(403).json({
            error: `No class password has been generated for ${targetTeacher.fullName}'s assigned class(es) yet. Ask your School Admin.`,
          });
          return;
        }
        const matchedClass = assignedClasses.find((c) => {
          const hash = bucket.credentials.classPasswordHashes[c.id];
          return Boolean(hash && verifyPassword(password, hash));
        });
        if (!matchedClass) {
          res.status(401).json({
            error: `Incorrect password for ${targetTeacher.fullName}. Please check your assigned class password with your School Admin.`,
          });
          return;
        }

        const assignedClassIds = assignedClasses.map((c) => c.id);
        const session = signPortalToken({
          sessionType: 'class_teacher',
          schoolId: resolvedSchoolId,
          schoolName: bucket.school.name,
          displayName: targetTeacher.fullName,
          role: 'Class Teacher',
          teacherId: targetTeacher.id,
          assignedClassIds,
          assignedSubjectIds: [],
        });

        await portalStore.appendAuditLog(resolvedSchoolId, {
          actorUid: targetTeacher.id,
          actorName: targetTeacher.fullName,
          actorEmail: targetTeacher.email || '',
          actorRole: 'Class Teacher',
          action: 'CLASS_TEACHER_SIGN_IN',
          targetCollection: 'teachers',
          targetId: targetTeacher.id,
          summary: `${targetTeacher.fullName} (${targetTeacher.staffId || targetTeacher.teacherCode}) signed in to ${matchedClass.name} portal`,
          createdAt: new Date().toISOString(),
        });

        res.json({ session });
        return;
      }

      // JHS Subject Teacher signing in via their auto-generated Teacher Code
      if (!divs.hasJhs) {
        res.status(403).json({
          error: 'Junior High School (JHS 1 – JHS 3) is not enabled for this school.',
        });
        return;
      }
      const teacherHash = bucket.credentials.jhsTeacherPasswordHashes?.[targetTeacher.id];
      if (!teacherHash) {
        res.status(403).json({
          error: `No JHS teacher password has been set for ${targetTeacher.fullName} yet. Ask your School Admin.`,
        });
        return;
      }
      if (!verifyPassword(password, teacherHash)) {
        res.status(401).json({
          error: `Incorrect password for ${targetTeacher.fullName}. Please check your JHS teacher password with your School Admin.`,
        });
        return;
      }

      const jhsClassIds = Object.values(bucket.classes)
        .filter((c) => c.levelCategory === 'JHS')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.id);
      const jhsClassSet = new Set(jhsClassIds);

      const validTeacherAssignments = (targetTeacher.jhsAssignments || []).filter(
        (a) =>
          jhsClassSet.has(a.classId) &&
          Boolean(bucket.subjects[a.subjectId]) &&
          bucket.subjects[a.subjectId].applicableLevels.includes('JHS')
      );

      const allAssignedSubjectIds = Array.from(
        new Set(
          [
            ...(targetTeacher.assignedSubjectIds || []),
            ...validTeacherAssignments.map((a) => a.subjectId),
          ].filter(
            (sid) =>
              Boolean(bucket.subjects[sid]) &&
              bucket.subjects[sid].applicableLevels.includes('JHS')
          )
        )
      );

      if (allAssignedSubjectIds.length === 0) {
        res.status(403).json({
          error:
            'You have not been assigned any JHS subjects yet. Ask your School Admin to assign your subjects.',
        });
        return;
      }

      const teacherAssignedClassIdSet = new Set<string>([
        ...validTeacherAssignments.map((a) => a.classId),
        ...(targetTeacher.assignedClassIds || []).filter((cid) => jhsClassSet.has(cid)),
      ]);
      const assignedClassIds =
        teacherAssignedClassIdSet.size > 0
          ? jhsClassIds.filter((cid) => teacherAssignedClassIdSet.has(cid))
          : jhsClassIds;

      const assignedSubjectNames = allAssignedSubjectIds
        .map((sid) => bucket.subjects[sid]?.name || sid)
        .join(', ');

      const session = signPortalToken({
        sessionType: 'jhs_teacher',
        schoolId: resolvedSchoolId,
        schoolName: bucket.school.name,
        displayName: targetTeacher.fullName,
        role: 'Subject Teacher',
        teacherId: targetTeacher.id,
        assignedClassIds,
        assignedSubjectIds: allAssignedSubjectIds,
        jhsAssignments: validTeacherAssignments.length > 0 ? validTeacherAssignments : undefined,
      });

      await portalStore.appendAuditLog(resolvedSchoolId, {
        actorUid: targetTeacher.id,
        actorName: targetTeacher.fullName,
        actorEmail: targetTeacher.email || '',
        actorRole: 'Subject Teacher',
        action: 'JHS_TEACHER_SIGN_IN',
        targetCollection: 'teachers',
        targetId: targetTeacher.id,
        summary: `${targetTeacher.fullName} (${targetTeacher.staffId || targetTeacher.teacherCode}) signed in to JHS portal (${allAssignedSubjectIds.length} subject${allAssignedSubjectIds.length === 1 ? '' : 's'}: ${assignedSubjectNames})`,
        createdAt: new Date().toISOString(),
      });

      res.json({ session });
      return;
    }

    // 3. School Code flow: match against KG/Primary Class Teacher -> JHS Subject Teacher
    // 3a. KG / Primary Class Teacher
    if (divs.hasKg || divs.hasPrimary) {
      const enabledKgPrimaryClasses = Object.values(bucket.classes)
        .filter((c) => c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const matchedClass = enabledKgPrimaryClasses.find((c) => {
        const hash = bucket.credentials.classPasswordHashes[c.id];
        return Boolean(hash && verifyPassword(password, hash));
      });

      if (matchedClass) {
        const classId = matchedClass.id;
        const matchedTeacher = Object.values(bucket.teachers).find(
          (t) => t.isActive && t.teacherType === 'CLASS' && t.assignedClassIds.includes(classId)
        );
        const displayName =
          matchedTeacher?.fullName || matchedClass.classTeacherName || `${matchedClass.name} Teacher`;
        const assignedClassIds =
          matchedTeacher && matchedTeacher.assignedClassIds.length > 0
            ? Array.from(new Set([classId, ...matchedTeacher.assignedClassIds]))
            : [classId];

        const session = signPortalToken({
          sessionType: 'class_teacher',
          schoolId: resolvedSchoolId,
          schoolName: bucket.school.name,
          displayName,
          role: 'Class Teacher',
          teacherId: matchedTeacher?.id,
          assignedClassIds,
          assignedSubjectIds: [],
        });

        await portalStore.appendAuditLog(resolvedSchoolId, {
          actorUid: matchedTeacher?.id || `class_${classId}`,
          actorName: displayName,
          actorEmail: matchedTeacher?.email || '',
          actorRole: 'Class Teacher',
          action: 'CLASS_TEACHER_SIGN_IN',
          targetCollection: 'classes',
          targetId: classId,
          summary: `${displayName} signed in to ${matchedClass.name} portal`,
          createdAt: new Date().toISOString(),
        });

        res.json({ session });
        return;
      }
    }

    // 2c. JHS Subject Teacher (personal JHS teacher password)
    if (divs.hasJhs) {
      const activeJhsTeachers = Object.values(bucket.teachers).filter(
        (t) => t.isActive && t.teacherType === 'JHS'
      );
      const teacherHashes = bucket.credentials.jhsTeacherPasswordHashes || {};
      const matchedJhsTeacher = activeJhsTeachers.find((t) => {
        const hash = teacherHashes[t.id];
        return Boolean(hash && verifyPassword(password, hash));
      });

      if (matchedJhsTeacher) {
        const jhsClassIds = Object.values(bucket.classes)
          .filter((c) => c.levelCategory === 'JHS')
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.id);
        const jhsClassSet = new Set(jhsClassIds);

        const validTeacherAssignments = (matchedJhsTeacher.jhsAssignments || []).filter(
          (a) =>
            jhsClassSet.has(a.classId) &&
            Boolean(bucket.subjects[a.subjectId]) &&
            bucket.subjects[a.subjectId].applicableLevels.includes('JHS')
        );

        const allAssignedSubjectIds = Array.from(
          new Set(
            [
              ...(matchedJhsTeacher.assignedSubjectIds || []),
              ...validTeacherAssignments.map((a) => a.subjectId),
            ].filter(
              (sid) =>
                Boolean(bucket.subjects[sid]) &&
                bucket.subjects[sid].applicableLevels.includes('JHS')
            )
          )
        );

        if (allAssignedSubjectIds.length === 0) {
          res.status(403).json({
            error:
              'You have not been assigned any JHS subjects yet. Ask your School Admin to assign your subjects.',
          });
          return;
        }

        const teacherAssignedClassIdSet = new Set<string>([
          ...validTeacherAssignments.map((a) => a.classId),
          ...(matchedJhsTeacher.assignedClassIds || []).filter((cid) => jhsClassSet.has(cid)),
        ]);

        const assignedClassIds =
          teacherAssignedClassIdSet.size > 0
            ? jhsClassIds.filter((cid) => teacherAssignedClassIdSet.has(cid))
            : jhsClassIds;

        const normalizedJhsAssignments =
          validTeacherAssignments.length > 0 ? validTeacherAssignments : undefined;

        const assignedSubjectNames = allAssignedSubjectIds
          .map((sid) => bucket.subjects[sid]?.name || sid)
          .join(', ');

        const displayName = matchedJhsTeacher.fullName;
        const session = signPortalToken({
          sessionType: 'jhs_teacher',
          schoolId: resolvedSchoolId,
          schoolName: bucket.school.name,
          displayName,
          role: 'Subject Teacher',
          teacherId: matchedJhsTeacher.id,
          assignedClassIds,
          assignedSubjectIds: allAssignedSubjectIds,
          jhsAssignments: normalizedJhsAssignments,
        });

        await portalStore.appendAuditLog(resolvedSchoolId, {
          actorUid: matchedJhsTeacher.id,
          actorName: displayName,
          actorEmail: matchedJhsTeacher.email || '',
          actorRole: 'Subject Teacher',
          action: 'JHS_TEACHER_SIGN_IN',
          targetCollection: 'teachers',
          targetId: matchedJhsTeacher.id,
          summary: `${displayName} signed in to JHS portal (${allAssignedSubjectIds.length} subject${allAssignedSubjectIds.length === 1 ? '' : 's'}: ${assignedSubjectNames})`,
          createdAt: new Date().toISOString(),
        });

        res.json({ session });
        return;
      }
    }

    res.status(401).json({
      error: `Incorrect password for ${bucket.school.name}. Please verify your Class or JHS Teacher password and try again.`,
    });
  });

  // Get registered single school
  app.get('/api/portal/schools', requireAnyAuth, (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const allSchools = portalStore.listSchools();
    const visible =
      actor.kind === 'school_admin'
        ? allSchools
        : allSchools.filter((s) => 'schoolId' in actor && s.id === actor.schoolId);

    const enriched = visible.map((s) => {
      if (actor.kind === 'parent') {
        return {
          ...s,
          stats: { classes: 0, teachers: 0, pupils: 1, reports: 0 },
        };
      }
      const snap = portalStore.getSchoolSnapshot(s.id, { kind: actor.kind });
      return {
        ...s,
        stats: {
          classes: snap?.classes.length || 0,
          teachers: snap?.teachers.length || 0,
          pupils: snap?.pupils.filter((p) => p.enrollmentStatus === 'Active').length || 0,
          reports: snap?.reportCards.length || 0,
        },
      };
    });

    res.json({ schools: enriched });
  });

  // Single-school constraint: prevent creating additional schools
  app.post('/api/portal/schools', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can manage school registration.' });
      return;
    }
    res.status(409).json({ error: 'Only one school can be registered in this system.' });
  });

  // School Admin: Edit registered school details
  app.patch('/api/portal/schools/:schoolId', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can edit school registration details.' });
      return;
    }

    const { schoolId } = req.params;
    const body = req.body ?? {};

    const existingBucket = portalStore.getBucket(schoolId);
    if (!existingBucket) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    const nextHasKg = typeof body.hasKg === 'boolean' ? body.hasKg : (existingBucket.school.hasKg ?? true);
    const nextHasPrimary =
      typeof body.hasPrimary === 'boolean' ? body.hasPrimary : (existingBucket.school.hasPrimary ?? true);
    const nextHasJhs = typeof body.hasJhs === 'boolean' ? body.hasJhs : (existingBucket.school.hasJhs ?? true);
    if (!nextHasKg && !nextHasPrimary && !nextHasJhs) {
      res.status(400).json({
        error: 'At least one school level (KG 1–2, Primary 1–6, or JHS 1–3) must remain enabled.',
      });
      return;
    }

    const updated = await portalStore.updateSchool(
      schoolId,
      {
        name: typeof body.name === 'string' ? body.name : undefined,
        code: typeof body.code === 'string' ? body.code : undefined,
        motto: typeof body.motto === 'string' ? body.motto : undefined,
        address: typeof body.address === 'string' ? body.address : undefined,
        telephone: typeof body.telephone === 'string' ? body.telephone : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : undefined,
        primaryColor: typeof body.primaryColor === 'string' ? body.primaryColor : undefined,
        accentColor: typeof body.accentColor === 'string' ? body.accentColor : undefined,
        headteacherName: typeof body.headteacherName === 'string' ? body.headteacherName : undefined,
        academicCoordinatorName:
          typeof body.academicCoordinatorName === 'string' ? body.academicCoordinatorName : undefined,
        hasKg: typeof body.hasKg === 'boolean' ? body.hasKg : undefined,
        hasPrimary: typeof body.hasPrimary === 'boolean' ? body.hasPrimary : undefined,
        hasJhs: typeof body.hasJhs === 'boolean' ? body.hasJhs : undefined,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
        isLocked: typeof body.isLocked === 'boolean' ? body.isLocked : undefined,
        lockNotice: typeof body.lockNotice === 'string' ? body.lockNotice : undefined,
      },
      { uid: actor.uid, name: actor.displayName, role: actor.role }
    );

    if (!updated) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    res.json({ school: updated });
  });

  // School Admin: Upload school logo
  app.post('/api/portal/upload-school-logo', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    if (actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can upload registration school logos.' });
      return;
    }

    const result = await saveValidatedImageUpload(req.body?.dataUrl, 'logo');
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ url: result.url });
  });

  // School Admin: Lock or Unlock the School Portal & Customize Lock Notice
  app.patch(
    '/api/portal/schools/:schoolId/lock',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      if (actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can lock or unlock the school portal.' });
        return;
      }
      const { schoolId } = req.params;
      const body = req.body ?? {};
      if (typeof body.isLocked !== 'boolean') {
        res.status(400).json({ error: 'isLocked boolean is required.' });
        return;
      }
      const lockNotice = typeof body.lockNotice === 'string' ? body.lockNotice : undefined;
      const updated = await portalStore.setSchoolLockStatus(
        schoolId,
        body.isLocked,
        lockNotice,
        { uid: actor.uid, name: actor.displayName, role: actor.role }
      );
      if (!updated) {
        res.status(404).json({ error: 'School not found.' });
        return;
      }
      res.json({ school: updated });
    }
  );

  // Full School Snapshot (scoped by schoolId and caller permissions)
  app.get('/api/portal/schools/:schoolId/snapshot', requireAnyAuth, (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    if (!ensureSchoolAccess(actor, schoolId)) {
      res.status(403).json({ error: 'You do not have access to this school.' });
      return;
    }
    const snap = portalStore.getSchoolSnapshot(schoolId, {
      kind: actor.kind,
      teacherId:
        actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher'
          ? actor.teacherId
          : undefined,
      pupilId: actor.kind === 'parent' ? actor.pupilId : undefined,
      assignedClassIds:
        actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher'
          ? actor.assignedClassIds
          : undefined,
    });
    if (!snap) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    res.json(snap);
  });

  // Teachers CRUD (School Admin)
  app.post('/api/portal/schools/:schoolId/teachers', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can manage teachers.' });
      return;
    }
    const body = req.body ?? {};
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const teacherType = body.teacherType === 'JHS' ? 'JHS' : 'CLASS';
    if (!fullName) {
      res.status(400).json({ error: 'Teacher full name is required.' });
      return;
    }

    const bucket = portalStore.getBucket(schoolId);
    if (!bucket) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    const divs = getSchoolDivisions(bucket.school);
    if (teacherType === 'JHS' && !divs.hasJhs) {
      res.status(403).json({ error: 'Junior High School (JHS 1 – JHS 3) is not enabled for this school.' });
      return;
    }
    if (teacherType === 'CLASS' && !divs.hasKg && !divs.hasPrimary) {
      res.status(403).json({ error: 'Kindergarten and Primary divisions are not enabled for this school.' });
      return;
    }

    const rawAssignedClassIds: string[] = Array.isArray(body.assignedClassIds) ? body.assignedClassIds : [];
    const rawJhsAssignments: JhsAssignment[] = Array.isArray(body.jhsAssignments) ? body.jhsAssignments : [];
    for (const cid of rawAssignedClassIds) {
      const cls = bucket.classes[cid];
      if (cls && !isLevelCategoryEnabled(cls.levelCategory, divs)) {
        res.status(403).json({ error: `Class ${cls.name} belongs to a disabled school division.` });
        return;
      }
    }
    for (const assignment of rawJhsAssignments) {
      const cls = bucket.classes[assignment.classId];
      if (cls && !isLevelCategoryEnabled(cls.levelCategory, divs)) {
        res.status(403).json({ error: `Class ${cls.name} belongs to a disabled school division.` });
        return;
      }
    }

    const cleanStaffId = typeof body.staffId === 'string' ? body.staffId.trim().slice(0, 40) : '';
    const editingId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined;
    if (cleanStaffId) {
      const conflictTeacher = portalStore.findConflictingStaffIdTeacher(
        schoolId,
        cleanStaffId,
        editingId
      );
      if (conflictTeacher) {
        res.status(409).json({
          error: `Staff ID "${cleanStaffId}" is already assigned to ${conflictTeacher.fullName}. Each teacher must have a unique Staff ID.`,
        });
        return;
      }
    }

    const teacher = await portalStore.upsertTeacher(
      schoolId,
      {
        id: editingId,
        fullName,
        teacherCode: typeof body.teacherCode === 'string' ? body.teacherCode : undefined,
        staffId: cleanStaffId,
        email: typeof body.email === 'string' ? body.email : '',
        phone: typeof body.phone === 'string' ? body.phone : '',
        teacherType,
        assignedClassIds: rawAssignedClassIds,
        assignedSubjectIds: Array.isArray(body.assignedSubjectIds) ? body.assignedSubjectIds : [],
        jhsAssignments: rawJhsAssignments,
        signatureUrl: typeof body.signatureUrl === 'string' ? body.signatureUrl : undefined,
        isActive: body.isActive !== false,
      },
      { uid: actor.uid, name: actor.displayName, role: actor.role }
    );

    if (!teacher) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    res.json({ teacher });
  });

  app.delete(
    '/api/portal/schools/:schoolId/teachers/:teacherId',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, teacherId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can remove teachers.' });
        return;
      }
      const ok = await portalStore.deleteTeacher(schoolId, teacherId, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!ok) {
        res.status(404).json({ error: 'Teacher not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // Teacher Self-Profile Update (strictly scoped to the signed-in teacher's own record)
  app.patch(
    '/api/portal/schools/:schoolId/my-profile',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }

      const bucket = portalStore.getBucket(schoolId);
      if (!bucket) {
        res.status(404).json({ error: 'School not found.' });
        return;
      }

      let targetTeacherId = '';
      if (actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher') {
        targetTeacherId = actor.teacherId || '';
        if (!targetTeacherId && actor.kind === 'class_teacher' && actor.assignedClassIds.length > 0) {
          const fallback = Object.values(bucket.teachers).find(
            (t) =>
              t.isActive &&
              t.teacherType === 'CLASS' &&
              t.assignedClassIds.includes(actor.assignedClassIds[0])
          );
          if (fallback) targetTeacherId = fallback.id;
        }
      } else {
        res.status(403).json({
          error: 'Only signed-in teachers can edit their teacher profile from this endpoint.',
        });
        return;
      }

      if (!targetTeacherId || !bucket.teachers[targetTeacherId]) {
        res.status(404).json({
          error:
            'No teacher profile record is linked to your session yet. Please contact your School Administrator.',
        });
        return;
      }

      const body = req.body ?? {};
      const fullName = typeof body.fullName === 'string' ? body.fullName : '';
      const staffId = typeof body.staffId === 'string' ? body.staffId : undefined;
      const email = typeof body.email === 'string' ? body.email : undefined;
      const phone = typeof body.phone === 'string' ? body.phone : undefined;
      const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl : undefined;
      const signatureUrl = typeof body.signatureUrl === 'string' ? body.signatureUrl : undefined;

      const result = await portalStore.updateOwnTeacherProfile(
        schoolId,
        targetTeacherId,
        { fullName, staffId, email, phone, photoUrl, signatureUrl },
        { uid: actor.uid, name: actor.displayName, role: actor.role }
      );

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      const updated = result.teacher;
      let refreshedSession: PortalSession | undefined;
      if (actor.kind === 'class_teacher') {
        refreshedSession = signPortalToken({
          sessionType: 'class_teacher',
          schoolId,
          schoolName: bucket.school.name,
          displayName: updated.fullName,
          email: updated.email || undefined,
          role: 'Class Teacher',
          teacherId: updated.id,
          assignedClassIds: actor.assignedClassIds,
          assignedSubjectIds: [],
        });
      } else if (actor.kind === 'jhs_teacher') {
        refreshedSession = signPortalToken({
          sessionType: 'jhs_teacher',
          schoolId,
          schoolName: bucket.school.name,
          displayName: updated.fullName,
          email: updated.email || undefined,
          role: 'Subject Teacher',
          teacherId: updated.id,
          assignedClassIds: actor.assignedClassIds,
          assignedSubjectIds: actor.assignedSubjectIds,
          jhsAssignments: actor.jhsAssignments,
        });
      }

      res.json({ teacher: updated, ...(refreshedSession ? { session: refreshedSession } : {}) });
    }
  );

  // School Admin ONLY: Regenerate a Teacher's Sign-In Code (starts with school code)
  app.post(
    '/api/portal/schools/:schoolId/teachers/:teacherId/regenerate-code',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, teacherId } = req.params;
      if (actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can regenerate teacher sign-in codes.',
        });
        return;
      }
      const result = await portalStore.regenerateTeacherCode(schoolId, teacherId, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({
        teacher: result.teacher,
        previousCode: result.previousCode,
        newCode: result.newCode,
      });
    }
  );

  // School Admin ONLY: Regenerate a Pupil / Parent Sign-In Code (starts with school code)
  app.post(
    '/api/portal/schools/:schoolId/pupils/:pupilId/regenerate-code',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, pupilId } = req.params;
      if (actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can regenerate parent sign-in codes.',
        });
        return;
      }
      const result = await portalStore.regeneratePupilCode(schoolId, pupilId, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({
        pupil: result.pupil,
        previousCode: result.previousCode,
        newCode: result.newCode,
      });
    }
  );

  // Class, JHS, and JHS Subject Password Management (School Admin)
  app.post(
    '/api/portal/schools/:schoolId/passwords/class',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can set class passwords.' });
        return;
      }
      const classId = typeof req.body?.classId === 'string' ? req.body.classId.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (!classId || password.length < 4) {
        res.status(400).json({ error: 'Class ID and password (min 4 chars) are required.' });
        return;
      }
      const clsBucket = portalStore.getBucket(schoolId);
      const targetCls = clsBucket?.classes[classId];
      if (!clsBucket || !targetCls) {
        res.status(404).json({ error: 'School or class not found.' });
        return;
      }
      if (!isLevelCategoryEnabled(targetCls.levelCategory, clsBucket.school)) {
        res.status(403).json({ error: 'Cannot set password for a class in a disabled school division.' });
        return;
      }
      const updated = await portalStore.setClassPassword(schoolId, classId, password, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!updated) {
        res.status(404).json({ error: 'School or class not found.' });
        return;
      }
      res.json({ school: updated });
    }
  );

  app.post(
    '/api/portal/schools/:schoolId/passwords/jhs-teacher',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can set JHS teacher passwords.' });
        return;
      }
      const jhsBucket = portalStore.getBucket(schoolId);
      if (!jhsBucket) {
        res.status(404).json({ error: 'School not found.' });
        return;
      }
      if (!getSchoolDivisions(jhsBucket.school).hasJhs) {
        res.status(403).json({ error: 'Junior High School (JHS 1 – JHS 3) is not enabled for this school.' });
        return;
      }
      const teacherId = typeof req.body?.teacherId === 'string' ? req.body.teacherId.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (!teacherId || password.length < 4) {
        res.status(400).json({ error: 'Teacher ID and password (min 4 chars) are required.' });
        return;
      }
      const result = await portalStore.setJhsTeacherPassword(schoolId, teacherId, password, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ school: result.school });
    }
  );

  app.post(
    '/api/portal/schools/:schoolId/passwords/jhs-subject',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can set JHS subject passwords.' });
        return;
      }
      const jhsSubjBucket = portalStore.getBucket(schoolId);
      if (!jhsSubjBucket) {
        res.status(404).json({ error: 'School not found.' });
        return;
      }
      if (!getSchoolDivisions(jhsSubjBucket.school).hasJhs) {
        res.status(403).json({ error: 'Junior High School (JHS 1 – JHS 3) is not enabled for this school.' });
        return;
      }
      const subjectId = typeof req.body?.subjectId === 'string' ? req.body.subjectId.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (!subjectId || password.length < 4) {
        res.status(400).json({ error: 'Subject ID and password (min 4 chars) are required.' });
        return;
      }
      const updated = await portalStore.setJhsSubjectPassword(schoolId, subjectId, password, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!updated) {
        res.status(404).json({ error: 'School or subject not found.' });
        return;
      }
      res.json({ school: updated });
    }
  );

  // Parent Portal Password Management for a Pupil (School Admin)
  app.post(
    '/api/portal/schools/:schoolId/pupils/:pupilId/parent-password',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, pupilId } = req.params;

      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }

      const bucket = portalStore.getBucket(schoolId);
      const pupil = bucket?.pupils[pupilId];
      if (!bucket || !pupil) {
        res.status(404).json({ error: 'School or pupil record not found.' });
        return;
      }

      if (actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can generate Parent Sign-In passwords.',
        });
        return;
      }

      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (password.length < 4 || password.length > 100) {
        res.status(400).json({ error: 'Parent password must be between 4 and 100 characters.' });
        return;
      }

      const updated = await portalStore.setParentPassword(schoolId, pupilId, password, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });

      if (!updated) {
        res.status(404).json({ error: 'Could not update parent password.' });
        return;
      }

      res.json({ school: updated, hasParentPassword: true });
    }
  );

  // School Admin: Send Sign-In Credentials to Registered Phone Number (Teachers & Parents)
  app.post(
    '/api/portal/schools/:schoolId/credentials/send-phone',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;

      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can send sign-in credentials to registered phone numbers.',
        });
        return;
      }

      if (isRateLimited(`send_creds_phone:${schoolId}:${actor.uid}`, 80, 60_000)) {
        res.status(429).json({
          error: 'Too many credential dispatch requests in a short time. Please wait a moment and try again.',
        });
        return;
      }

      const targetType =
        req.body?.targetType === 'teacher'
          ? 'teacher'
          : req.body?.targetType === 'parent'
          ? 'parent'
          : '';
      const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : '';
      const channel =
        req.body?.channel === 'whatsapp'
          ? 'whatsapp'
          : req.body?.channel === 'gateway'
          ? 'gateway'
          : 'sms';

      if (!targetType || !targetId) {
        res.status(400).json({ error: 'targetType ("teacher" or "parent") and targetId are required.' });
        return;
      }

      const target = portalStore.getPhoneCredentialTarget(schoolId, targetType, targetId);
      if (!target.ok) {
        res.status(target.status).json({ error: target.error });
        return;
      }

      const formattedDigits = formatPhoneDigitsForDispatch(target.phone);
      if (!formattedDigits) {
        res.status(400).json({ error: 'Registered phone number is not in a valid dialable format.' });
        return;
      }

      const appUrlEnv = (process.env.APP_URL || '').trim();
      const portalOrigin =
        appUrlEnv && appUrlEnv !== 'MY_APP_URL' && /^https?:\/\//i.test(appUrlEnv)
          ? appUrlEnv.replace(/\/+$/, '')
          : '';
      const portalLine = portalOrigin ? `\nPortal: ${portalOrigin}` : '';

      const message =
        targetType === 'teacher'
          ? `Hello ${target.recipientName},\nYour ${target.schoolName} Staff Sign-In Credentials:\n${target.loginIdLabel}: ${target.loginId}${
              target.classOrLevel ? `\nClass / Level: ${target.classOrLevel}` : ''
            }\nPassword: ${target.password}${portalLine}`
          : `Hello ${target.recipientName},\nYour ${target.schoolName} Parent Portal Credentials for ${
              target.pupilName || 'your child'
            }${target.classOrLevel ? ` (${target.classOrLevel})` : ''}:\n${target.loginIdLabel}: ${
              target.loginId
            }\nPassword: ${target.password}${portalLine}`;

      let dispatchedVia: 'webhook' | 'device' = 'device';
      const webhookRaw = (
        process.env.SMS_WEBHOOK_URL ||
        process.env.RECOVERY_WEBHOOK_URL ||
        ''
      ).trim();

      if (webhookRaw && channel !== 'whatsapp') {
        const safeUrl = await isSafeExternalWebhookUrl(webhookRaw);
        if (safeUrl) {
          try {
            const hookResp = await fetch(safeUrl.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'SEND_PORTAL_CREDENTIALS',
                channel: 'sms',
                schoolId,
                schoolName: target.schoolName,
                targetType,
                recipientName: target.recipientName,
                phone: `+${formattedDigits}`,
                message,
              }),
              signal: AbortSignal.timeout(8000),
            });
            if (hookResp.ok) {
              dispatchedVia = 'webhook';
            }
          } catch (err) {
            console.warn('SMS credential webhook dispatch skipped:', err);
          }
        }
      }

      await portalStore.recordPhoneCredentialDispatch(schoolId, {
        targetType,
        targetId,
        recipientName: target.recipientName,
        maskedPhone: target.maskedPhone,
        dispatchedVia,
        channel,
        actor: { uid: actor.uid, name: actor.displayName, role: actor.role },
      });

      const smsHref = `sms:+${formattedDigits}?body=${encodeURIComponent(message)}`;
      const whatsappHref = `https://wa.me/${formattedDigits}?text=${encodeURIComponent(message)}`;

      res.json({
        ok: true,
        dispatchedVia,
        recipientName: target.recipientName,
        roleLabel: target.roleLabel,
        loginIdLabel: target.loginIdLabel,
        loginId: target.loginId,
        phone: target.phone,
        maskedPhone: target.maskedPhone,
        message,
        smsHref,
        whatsappHref,
      });
    }
  );

  // Authenticated Image Upload for School Logo & Pupil Pictures
  app.post(
    '/api/portal/schools/:schoolId/upload-image',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;

      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }

      const category =
        req.body?.category === 'logo'
          ? 'logo'
          : req.body?.category === 'pupil'
          ? 'pupil'
          : req.body?.category === 'teacher'
          ? 'teacher'
          : req.body?.category === 'signature'
          ? 'signature'
          : '';
      if (!category) {
        res.status(400).json({
          error: 'Upload category must be "logo", "pupil", "teacher", or "signature".',
        });
        return;
      }

      if (category === 'logo') {
        if (actor.kind !== 'school_admin') {
          res.status(403).json({ error: 'Only the School Administrator can upload the school logo.' });
          return;
        }
      } else if (category === 'pupil' || category === 'teacher') {
        if (
          actor.kind !== 'school_admin' &&
          actor.kind !== 'class_teacher' &&
          actor.kind !== 'jhs_teacher'
        ) {
          res.status(403).json({ error: 'You are not permitted to upload this photograph.' });
          return;
        }
      }
      // category === 'signature' is allowed for any authenticated school member (school_admin, teachers, parents)

      const result = await saveValidatedImageUpload(req.body?.dataUrl, category);
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json({ url: result.url });
    }
  );

  // Scoped Parent / Guardian Signature attachment onto their own child's report card
  app.post(
    '/api/portal/schools/:schoolId/parent-signature',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;

      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }

      if (actor.kind !== 'school_admin' && actor.kind !== 'parent') {
        res.status(403).json({
          error: 'Only the signed-in Parent or School Administrator can attach a parent signature.',
        });
        return;
      }

      const reportId = typeof req.body?.reportId === 'string' ? req.body.reportId.trim() : '';
      const rawSignatureUrl =
        typeof req.body?.signatureUrl === 'string' ? req.body.signatureUrl.trim() : '';

      if (!reportId) {
        res.status(400).json({ error: 'reportId is required.' });
        return;
      }

      const bucket = portalStore.getBucket(schoolId);
      if (!bucket) {
        res.status(404).json({ error: 'School not found.' });
        return;
      }

      const existingReport = bucket.reportCards[reportId];
      if (!existingReport) {
        res.status(404).json({ error: 'Report card not found.' });
        return;
      }
      if (actor.kind === 'parent' && existingReport.pupilId !== actor.pupilId) {
        res.status(403).json({ error: 'Parents can only sign their own child’s report card.' });
        return;
      }

      let finalUrl = '';
      if (rawSignatureUrl) {
        if (rawSignatureUrl.startsWith('/api/uploads/')) {
          if (!/^\/api\/uploads\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(rawSignatureUrl)) {
            res.status(400).json({ error: 'Invalid signature image path.' });
            return;
          }
          finalUrl = rawSignatureUrl;
        } else if (rawSignatureUrl.startsWith('data:image/')) {
          const uploadRes = await saveValidatedImageUpload(rawSignatureUrl, 'signature');
          if ('error' in uploadRes) {
            res.status(uploadRes.status).json({ error: uploadRes.error });
            return;
          }
          finalUrl = uploadRes.url;
        } else {
          res.status(400).json({ error: 'Unsupported signature image format.' });
          return;
        }
      }

      const now = new Date().toISOString();
      await portalStore.saveDocument(schoolId, 'reportCards', reportId, {
        ...existingReport,
        parentSignatureUrl: finalUrl,
        updatedAt: now,
      });

      const pupilDoc = bucket.pupils[existingReport.pupilId];
      if (pupilDoc) {
        await portalStore.saveDocument(schoolId, 'pupils', existingReport.pupilId, {
          ...pupilDoc,
          parentSignatureUrl: finalUrl,
          updatedAt: now,
        });
      }

      res.json({ ok: true, signatureUrl: finalUrl });
    }
  );

  // Scoped Academic Document Mutations
  app.post('/api/portal/schools/:schoolId/docs', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    const collectionName = typeof req.body?.collectionName === 'string' ? req.body.collectionName : '';
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : '';
    const data = req.body?.data && typeof req.body.data === 'object' ? { ...(req.body.data as Record<string, unknown>) } : null;

    if (!VALID_COLLECTIONS.has(collectionName) || !docId || !data) {
      res.status(400).json({ error: 'Invalid collectionName, docId, or data.' });
      return;
    }

    const denyReason = canActorMutateDoc(
      actor,
      schoolId,
      collectionName as SchoolCollectionName,
      data,
      docId
    );
    if (denyReason) {
      res.status(403).json({ error: denyReason });
      return;
    }

    // Strip division flags if ever sent via schoolSettings (divisions are managed via /api/portal/schools/:schoolId)
    if (collectionName === 'schoolSettings') {
      delete data.hasKg;
      delete data.hasPrimary;
      delete data.hasJhs;
    }

    // Only School Administrator can edit schoolName
    if (collectionName === 'schoolSettings' && actor.kind !== 'school_admin') {
      const bucket = portalStore.getBucket(schoolId);
      if (bucket) {
        const lockedName = bucket.school.name || bucket.settings?.schoolName || '';
        const requestedName = typeof data.schoolName === 'string' ? data.schoolName.trim().slice(0, 140) : '';
        if (requestedName && lockedName && requestedName !== lockedName) {
          res.status(403).json({ error: 'Only the School Administrator can change the registered school name.' });
          return;
        }
        data.schoolName = lockedName;
      }
    }

    if (collectionName === 'pupils') {
      const bucket = portalStore.getBucket(schoolId);
      if (bucket) {
        const existingPupil = bucket.pupils[docId];
        if (existingPupil) {
          // Parent / pupil sign-in code is strictly non-editable during normal edits;
          // only School Admin regeneration endpoint can replace it.
          data.admissionNumber = existingPupil.admissionNumber;
        } else {
          const requestedAdm =
            typeof data.admissionNumber === 'string' ? data.admissionNumber.trim().toUpperCase() : '';
          const usedGlobal = new Set(portalStore.collectAllUsedLoginCodes());
          if (
            requestedAdm &&
            hasSchoolCodePrefix(requestedAdm, bucket.school.code) &&
            !usedGlobal.has(requestedAdm)
          ) {
            data.admissionNumber = requestedAdm;
          } else {
            data.admissionNumber = generateNextAdmissionNumber(
              bucket.school.code,
              Object.values(bucket.pupils),
              Array.from(usedGlobal)
            );
          }
        }
        const dup = findDuplicatePupil(
          Object.values(bucket.pupils),
          data,
          docId
        );
        if (dup) {
          res.status(409).json({ error: dup.message });
          return;
        }
      }
    }

    const ok = await portalStore.saveDocument(schoolId, collectionName as SchoolCollectionName, docId, data);
    if (!ok) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/portal/schools/:schoolId/batch', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    const rawOps = Array.isArray(req.body?.operations) ? req.body.operations : null;
    if (!rawOps) {
      res.status(400).json({ error: 'operations array is required.' });
      return;
    }

    const validatedOps: Array<{
      collectionName: SchoolCollectionName;
      docId: string;
      data: Record<string, unknown>;
    }> = [];

    const existingBucket = portalStore.getBucket(schoolId);
    const workingPupils = existingBucket ? { ...existingBucket.pupils } : null;
    const workingUsedCodes = new Set(portalStore.collectAllUsedLoginCodes());

    for (const op of rawOps) {
      const collectionName = typeof op?.collectionName === 'string' ? op.collectionName : '';
      const docId = typeof op?.docId === 'string' ? op.docId.trim() : '';
      const data = op?.data && typeof op.data === 'object' ? { ...(op.data as Record<string, unknown>) } : null;
      if (!VALID_COLLECTIONS.has(collectionName) || !docId || !data) {
        res.status(400).json({ error: 'Invalid batch operation payload.' });
        return;
      }
      const denyReason = canActorMutateDoc(
        actor,
        schoolId,
        collectionName as SchoolCollectionName,
        data,
        docId
      );
      if (denyReason) {
        res.status(403).json({ error: denyReason });
        return;
      }
      if (collectionName === 'schoolSettings') {
        delete data.hasKg;
        delete data.hasPrimary;
        delete data.hasJhs;
      }
      if (collectionName === 'schoolSettings' && actor.kind !== 'school_admin' && existingBucket) {
        const lockedName = existingBucket.school.name || existingBucket.settings?.schoolName || '';
        const requestedName = typeof data.schoolName === 'string' ? data.schoolName.trim().slice(0, 140) : '';
        if (requestedName && lockedName && requestedName !== lockedName) {
          res.status(403).json({ error: 'Only the School Administrator can change the registered school name.' });
          return;
        }
        data.schoolName = lockedName;
      }
      if (collectionName === 'pupils' && workingPupils && existingBucket) {
        const existingPupil = workingPupils[docId];
        if (existingPupil) {
          data.admissionNumber = existingPupil.admissionNumber;
        } else {
          const requestedAdm =
            typeof data.admissionNumber === 'string' ? data.admissionNumber.trim().toUpperCase() : '';
          if (
            requestedAdm &&
            hasSchoolCodePrefix(requestedAdm, existingBucket.school.code) &&
            !workingUsedCodes.has(requestedAdm)
          ) {
            data.admissionNumber = requestedAdm;
          } else {
            data.admissionNumber = generateNextAdmissionNumber(
              existingBucket.school.code,
              Object.values(workingPupils),
              Array.from(workingUsedCodes)
            );
          }
          workingUsedCodes.add(String(data.admissionNumber).toUpperCase());
        }
        const dup = findDuplicatePupil(
          Object.values(workingPupils),
          data,
          docId
        );
        if (dup) {
          res.status(409).json({ error: dup.message });
          return;
        }
        workingPupils[docId] = {
          ...data,
          id: docId,
        } as unknown as (typeof workingPupils)[string];
      }
      validatedOps.push({ collectionName: collectionName as SchoolCollectionName, docId, data });
    }

    const ok = await portalStore.batchSaveDocuments(schoolId, validatedOps);
    if (!ok) {
      res.status(404).json({ error: 'School not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete(
    '/api/portal/schools/:schoolId/docs/:collectionName/:docId',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, collectionName, docId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can remove records.' });
        return;
      }
      if (!VALID_COLLECTIONS.has(collectionName)) {
        res.status(400).json({ error: 'Invalid collectionName.' });
        return;
      }
      const ok = await portalStore.removeDocument(schoolId, collectionName as SchoolCollectionName, docId);
      if (!ok) {
        res.status(404).json({ error: 'Record not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  app.post('/api/portal/schools/:schoolId/audit', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    if (!ensureSchoolAccess(actor, schoolId) || actor.kind === 'parent') {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const action = typeof req.body?.action === 'string' ? req.body.action.trim().slice(0, 100) : '';
    const targetCollection =
      typeof req.body?.targetCollection === 'string' ? req.body.targetCollection.trim().slice(0, 80) : '';
    const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim().slice(0, 128) : '';
    const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim().slice(0, 500) : '';
    const actorRole = typeof req.body?.actorRole === 'string' ? req.body.actorRole.trim().slice(0, 60) : actor.role;

    if (!action || !targetCollection || !targetId) {
      res.status(400).json({ error: 'action, targetCollection, and targetId are required.' });
      return;
    }

    const entry = await portalStore.appendAuditLog(schoolId, {
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorEmail: actor.kind === 'school_admin' ? actor.email : '',
      actorRole,
      action,
      targetCollection,
      targetId,
      summary,
      createdAt: new Date().toISOString(),
    });
    res.json({ entry });
  });

  app.get('/api/portal/schools/:schoolId/audit', requireAnyAuth, (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    if (!ensureSchoolAccess(actor, schoolId) || actor.kind !== 'school_admin') {
      res.status(403).json({ error: 'Only the School Administrator can view audit logs.' });
      return;
    }
    const snap = portalStore.getSchoolSnapshot(schoolId);
    res.json({ auditLogs: snap?.auditLogs || [] });
  });

  // Parent Portal: Update Pupil Profile (Registration Code strictly immutable on server)
  app.patch(
    '/api/portal/schools/:schoolId/parent-pupil-profile',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }
      if (actor.kind !== 'school_admin' && actor.kind !== 'parent') {
        res.status(403).json({
          error: 'Only the signed-in Parent or School Administrator can update this profile from the Parent Portal.',
        });
        return;
      }

      const body = req.body ?? {};
      const targetPupilId =
        actor.kind === 'parent'
          ? actor.pupilId || ''
          : typeof body.pupilId === 'string'
          ? body.pupilId.trim()
          : '';

      if (!targetPupilId) {
        res.status(400).json({ error: 'Target pupil ID is required.' });
        return;
      }

      const bucket = portalStore.getBucket(schoolId);
      const existing = bucket?.pupils[targetPupilId];
      if (!bucket || !existing) {
        res.status(404).json({ error: 'Pupil record not found.' });
        return;
      }

      // Explicitly reject any attempt to alter the registration code
      if (
        typeof body.admissionNumber === 'string' &&
        body.admissionNumber.trim() !== existing.admissionNumber
      ) {
        res.status(403).json({
          error: 'Pupil registration code cannot be changed from the Parent Portal.',
        });
        return;
      }

      const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
      const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
      const otherNames = typeof body.otherNames === 'string' ? body.otherNames.trim() : '';
      const gender = body.gender === 'Female' ? 'Female' : body.gender === 'Male' ? 'Male' : existing.gender;
      const dateOfBirth = typeof body.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
      const guardianName = typeof body.guardianName === 'string' ? body.guardianName.trim() : '';
      const guardianPhone = typeof body.guardianPhone === 'string' ? body.guardianPhone.trim() : '';

      if (!firstName || !lastName) {
        res.status(400).json({ error: 'First name and last name are required.' });
        return;
      }
      if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        res.status(400).json({ error: 'Date of birth must be in YYYY-MM-DD format.' });
        return;
      }

      const updated = await portalStore.updateParentPupilProfile(
        schoolId,
        targetPupilId,
        {
          firstName,
          lastName,
          otherNames,
          gender,
          dateOfBirth,
          guardianName,
          guardianPhone,
        },
        { uid: actor.uid, name: actor.displayName, role: actor.role }
      );

      if (!updated) {
        res.status(404).json({ error: 'Could not update pupil profile.' });
        return;
      }

      res.json({ pupil: updated });
    }
  );

  // Announcements: List visible announcements for the signed-in actor
  app.get('/api/portal/schools/:schoolId/announcements', requireAnyAuth, (req: AuthRequest, res: Response) => {
    const actor = req.actor!;
    const { schoolId } = req.params;
    if (!ensureSchoolAccess(actor, schoolId)) {
      res.status(403).json({ error: 'Access denied for this school.' });
      return;
    }
    const announcements = portalStore.getVisibleAnnouncements(schoolId, {
      kind: actor.kind,
      pupilId: actor.kind === 'parent' ? actor.pupilId : undefined,
      assignedClassIds:
        actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher'
          ? actor.assignedClassIds
          : undefined,
    });
    res.json({ announcements });
  });

  // Announcements: Create or Update (Strict RBAC per scope)
  app.post(
    '/api/portal/schools/:schoolId/announcements',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }
      if (actor.kind === 'parent') {
        res.status(403).json({ error: 'Parents cannot publish or edit announcements.' });
        return;
      }

      const body = req.body ?? {};
      const scope =
        body.scope === 'GENERAL' || body.scope === 'SCHOOL' || body.scope === 'PUPIL'
          ? body.scope
          : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const priority =
        body.priority === 'Important' || body.priority === 'Urgent' ? body.priority : 'Normal';
      const pinned = Boolean(body.pinned);
      const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim().slice(0, 128) : undefined;
      const pupilId = typeof body.pupilId === 'string' ? body.pupilId.trim() : '';

      if (!scope) {
        res.status(400).json({ error: 'Announcement scope must be GENERAL, SCHOOL, or PUPIL.' });
        return;
      }
      if (!title || !message) {
        res.status(400).json({ error: 'Announcement title and message are required.' });
        return;
      }

      // Enforce exact RBAC rules:
      // 1) GENERAL & SCHOOL: School Admin ONLY
      if (scope === 'GENERAL' && actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can manage General Announcements.' });
        return;
      }
      if (scope === 'SCHOOL' && actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can manage School Announcements.',
        });
        return;
      }
      // 2) PUPIL: School Admin, Class Teacher, or Subject Teacher (scoped to assigned classes)
      if (scope === 'PUPIL') {
        if (!pupilId) {
          res.status(400).json({ error: 'Please select a target pupil for a Pupil-Specific Announcement.' });
          return;
        }
        const bucket = portalStore.getBucket(schoolId);
        const pupil = bucket?.pupils[pupilId];
        if (!bucket || !pupil) {
          res.status(404).json({ error: 'Target pupil not found in this school.' });
          return;
        }
        if (
          (actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher') &&
          !actor.assignedClassIds.includes(pupil.currentClassId)
        ) {
          res.status(403).json({
            error: 'Teachers can only publish pupil-specific announcements for pupils in their assigned classes.',
          });
          return;
        }
      }

      const saved = await portalStore.upsertAnnouncement({
        id,
        scope,
        schoolId: scope === 'GENERAL' ? undefined : schoolId,
        pupilId: scope === 'PUPIL' ? pupilId : undefined,
        title,
        message,
        priority,
        pinned,
        actor: { uid: actor.uid, name: actor.displayName, role: actor.role },
      });

      if (!saved) {
        res.status(404).json({ error: 'Could not save announcement.' });
        return;
      }
      res.status(201).json({ announcement: saved });
    }
  );

  // Announcements: Delete (Strict RBAC per scope)
  app.delete(
    '/api/portal/schools/:schoolId/announcements/:announcementId',
    requireAnyAuth,
    async (req: AuthRequest, res: Response) => {
      const actor = req.actor!;
      const { schoolId, announcementId } = req.params;
      if (!ensureSchoolAccess(actor, schoolId)) {
        res.status(403).json({ error: 'Access denied for this school.' });
        return;
      }
      if (actor.kind === 'parent') {
        res.status(403).json({ error: 'Parents cannot delete announcements.' });
        return;
      }

      const found = portalStore.getAnnouncementById(schoolId, announcementId);
      if (!found) {
        res.status(404).json({ error: 'Announcement not found.' });
        return;
      }

      if (found.scope === 'GENERAL' && actor.kind !== 'school_admin') {
        res.status(403).json({ error: 'Only the School Administrator can delete General Announcements.' });
        return;
      }
      if (found.scope === 'SCHOOL' && actor.kind !== 'school_admin') {
        res.status(403).json({
          error: 'Only the School Administrator can delete School Announcements.',
        });
        return;
      }
      if (found.scope === 'PUPIL' && (actor.kind === 'class_teacher' || actor.kind === 'jhs_teacher')) {
        const bucket = portalStore.getBucket(schoolId);
        const pupilClassId =
          found.record.classId ||
          (found.record.pupilId ? bucket?.pupils[found.record.pupilId]?.currentClassId : undefined);
        if (!pupilClassId || !actor.assignedClassIds.includes(pupilClassId)) {
          res.status(403).json({
            error: 'Teachers can only delete pupil-specific announcements for pupils in their assigned classes.',
          });
          return;
        }
      }

      const ok = await portalStore.deleteAnnouncement(schoolId, announcementId, {
        uid: actor.uid,
        name: actor.displayName,
        role: actor.role,
      });
      if (!ok) {
        res.status(404).json({ error: 'Announcement not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // Gemini AI Report Card Remarks (available to School Admin and Teachers)
  app.post('/api/ai/remarks', requireAnyAuth, async (req: AuthRequest, res: Response) => {
    if (req.actor?.kind === 'parent') {
      res.status(403).json({ error: 'Parents cannot generate AI remarks.' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const {
      pupilName,
      gender,
      className,
      levelCategory,
      assessmentMode,
      academicYearName,
      termName,
      overallAverage,
      previousTermAverage,
      classAverage,
      classPosition,
      totalPupilsInClass,
      attendancePresent,
      attendanceTotal,
      conductSummary,
      attitude,
      interest,
      subjects,
      learningAreas,
      personalityTraits,
      schoolName,
    } = req.body ?? {};

    if (!pupilName || !className || !levelCategory) {
      res.status(400).json({ error: 'pupilName, className, and levelCategory are required.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const effectiveMode =
        assessmentMode === 'NUMERIC_SBA' || assessmentMode === 'COMPETENCY'
          ? assessmentMode
          : levelCategory === 'KG'
          ? 'COMPETENCY'
          : 'NUMERIC_SBA';

      const structuredFacts = {
        schoolName: schoolName || 'Basic School',
        pupilName,
        gender: gender || null,
        className,
        levelCategory,
        assessmentMode: effectiveMode,
        academicYearName: academicYearName || '',
        termName: termName || '',
        attendance: {
          present: attendancePresent ?? null,
          total: attendanceTotal ?? null,
        },
        overallAverage: overallAverage ?? null,
        previousTermAverage: previousTermAverage ?? null,
        classAverage: classAverage ?? null,
        classPosition: classPosition && classPosition > 0 ? classPosition : null,
        totalPupilsInClass: totalPupilsInClass ?? null,
        conductSummary: conductSummary || null,
        attitude: attitude || null,
        interest: interest || null,
        subjects: Array.isArray(subjects) ? subjects : [],
        learningAreas: Array.isArray(learningAreas) ? learningAreas : [],
        personalityTraits: Array.isArray(personalityTraits) ? personalityTraits : [],
      };

      const prompt = `Generate professional Ghanaian basic school report card remarks based STRICTLY on this verified academic record:\n\n${JSON.stringify(structuredFacts, null, 2)}`;

      const generateWithRetry = async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: prompt,
              config: {
                systemInstruction:
                  'You are a senior Ghanaian Basic School educator assisting a class teacher to draft official report card remarks. ' +
                  'CRITICAL ACCURACY RULES: ' +
                  '1. NEVER invent, estimate, or fabricate any score, grade, position, attendance figure, subject, award, or achievement that is not explicitly present in the provided JSON data. ' +
                  '2. If assessmentMode is "COMPETENCY", refer ONLY to Kindergarten competency ratings (1-4 scale), sub-skills, and learning areas—NEVER mention percentages, exam scores, or class rank. ' +
                  '3. If assessmentMode is "NUMERIC_SBA", refer ONLY to the recorded weighted SBA + Exam scores, grades, class average, and classPosition (only if classPosition is non-null). ' +
                  '4. Highlight specific verified strengths (highest subjects/learning areas and positive conduct/traits), constructive areas for improvement (lowest subjects/areas or attendance gaps if any), and practical home-support recommendations. ' +
                  '5. If previousTermAverage is provided, you may accurately note the progression relative to the current overallAverage without fabricating extra terms. ' +
                  '6. Write in warm, professional British/Ghanaian English ready for teacher review and editing.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    generalRemark: {
                      type: Type.STRING,
                      description: '2-3 sentence overall class teacher remark grounded strictly in the pupil data.',
                    },
                    strengthNotes: {
                      type: Type.STRING,
                      description: '1-2 sentences highlighting verified top subjects or learning areas and positive personal traits.',
                    },
                    improvementNotes: {
                      type: Type.STRING,
                      description: '1-2 sentences identifying specific subjects, learning areas, or habits needing support.',
                    },
                    parentRecommendation: {
                      type: Type.STRING,
                      description: '1-2 practical home-support recommendations for parents or guardians.',
                    },
                    subjectRemarks: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          subjectId: { type: Type.STRING },
                          remark: { type: Type.STRING },
                        },
                      },
                    },
                  },
                },
              },
            });
          } catch (err: unknown) {
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('UNAVAILABLE');
            if (!isTransient || attempt === 2) throw err;
            await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
          }
        }
        throw lastError;
      };

      const response = await generateWithRetry();
      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to generate AI remarks.';
      console.error('Gemini remarks generation error:', error);
      res.status(502).json({ error: msg });
    }
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      err instanceof SyntaxError &&
      typeof (err as { status?: number }).status === 'number' &&
      (err as { status?: number }).status === 400 &&
      'body' in (err as object)
    ) {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    console.error('Unhandled API error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:3000');
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
