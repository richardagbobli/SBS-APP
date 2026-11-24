import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('Pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const schools = pgTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  accountType: text('account_type').notNull().default('school'),
  isActive: boolean('is_active').notNull().default(true),
  isLocked: boolean('is_locked').notNull().default(false),
  hasKg: boolean('has_kg').notNull().default(true),
  hasPrimary: boolean('has_primary').notNull().default(true),
  hasJhs: boolean('has_jhs').notNull().default(true),
  primaryColor: text('primary_color').notNull().default('#1D4ED8'),
  accentColor: text('accent_color').notNull().default('#F59E0B'),
  adminName: text('admin_name'),
  adminEmail: text('admin_email'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const teachers = pgTable('teachers', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  teacherCode: text('teacher_code'),
  email: text('email'),
  teacherType: text('teacher_type').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const schoolClasses = pgTable('school_classes', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  basicLabel: text('basic_label').notNull(),
  levelCategory: text('level_category').notNull(),
  sortOrder: integer('sort_order').notNull().default(1),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const pupils = pgTable('pupils', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' }),
  admissionNumber: text('admission_number').notNull(),
  fullName: text('full_name').notNull(),
  gender: text('gender').notNull(),
  currentClassId: text('current_class_id').notNull(),
  enrollmentStatus: text('enrollment_status').notNull().default('Active'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const reportCards = pgTable('report_cards', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' }),
  pupilId: text('pupil_id').notNull(),
  classId: text('class_id').notNull(),
  academicYearId: text('academic_year_id').notNull(),
  termId: text('term_id').notNull(),
  status: text('status').notNull().default('Draft'),
  overallAverage: text('overall_average'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' }),
  actorUid: text('actor_uid').notNull(),
  actorName: text('actor_name'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  targetCollection: text('target_collection').notNull(),
  targetId: text('target_id').notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const portalSnapshots = pgTable('portal_snapshots', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const schoolsRelations = relations(schools, ({ many }) => ({
  teachers: many(teachers),
  classes: many(schoolClasses),
  pupils: many(pupils),
  reportCards: many(reportCards),
  auditLogs: many(auditLogs),
}));

export const teachersRelations = relations(teachers, ({ one }) => ({
  school: one(schools, {
    fields: [teachers.schoolId],
    references: [schools.id],
  }),
}));

export const schoolClassesRelations = relations(schoolClasses, ({ one }) => ({
  school: one(schools, {
    fields: [schoolClasses.schoolId],
    references: [schools.id],
  }),
}));

export const pupilsRelations = relations(pupils, ({ one }) => ({
  school: one(schools, {
    fields: [pupils.schoolId],
    references: [schools.id],
  }),
}));

export const reportCardsRelations = relations(reportCards, ({ one }) => ({
  school: one(schools, {
    fields: [reportCards.schoolId],
    references: [schools.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  school: one(schools, {
    fields: [auditLogs.schoolId],
    references: [schools.id],
  }),
}));
