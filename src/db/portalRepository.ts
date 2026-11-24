import { and, eq, notInArray } from 'drizzle-orm';
import { db, isCloudSqlConfigured } from './index.ts';
import {
  auditLogs,
  portalSnapshots,
  pupils,
  reportCards,
  schoolClasses,
  schools,
  teachers,
} from './schema.ts';

export interface SyncableSchoolBucket {
  school: {
    id: string;
    name: string;
    code?: string;
    accountType?: string;
    isActive: boolean;
    isLocked?: boolean;
    hasKg?: boolean;
    hasPrimary?: boolean;
    hasJhs?: boolean;
    primaryColor: string;
    accentColor: string;
    adminName?: string;
    adminEmail?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  teachers: Record<
    string,
    {
      id: string;
      schoolId: string;
      fullName: string;
      teacherCode?: string;
      email?: string;
      teacherType: string;
      isActive: boolean;
      createdAt?: string;
      updatedAt?: string;
    }
  >;
  classes: Record<
    string,
    {
      id: string;
      name: string;
      basicLabel: string;
      levelCategory: string;
      sortOrder: number;
      createdAt?: string;
    }
  >;
  pupils: Record<
    string,
    {
      id: string;
      admissionNumber: string;
      fullName: string;
      gender: string;
      currentClassId: string;
      enrollmentStatus: string;
      createdAt?: string;
      updatedAt?: string;
    }
  >;
  reportCards: Record<
    string,
    {
      id: string;
      pupilId: string;
      classId: string;
      academicYearId: string;
      termId: string;
      status: string;
      overallAverage?: number;
      updatedAt?: string;
    }
  >;
  auditLogs: Record<
    string,
    {
      id: string;
      actorUid: string;
      actorName?: string;
      actorRole?: string;
      action: string;
      targetCollection: string;
      targetId: string;
      summary?: string;
      createdAt?: string;
    }
  >;
}

export interface SyncablePortalStore {
  version: number;
  schools: Record<string, SyncableSchoolBucket>;
}

const MAIN_SNAPSHOT_ID = 'main';

export async function loadPortalSnapshotFromDb(): Promise<Record<string, unknown> | null> {
  if (!isCloudSqlConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(portalSnapshots)
      .where(eq(portalSnapshots.id, MAIN_SNAPSHOT_ID))
      .limit(1);
    return rows[0]?.payload ?? null;
  } catch (error) {
    console.error('Database query failed while loading portal snapshot:', error);
    throw new Error('Failed to load portal data from database.', { cause: error });
  }
}

export async function syncPortalStoreToDb(store: SyncablePortalStore): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    const now = new Date();
    const schoolBuckets = Object.values(store.schools || {});
    const activeSchoolIds = schoolBuckets.map((b) => b.school.id);

    await db.transaction(async (tx) => {
      await tx
        .insert(portalSnapshots)
        .values({
          id: MAIN_SNAPSHOT_ID,
          version: store.version || 1,
          payload: store as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: portalSnapshots.id,
          set: {
            version: store.version || 1,
            payload: store as unknown as Record<string, unknown>,
            updatedAt: now,
          },
        });

      if (activeSchoolIds.length > 0) {
        await tx.delete(schools).where(notInArray(schools.id, activeSchoolIds));
      }

      for (const bucket of schoolBuckets) {
        const s = bucket.school;
        await tx
          .insert(schools)
          .values({
            id: s.id,
            name: s.name,
            code: s.code || null,
            accountType: s.accountType || 'school',
            isActive: Boolean(s.isActive),
            isLocked: Boolean(s.isLocked),
            hasKg: s.hasKg !== false,
            hasPrimary: s.hasPrimary !== false,
            hasJhs: s.hasJhs !== false,
            primaryColor: s.primaryColor || '#1D4ED8',
            accentColor: s.accentColor || '#F59E0B',
            adminName: s.adminName || null,
            adminEmail: s.adminEmail || null,
            data: s as unknown as Record<string, unknown>,
            createdAt: s.createdAt ? new Date(s.createdAt) : now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schools.id,
            set: {
              name: s.name,
              code: s.code || null,
              accountType: s.accountType || 'school',
              isActive: Boolean(s.isActive),
              isLocked: Boolean(s.isLocked),
              hasKg: s.hasKg !== false,
              hasPrimary: s.hasPrimary !== false,
              hasJhs: s.hasJhs !== false,
              primaryColor: s.primaryColor || '#1D4ED8',
              accentColor: s.accentColor || '#F59E0B',
              adminName: s.adminName || null,
              adminEmail: s.adminEmail || null,
              data: s as unknown as Record<string, unknown>,
              updatedAt: now,
            },
          });

        const teacherList = Object.values(bucket.teachers || {});
        const teacherIds = teacherList.map((t) => t.id);
        if (teacherIds.length > 0) {
          await tx
            .delete(teachers)
            .where(and(eq(teachers.schoolId, s.id), notInArray(teachers.id, teacherIds)));
        } else {
          await tx.delete(teachers).where(eq(teachers.schoolId, s.id));
        }
        for (const t of teacherList) {
          await tx
            .insert(teachers)
            .values({
              id: t.id,
              schoolId: s.id,
              fullName: t.fullName,
              teacherCode: t.teacherCode || null,
              email: t.email || null,
              teacherType: t.teacherType,
              isActive: Boolean(t.isActive),
              data: t as unknown as Record<string, unknown>,
              createdAt: t.createdAt ? new Date(t.createdAt) : now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: teachers.id,
              set: {
                schoolId: s.id,
                fullName: t.fullName,
                teacherCode: t.teacherCode || null,
                email: t.email || null,
                teacherType: t.teacherType,
                isActive: Boolean(t.isActive),
                data: t as unknown as Record<string, unknown>,
                updatedAt: now,
              },
            });
        }

        const classList = Object.values(bucket.classes || {});
        const classIds = classList.map((c) => c.id);
        if (classIds.length > 0) {
          await tx
            .delete(schoolClasses)
            .where(and(eq(schoolClasses.schoolId, s.id), notInArray(schoolClasses.id, classIds)));
        } else {
          await tx.delete(schoolClasses).where(eq(schoolClasses.schoolId, s.id));
        }
        for (const c of classList) {
          await tx
            .insert(schoolClasses)
            .values({
              id: c.id,
              schoolId: s.id,
              name: c.name,
              basicLabel: c.basicLabel,
              levelCategory: c.levelCategory,
              sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : 1,
              data: c as unknown as Record<string, unknown>,
              createdAt: c.createdAt ? new Date(c.createdAt) : now,
            })
            .onConflictDoUpdate({
              target: schoolClasses.id,
              set: {
                schoolId: s.id,
                name: c.name,
                basicLabel: c.basicLabel,
                levelCategory: c.levelCategory,
                sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : 1,
                data: c as unknown as Record<string, unknown>,
              },
            });
        }

        const pupilList = Object.values(bucket.pupils || {});
        const pupilIds = pupilList.map((p) => p.id);
        if (pupilIds.length > 0) {
          await tx
            .delete(pupils)
            .where(and(eq(pupils.schoolId, s.id), notInArray(pupils.id, pupilIds)));
        } else {
          await tx.delete(pupils).where(eq(pupils.schoolId, s.id));
        }
        for (const p of pupilList) {
          await tx
            .insert(pupils)
            .values({
              id: p.id,
              schoolId: s.id,
              admissionNumber: p.admissionNumber,
              fullName: p.fullName,
              gender: p.gender,
              currentClassId: p.currentClassId,
              enrollmentStatus: p.enrollmentStatus,
              data: p as unknown as Record<string, unknown>,
              createdAt: p.createdAt ? new Date(p.createdAt) : now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: pupils.id,
              set: {
                schoolId: s.id,
                admissionNumber: p.admissionNumber,
                fullName: p.fullName,
                gender: p.gender,
                currentClassId: p.currentClassId,
                enrollmentStatus: p.enrollmentStatus,
                data: p as unknown as Record<string, unknown>,
                updatedAt: now,
              },
            });
        }

        const reportList = Object.values(bucket.reportCards || {});
        const reportIds = reportList.map((r) => r.id);
        if (reportIds.length > 0) {
          await tx
            .delete(reportCards)
            .where(and(eq(reportCards.schoolId, s.id), notInArray(reportCards.id, reportIds)));
        } else {
          await tx.delete(reportCards).where(eq(reportCards.schoolId, s.id));
        }
        for (const r of reportList) {
          await tx
            .insert(reportCards)
            .values({
              id: r.id,
              schoolId: s.id,
              pupilId: r.pupilId,
              classId: r.classId,
              academicYearId: r.academicYearId,
              termId: r.termId,
              status: r.status,
              overallAverage:
                r.overallAverage !== undefined && r.overallAverage !== null
                  ? String(r.overallAverage)
                  : null,
              data: r as unknown as Record<string, unknown>,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: reportCards.id,
              set: {
                schoolId: s.id,
                pupilId: r.pupilId,
                classId: r.classId,
                academicYearId: r.academicYearId,
                termId: r.termId,
                status: r.status,
                overallAverage:
                  r.overallAverage !== undefined && r.overallAverage !== null
                    ? String(r.overallAverage)
                    : null,
                data: r as unknown as Record<string, unknown>,
                updatedAt: now,
              },
            });
        }

        const auditList = Object.values(bucket.auditLogs || {}).slice(-50);
        for (const a of auditList) {
          await tx
            .insert(auditLogs)
            .values({
              id: a.id,
              schoolId: s.id,
              actorUid: a.actorUid,
              actorName: a.actorName || null,
              actorRole: a.actorRole || null,
              action: a.action,
              targetCollection: a.targetCollection,
              targetId: a.targetId,
              summary: a.summary || null,
              createdAt: a.createdAt ? new Date(a.createdAt) : now,
            })
            .onConflictDoNothing({ target: auditLogs.id });
        }
      }
    });
  } catch (error) {
    console.error('Database query failed while syncing portal store:', error);
    throw new Error('Failed to persist portal data to database.', { cause: error });
  }
}
