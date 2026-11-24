import jsPDF from 'jspdf';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import {
  computeClassRanking,
  computeReportVerificationCode,
  resolveGrade,
  round1,
  subjectMatchesClass,
} from './calculations';
import { SchoolStoreState } from './firestoreService';
import {
  AssessmentConfig,
  JhsAssignment,
  Pupil,
  ReportCard,
  SchoolClass,
  Subject,
  TeacherAccount,
  Term,
} from '../types';

function slug(text: string): string {
  return (
    text
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'School'
  );
}

function compactKey(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// 1. Master Term Broadsheet Exporter (.xlsx)
// ---------------------------------------------------------------------------

export async function downloadMasterBroadsheetXlsx(params: {
  store: SchoolStoreState;
  classId: string;
  academicYearId: string;
  termId: string;
}): Promise<number> {
  const { store, classId, academicYearId, termId } = params;
  const cls = store.classes.find((c) => c.id === classId);
  if (!cls) throw new Error('Class not found.');

  const term = store.terms.find((t) => t.id === termId);
  const year = store.academicYears.find((y) => y.id === academicYearId);
  const schoolName = store.settings?.schoolName || store.school?.name || 'Basic School';
  const minPass = store.settings?.minPassAverage ?? 50;

  const classPupils = store.pupils
    .filter((p) => p.currentClassId === classId && p.enrollmentStatus === 'Active')
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const classSubjects = store.subjects
    .filter((s) => subjectMatchesClass(s, cls))
    .sort((a, b) => a.name.localeCompare(b.name));

  const gradingScale =
    store.gradingScales.find((g) => g.id === cls.gradingScaleId) ||
    store.gradingScales.find((g) => g.levelCategory === (cls.levelCategory === 'KG' ? 'PRIMARY' : cls.levelCategory)) ||
    store.gradingScales[0];

  const records = store.assessmentRecords.filter(
    (r) => r.classId === classId && r.academicYearId === academicYearId && r.termId === termId
  );

  const scoreByPupilSubj = new Map<string, number>();
  for (const r of records) {
    scoreByPupilSubj.set(`${r.pupilId}__${r.subjectId}`, r.totalScore);
  }

  const pupilRows = classPupils.map((p) => {
    const scores: Array<number | null> = classSubjects.map((s) => {
      const val = scoreByPupilSubj.get(`${p.id}__${s.id}`);
      return val !== undefined ? val : null;
    });
    const validScores = scores.filter((v): v is number => v !== null);
    const total = validScores.reduce((acc, v) => acc + v, 0);
    const average = validScores.length > 0 ? round1(total / validScores.length) : 0;
    return { pupil: p, scores, total: round1(total), average, subjectsTaken: validScores.length };
  });

  const rankingMap = computeClassRanking(
    pupilRows.map((r) => ({ pupilId: r.pupil.id, average: r.subjectsTaken > 0 ? r.average : -1 }))
  );

  const sortedRows = [...pupilRows].sort((a, b) => {
    if (a.subjectsTaken === 0 && b.subjectsTaken > 0) return 1;
    if (b.subjectsTaken === 0 && a.subjectsTaken > 0) return -1;
    return b.average - a.average || a.pupil.fullName.localeCompare(b.pupil.fullName);
  });

  const headerStyle = {
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    backgroundColor: '#1E3A8A',
    wrap: true,
    alignVertical: 'center' as const,
  };

  const sheet1: SheetData = [
    [
      { value: 'Pos', ...headerStyle },
      { value: 'Admission No.', ...headerStyle },
      { value: 'Pupil Name', ...headerStyle },
      { value: 'Sex', ...headerStyle },
      ...classSubjects.map((s) => ({ value: `${s.code || s.name}\n(${s.name})`, ...headerStyle })),
      { value: 'Total Score', ...headerStyle },
      { value: 'Term Average (%)', ...headerStyle },
      { value: 'Overall Grade', ...headerStyle },
      { value: 'Status', ...headerStyle },
    ],
  ];

  for (const row of sortedRows) {
    const pos = row.subjectsTaken > 0 ? rankingMap.get(row.pupil.id) || '' : '—';
    const grade = row.subjectsTaken > 0 ? resolveGrade(row.average, gradingScale).grade : '—';
    const status =
      row.subjectsTaken === 0 ? 'Pending' : row.average >= minPass ? 'Pass' : 'Needs Support';

    sheet1.push([
      { value: typeof pos === 'number' ? pos : String(pos), type: typeof pos === 'number' ? Number : String },
      { value: row.pupil.admissionNumber, type: String },
      { value: row.pupil.fullName, type: String },
      { value: row.pupil.gender === 'Female' ? 'F' : 'M', type: String },
      ...row.scores.map((sc) =>
        sc !== null ? { value: round1(sc), type: Number } : { value: '', type: String }
      ),
      { value: row.subjectsTaken > 0 ? row.total : 0, type: Number },
      { value: row.subjectsTaken > 0 ? row.average : 0, type: Number },
      { value: grade, type: String },
      { value: status, type: String },
    ]);
  }

  // Footer Row: Class Subject Averages
  const footerStyle = {
    fontWeight: 'bold' as const,
    backgroundColor: '#EEF2FF',
    color: '#1E1B4B',
  };

  const subjectAverages = classSubjects.map((_, idx) => {
    const vals = sortedRows
      .map((r) => r.scores[idx])
      .filter((v): v is number => v !== null);
    return vals.length > 0 ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  const validAvgs = sortedRows.filter((r) => r.subjectsTaken > 0).map((r) => r.average);
  const overallClassAvg =
    validAvgs.length > 0 ? round1(validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length) : 0;

  sheet1.push([
    { value: '', ...footerStyle },
    { value: '', ...footerStyle },
    { value: 'CLASS SUBJECT AVERAGES', ...footerStyle },
    { value: `${sortedRows.length}`, ...footerStyle },
    ...subjectAverages.map((avg) =>
      avg !== null
        ? { value: avg, type: Number, ...footerStyle }
        : { value: '—', type: String, ...footerStyle }
    ),
    { value: '', ...footerStyle },
    { value: overallClassAvg, type: Number, ...footerStyle },
    { value: resolveGrade(overallClassAvg, gradingScale).grade, type: String, ...footerStyle },
    { value: `${year?.name || ''} · ${term?.name || ''}`, type: String, ...footerStyle },
  ]);

  // Sheet 2: Subject Summary Analytics
  const subHeaderStyle = {
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    backgroundColor: '#0F766E',
  };

  const sheet2: SheetData = [
    [
      { value: 'Subject Code', ...subHeaderStyle },
      { value: 'Subject Name', ...subHeaderStyle },
      { value: 'Graded Pupils', ...subHeaderStyle },
      { value: 'Class Average (%)', ...subHeaderStyle },
      { value: 'Highest Score', ...subHeaderStyle },
      { value: 'Lowest Score', ...subHeaderStyle },
      { value: `Pass Rate (>=${minPass}%)`, ...subHeaderStyle },
    ],
  ];

  classSubjects.forEach((subj, idx) => {
    const vals = sortedRows
      .map((r) => r.scores[idx])
      .filter((v): v is number => v !== null);
    const avg = vals.length > 0 ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    const high = vals.length > 0 ? round1(Math.max(...vals)) : 0;
    const low = vals.length > 0 ? round1(Math.min(...vals)) : 0;
    const passPct =
      vals.length > 0 ? round1((vals.filter((v) => v >= minPass).length / vals.length) * 100) : 0;
    sheet2.push([
      { value: subj.code || '—', type: String },
      { value: subj.name, type: String },
      { value: vals.length, type: Number },
      { value: avg, type: Number },
      { value: high, type: Number },
      { value: low, type: Number },
      { value: `${passPct}%`, type: String },
    ]);
  });

  const fileName = `${slug(schoolName)}_${slug(cls.name)}_${slug(term?.name || 'Term')}_Broadsheet.xlsx`;
  await writeXlsxFile([
    {
      sheet: 'Master Broadsheet',
      data: sheet1,
      stickyRowsCount: 1,
      orientation: 'landscape',
      columns: [
        { width: 7 },
        { width: 18 },
        { width: 26 },
        { width: 6 },
        ...classSubjects.map(() => ({ width: 13 })),
        { width: 13 },
        { width: 16 },
        { width: 13 },
        { width: 16 },
      ],
    },
    {
      sheet: 'Subject Analytics',
      data: sheet2,
      stickyRowsCount: 1,
      columns: [
        { width: 14 },
        { width: 28 },
        { width: 15 },
        { width: 18 },
        { width: 15 },
        { width: 15 },
        { width: 18 },
      ],
    },
  ]).toFile(fileName);

  return sortedRows.length;
}

// ---------------------------------------------------------------------------
// 2. Printable Paper-to-Digital PDF Packs (Mark Sheet, Attendance, Login Slips)
// ---------------------------------------------------------------------------

export function downloadBlankMarkSheetPdf(params: {
  schoolName: string;
  academicYearName: string;
  termName: string;
  schoolClass: SchoolClass;
  subject: Subject;
  pupils: Pupil[];
  config?: AssessmentConfig;
}): void {
  const { schoolName, academicYearName, termName, schoolClass, subject, pupils, config } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  const components = config?.caComponents || [
    { id: 'c1', name: 'Exercises', maxScore: 20 },
    { id: 'c2', name: 'Homework', maxScore: 20 },
    { id: 'c3', name: 'Class Test', maxScore: 20 },
    { id: 'c4', name: 'Project', maxScore: 20 },
  ];
  const caWeight = config?.caWeight ?? 50;
  const examWeight = config?.examWeight ?? 50;
  const examMax = config?.examMaxScore ?? 100;

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(30, 58, 138);
    doc.rect(margin, 10, pageW - margin * 2, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(schoolName.toUpperCase(), margin + 4, 16.5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `OFFICIAL PAPER ASSESSMENT MARK SHEET  |  ${academicYearName} · ${termName}  |  Page ${pageNum}`,
      margin + 4,
      22.5
    );

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`Class: ${schoolClass.name} (${schoolClass.basicLabel})`, margin, 32);
    doc.text(`Subject: ${subject.name} (${subject.code})`, margin + 68, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Weighting: SBA ${caWeight}% + Exam ${examWeight}% (Exam Max ${examMax})   |   Teacher: ___________________________`,
      margin,
      37.5
    );
  };

  let pageNum = 1;
  drawHeader(pageNum);

  const colNo = 7;
  const colAdm = components.length > 4 ? 22 : 26;
  const colName = components.length > 4 ? 46 : 56;
  const remaining = pageW - margin * 2 - colNo - colAdm - colName;
  const dynamicCols = components.length + 3; // comps + CA% + Exam + Total
  const dynW = remaining / dynamicCols;

  const drawTableHeader = (y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(148, 163, 184);
    doc.rect(margin, y, pageW - margin * 2, 9, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(30, 41, 59);

    let x = margin;
    doc.text('#', x + 2, y + 5.8);
    x += colNo;
    doc.text('Adm. No.', x + 1.5, y + 5.8);
    x += colAdm;
    doc.text('Pupil Full Name', x + 1.5, y + 5.8);
    x += colName;

    for (const c of components) {
      const shortName = c.name.length > 9 ? `${c.name.slice(0, 8)}.` : c.name;
      doc.text(`${shortName}`, x + 1, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(`/${c.maxScore}`, x + 1, y + 7.5);
      doc.setFont('helvetica', 'bold');
      x += dynW;
    }
    doc.text(`SBA`, x + 1, y + 4);
    doc.text(`${caWeight}%`, x + 1, y + 7.5);
    x += dynW;
    doc.text('Exam', x + 1, y + 4);
    doc.text(`/${examMax}`, x + 1, y + 7.5);
    x += dynW;
    doc.text('Total', x + 1, y + 4);
    doc.text('100%', x + 1, y + 7.5);
    return y + 9;
  };

  let y = drawTableHeader(41);
  const rowH = 7.4;

  const sortedPupils = [...pupils].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const totalRows = Math.max(sortedPupils.length, 20);

  for (let i = 0; i < totalRows; i++) {
    if (y + rowH > 274) {
      doc.addPage();
      pageNum++;
      drawHeader(pageNum);
      y = drawTableHeader(41);
    }

    const pupil = sortedPupils[i];
    doc.setDrawColor(203, 213, 225);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    let x = margin;
    doc.rect(x, y, colNo, rowH);
    doc.text(String(i + 1), x + 2, y + 5);
    x += colNo;

    doc.rect(x, y, colAdm, rowH);
    if (pupil) doc.text(pupil.admissionNumber.slice(0, 14), x + 1.5, y + 5);
    x += colAdm;

    doc.rect(x, y, colName, rowH);
    if (pupil) doc.text(pupil.fullName.slice(0, 30), x + 1.5, y + 5);
    x += colName;

    for (let k = 0; k < dynamicCols; k++) {
      doc.rect(x, y, dynW, rowH);
      x += dynW;
    }
    y += rowH;
  }

  // Signature footer
  const sigY = Math.min(284, y + 10);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Teacher Signature & Date: __________________________', margin, sigY);
  doc.text('Headteacher / Academic Coord.: __________________________', pageW - margin - 82, sigY);

  doc.save(`${slug(schoolName)}_${slug(schoolClass.name)}_${slug(subject.name)}_MarkSheet.pdf`);
}

export function downloadAttendanceRegisterPdf(params: {
  schoolName: string;
  academicYearName: string;
  termName: string;
  schoolClass: SchoolClass;
  pupils: Pupil[];
}): void {
  const { schoolName, academicYearName, termName, schoolClass, pupils } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  const weeks = 12;
  const colNo = 8;
  const colAdm = 26;
  const colName = 56;
  const colSex = 10;
  const colTotal = 18;
  const colConduct = 42;
  const weekW = (pageW - margin * 2 - colNo - colAdm - colName - colSex - colTotal - colConduct) / weeks;

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(15, 118, 110);
    doc.rect(margin, 8, pageW - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(`${schoolName.toUpperCase()} — HYBRID ATTENDANCE & CONDUCT REGISTER`, margin + 4, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Class: ${schoolClass.name} (${schoolClass.basicLabel})   |   ${academicYearName} · ${termName}   |   Page ${pageNum}`,
      margin + 4,
      19.5
    );
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(148, 163, 184);
    doc.rect(margin, y, pageW - margin * 2, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    let x = margin;
    doc.text('#', x + 2, y + 5.2);
    x += colNo;
    doc.text('Adm. No.', x + 1.5, y + 5.2);
    x += colAdm;
    doc.text('Pupil Name', x + 1.5, y + 5.2);
    x += colName;
    doc.text('Sex', x + 2, y + 5.2);
    x += colSex;
    for (let w = 1; w <= weeks; w++) {
      doc.text(`W${w}`, x + 2.5, y + 5.2);
      x += weekW;
    }
    doc.text('Total', x + 3, y + 5.2);
    x += colTotal;
    doc.text('Conduct / Remarks', x + 2, y + 5.2);
    return y + 8;
  };

  let pageNum = 1;
  drawHeader(pageNum);
  let y = drawTableHeader(26);
  const rowH = 7;

  const sortedPupils = [...pupils].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const totalRows = Math.max(sortedPupils.length, 20);

  for (let i = 0; i < totalRows; i++) {
    if (y + rowH > 194) {
      doc.addPage();
      pageNum++;
      drawHeader(pageNum);
      y = drawTableHeader(26);
    }
    const pupil = sortedPupils[i];
    doc.setDrawColor(203, 213, 225);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);

    let x = margin;
    doc.rect(x, y, colNo, rowH);
    doc.text(String(i + 1), x + 2, y + 4.8);
    x += colNo;

    doc.rect(x, y, colAdm, rowH);
    if (pupil) doc.text(pupil.admissionNumber.slice(0, 14), x + 1.5, y + 4.8);
    x += colAdm;

    doc.rect(x, y, colName, rowH);
    if (pupil) doc.text(pupil.fullName.slice(0, 30), x + 1.5, y + 4.8);
    x += colName;

    doc.rect(x, y, colSex, rowH);
    if (pupil) doc.text(pupil.gender === 'Female' ? 'F' : 'M', x + 3.5, y + 4.8);
    x += colSex;

    for (let w = 0; w < weeks; w++) {
      doc.rect(x, y, weekW, rowH);
      x += weekW;
    }

    doc.rect(x, y, colTotal, rowH);
    x += colTotal;
    doc.rect(x, y, colConduct, rowH);
    y += rowH;
  }

  doc.save(`${slug(schoolName)}_${slug(schoolClass.name)}_Attendance_Register.pdf`);
}

export function downloadParentLoginSlipsPdf(params: {
  schoolName: string;
  schoolCode?: string;
  portalUrl: string;
  schoolClass?: SchoolClass;
  pupils: Pupil[];
  parentPasswordStatus?: Record<string, boolean>;
}): void {
  const { schoolName, schoolCode, portalUrl, schoolClass, pupils, parentPasswordStatus } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const gapX = 6;
  const gapY = 6;
  const cardW = (pageW - margin * 2 - gapX) / 2;
  const cardH = 62;

  const sorted = [...pupils].sort((a, b) => a.fullName.localeCompare(b.fullName));
  sorted.forEach((pupil, idx) => {
    const slotOnPage = idx % 8;
    if (idx > 0 && slotOnPage === 0) {
      doc.addPage();
    }
    const col = slotOnPage % 2;
    const row = Math.floor(slotOnPage / 2);
    const x = margin + col * (cardW + gapX);
    const y = margin + row * (cardH + gapY);

    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.roundedRect(x, y, cardW, cardH, 3, 3);
    doc.setLineDashPattern([], 0);

    // Header band
    doc.setFillColor(49, 46, 129);
    doc.rect(x + 1, y + 1, cardW - 2, 11, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(schoolName.slice(0, 38).toUpperCase(), x + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      `PARENT PORTAL ACCESS SLIP${schoolCode ? ` · CODE: ${schoolCode}` : ''}`,
      x + 4,
      y + 10
    );

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(pupil.fullName.slice(0, 34), x + 4, y + 18.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Class: ${pupil.currentClassName || schoolClass?.name || '—'}`, x + 4, y + 24);
    doc.text(`Guardian: ${(pupil.guardianName || 'Parent / Guardian').slice(0, 30)}`, x + 4, y + 29);

    // Highlight box for registration number
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x + 4, y + 32, cardW - 8, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text(`Registration No.: ${pupil.admissionNumber}`, x + 6.5, y + 37.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    const hasKey = Boolean(parentPasswordStatus?.[pupil.id]);
    doc.text(
      `Parent Key: ${hasKey ? 'Active (Issued by School Office)' : 'Request Key at School Office'}`,
      x + 6.5,
      y + 42
    );

    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    const cleanUrl = portalUrl.replace(/^https?:\/\//, '').slice(0, 48);
    doc.text(`1. Visit: ${cleanUrl}`, x + 4, y + 49);
    doc.text('2. Select "Parent" tab & enter Registration No. + Password.', x + 4, y + 53.5);
    doc.text('3. View termly report cards, analytics & reopening dates.', x + 4, y + 58);
  });

  const scopeName = schoolClass ? slug(schoolClass.name) : 'All_Classes';
  doc.save(`${slug(schoolName)}_${scopeName}_Parent_Login_Slips.pdf`);
}

// ---------------------------------------------------------------------------
// 3. Bulk Teacher Directory Excel Template & Importer
// ---------------------------------------------------------------------------

export interface ParsedTeacherImportRow {
  rowNumber: number;
  fullName: string;
  staffId: string;
  email: string;
  phone: string;
  teacherType: 'CLASS' | 'JHS';
  assignedClassIds: string[];
  assignedClassNames: string[];
  assignedSubjectIds: string[];
  assignedSubjectNames: string[];
  jhsAssignments: JhsAssignment[];
  isActive: boolean;
  existingTeacherId: string | null;
  errors: string[];
}

export async function downloadTeacherTemplateXlsx(params: {
  schoolName: string;
  classes: SchoolClass[];
  subjects: Subject[];
}): Promise<void> {
  const sortedClasses = [...params.classes].sort((a, b) => a.sortOrder - b.sortOrder);
  const jhsSubjects = params.subjects
    .filter((s) => s.applicableLevels.includes('JHS'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const headerStyle = {
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    backgroundColor: '#0F766E',
    wrap: true,
    alignVertical: 'center' as const,
  };

  const sheet1: SheetData = [
    [
      'Full Name *',
      'Staff ID',
      'Teacher Type * (CLASS or JHS)',
      'Email Address',
      'Phone Number',
      'Assigned Classes (comma-separated)',
      'Assigned JHS Subjects (comma-separated, JHS only)',
      'Status (Active/Inactive)',
    ].map((h) => ({ value: h, ...headerStyle })),
    [
      { value: 'Gifty Owusu-Ansah', type: String },
      { value: 'STF-201', type: String },
      { value: 'CLASS', type: String },
      { value: 'gifty.owusu@school.edu.gh', type: String },
      { value: '0244556677', type: String },
      { value: sortedClasses.find((c) => c.levelCategory === 'PRIMARY')?.name || 'Primary 1', type: String },
      { value: '', type: String },
      { value: 'Active', type: String },
    ],
    [
      { value: 'Daniel Mensah', type: String },
      { value: 'STF-202', type: String },
      { value: 'JHS', type: String },
      { value: 'daniel.mensah@school.edu.gh', type: String },
      { value: '0551239876', type: String },
      { value: 'JHS 1, JHS 2, JHS 3', type: String },
      {
        value: jhsSubjects.slice(0, 2).map((s) => s.name).join(', ') || 'Mathematics, Integrated Science',
        type: String,
      },
      { value: 'Active', type: String },
    ],
  ];

  const guideHeader = {
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    backgroundColor: '#1E3A8A',
  };
  const sheet2: SheetData = [
    [
      { value: 'Valid Classes', ...guideHeader },
      { value: 'Category', ...guideHeader },
      { value: 'Valid JHS Subjects', ...guideHeader },
      { value: 'Subject Code', ...guideHeader },
    ],
  ];

  const rowsCount = Math.max(sortedClasses.length, jhsSubjects.length);
  for (let i = 0; i < rowsCount; i++) {
    const cls = sortedClasses[i];
    const sub = jhsSubjects[i];
    sheet2.push([
      { value: cls?.name || '', type: String },
      { value: cls?.levelCategory || '', type: String },
      { value: sub?.name || '', type: String },
      { value: sub?.code || '', type: String },
    ]);
  }

  await writeXlsxFile([
    {
      sheet: 'Teacher Roster',
      data: sheet1,
      stickyRowsCount: 1,
      columns: [
        { width: 26 },
        { width: 14 },
        { width: 26 },
        { width: 28 },
        { width: 16 },
        { width: 32 },
        { width: 38 },
        { width: 18 },
      ],
    },
    {
      sheet: 'Classes & JHS Subjects',
      data: sheet2,
      stickyRowsCount: 1,
      columns: [{ width: 20 }, { width: 14 }, { width: 30 }, { width: 14 }],
    },
  ]).toFile(`${slug(params.schoolName)}_Teacher_Roster_Template.xlsx`);
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export async function parseTeacherImportFile(params: {
  file: File;
  classes: SchoolClass[];
  subjects: Subject[];
  existingTeachers: TeacherAccount[];
}): Promise<ParsedTeacherImportRow[]> {
  const isCsv = params.file.name.toLowerCase().endsWith('.csv');
  const rawRows: unknown[][] = isCsv
    ? parseCsvRows(await params.file.text())
    : await readSheet(params.file);

  if (!rawRows || rawRows.length < 2) {
    throw new Error('The teacher file appears to be empty.');
  }

  const headers = (rawRows[0] || []).map((h) => String(h ?? '').toLowerCase().trim());
  const findCol = (keys: string[]) =>
    headers.findIndex((h) => keys.some((k) => h.includes(k)));

  const idxName = findCol(['full name', 'teacher name', 'name']);
  const idxStaffId = findCol(['staff id', 'staff no', 'employee']);
  const idxType = findCol(['teacher type', 'type', 'role']);
  const idxEmail = findCol(['email']);
  const idxPhone = findCol(['phone', 'tel', 'contact']);
  const idxClasses = findCol(['assigned class', 'class']);
  const idxSubjects = findCol(['subject']);
  const idxStatus = findCol(['status']);

  if (idxName < 0) {
    throw new Error('Could not find a "Full Name" column. Please use the Teacher Roster Template.');
  }

  const classMap = new Map<string, SchoolClass>();
  for (const c of params.classes) {
    classMap.set(compactKey(c.id), c);
    classMap.set(compactKey(c.name), c);
    if (c.basicLabel) classMap.set(compactKey(c.basicLabel), c);
  }

  const subjectMap = new Map<string, Subject>();
  for (const s of params.subjects) {
    subjectMap.set(compactKey(s.id), s);
    subjectMap.set(compactKey(s.name), s);
    if (s.code) subjectMap.set(compactKey(s.code), s);
  }

  const jhsClasses = params.classes.filter((c) => c.levelCategory === 'JHS');
  const existingByKey = new Map<string, TeacherAccount>();
  for (const t of params.existingTeachers) {
    if (t.staffId) existingByKey.set(`id:${t.staffId.trim().toLowerCase()}`, t);
    existingByKey.set(`name:${t.fullName.trim().toLowerCase()}`, t);
  }

  const results: ParsedTeacherImportRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const fullName = String(row[idxName] ?? '').trim();
    const staffId = idxStaffId >= 0 ? String(row[idxStaffId] ?? '').trim() : '';
    const rawType = idxType >= 0 ? String(row[idxType] ?? '').trim().toUpperCase() : 'CLASS';
    const email = idxEmail >= 0 ? String(row[idxEmail] ?? '').trim() : '';
    const phone = idxPhone >= 0 ? String(row[idxPhone] ?? '').trim() : '';
    const rawClasses = idxClasses >= 0 ? String(row[idxClasses] ?? '').trim() : '';
    const rawSubjects = idxSubjects >= 0 ? String(row[idxSubjects] ?? '').trim() : '';
    const rawStatus = idxStatus >= 0 ? String(row[idxStatus] ?? '').trim().toLowerCase() : 'active';

    if (!fullName && !staffId && !email) continue;

    const errors: string[] = [];
    if (!fullName) errors.push('Missing Full Name');

    const teacherType: 'CLASS' | 'JHS' =
      rawType.includes('JHS') || rawType.includes('SUBJECT') ? 'JHS' : 'CLASS';

    const classTokens = rawClasses
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const matchedClasses: SchoolClass[] = [];
    for (const tok of classTokens) {
      const m = classMap.get(compactKey(tok));
      if (m) {
        if (!matchedClasses.some((x) => x.id === m.id)) matchedClasses.push(m);
      } else {
        errors.push(`Unknown class "${tok}"`);
      }
    }

    const subjTokens = rawSubjects
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const matchedSubjects: Subject[] = [];
    for (const tok of subjTokens) {
      const m = subjectMap.get(compactKey(tok));
      if (m) {
        if (!matchedSubjects.some((x) => x.id === m.id)) matchedSubjects.push(m);
      } else {
        errors.push(`Unknown subject "${tok}"`);
      }
    }

    let jhsAssignments: JhsAssignment[] = [];
    let finalClassIds = matchedClasses.map((c) => c.id);
    let finalClassNames = matchedClasses.map((c) => c.name);

    if (teacherType === 'JHS') {
      const targetJhsClasses =
        matchedClasses.filter((c) => c.levelCategory === 'JHS').length > 0
          ? matchedClasses.filter((c) => c.levelCategory === 'JHS')
          : jhsClasses;
      finalClassIds = targetJhsClasses.map((c) => c.id);
      finalClassNames = targetJhsClasses.map((c) => c.name);
      jhsAssignments = targetJhsClasses.flatMap((c) =>
        matchedSubjects.map((s) => ({ classId: c.id, subjectId: s.id }))
      );
      if (matchedSubjects.length === 0) {
        errors.push('JHS teacher needs at least 1 assigned JHS subject');
      }
    }

    const existing =
      (staffId ? existingByKey.get(`id:${staffId.toLowerCase()}`) : undefined) ||
      existingByKey.get(`name:${fullName.toLowerCase()}`) ||
      null;

    results.push({
      rowNumber: i + 1,
      fullName: fullName || '(Unnamed)',
      staffId,
      email,
      phone,
      teacherType,
      assignedClassIds: finalClassIds,
      assignedClassNames: finalClassNames,
      assignedSubjectIds: teacherType === 'JHS' ? matchedSubjects.map((s) => s.id) : [],
      assignedSubjectNames: teacherType === 'JHS' ? matchedSubjects.map((s) => s.name) : [],
      jhsAssignments,
      isActive: rawStatus !== 'inactive',
      existingTeacherId: existing?.id || null,
      errors,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. Hybrid Guardian SMS & WhatsApp Result Dispatch
// ---------------------------------------------------------------------------

export interface GuardianDispatchRow {
  pupil: Pupil;
  report: ReportCard | null;
  phoneClean: string;
  whatsappHref: string | null;
  message: string;
  averageLabel: string;
  positionLabel: string;
  verificationCode: string;
}

export function formatWhatsAppPhone(phone: string | undefined, defaultCountryCode = '233'): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 7) return null;
  if (digits.startsWith('0') && digits.length === 10) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  return digits;
}

export function formatPhoneForSms(phone: string | undefined, defaultCountryCode = '233'): string | null {
  const normalized = formatWhatsAppPhone(phone, defaultCountryCode);
  return normalized ? `+${normalized}` : null;
}

export function buildCredentialSmsHref(
  phone: string | undefined,
  message: string,
  defaultCountryCode = '233'
): string | null {
  const e164 = formatPhoneForSms(phone, defaultCountryCode);
  if (!e164) return null;
  return `sms:${e164}?body=${encodeURIComponent(message)}`;
}

export function buildCredentialWhatsAppHref(
  phone: string | undefined,
  message: string,
  defaultCountryCode = '233'
): string | null {
  const wa = formatWhatsAppPhone(phone, defaultCountryCode);
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}

export function buildGuardianDispatchRows(params: {
  store: SchoolStoreState;
  classId: string;
  academicYearId: string;
  termId: string;
  countryCode?: string;
}): GuardianDispatchRow[] {
  const { store, classId, academicYearId, termId, countryCode = '233' } = params;
  const schoolName = store.settings?.schoolName || store.school?.name || 'Basic School';
  const term: Term | undefined = store.terms.find((t) => t.id === termId);
  const year = store.academicYears.find((y) => y.id === academicYearId);
  const cls = store.classes.find((c) => c.id === classId);

  const classPupils = store.pupils
    .filter((p) => p.currentClassId === classId && p.enrollmentStatus === 'Active')
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return classPupils.map((pupil) => {
    const report =
      store.reportCards.find(
        (r) =>
          r.pupilId === pupil.id &&
          r.academicYearId === academicYearId &&
          r.termId === termId
      ) || null;

    const isKgComp = report?.assessmentMode === 'COMPETENCY';
    const avgVal = report?.overallAverage;
    const averageLabel =
      avgVal !== undefined
        ? isKgComp
          ? `${avgVal.toFixed(1)}/4.0`
          : `${avgVal.toFixed(1)}%`
        : 'Pending';

    const positionLabel =
      report?.classPosition && report?.totalPupilsInClass
        ? `${report.classPosition} of ${report.totalPupilsInClass}`
        : '—';

    const verificationCode = report
      ? computeReportVerificationCode(report, store.school?.code)
      : '—';

    const guardianGreeting = pupil.guardianName ? `Dear ${pupil.guardianName},` : 'Dear Parent/Guardian,';
    const reopening = report?.reopeningDate || term?.reopeningDate || '';
    const attendance =
      report?.attendancePresent !== undefined && report?.attendanceTotal
        ? ` Attendance: ${report.attendancePresent}/${report.attendanceTotal} days.`
        : '';

    const message = report
      ? `${guardianGreeting} ${schoolName} ${term?.name || 'Term'} (${year?.name || ''}) report for ${pupil.fullName} (${cls?.name || pupil.currentClassName || ''}, Reg: ${pupil.admissionNumber}): Overall Average ${averageLabel}${
          positionLabel !== '—' ? `, Position ${positionLabel}` : ''
        }.${attendance}${reopening ? ` Reopening: ${reopening}.` : ''} Verify ID: ${verificationCode}. Sign in to the Parent Portal for the full A4 report card.`
      : `${guardianGreeting} ${schoolName} reminder for ${pupil.fullName} (${cls?.name || pupil.currentClassName || ''}, Reg: ${pupil.admissionNumber}): ${term?.name || 'Term'} report card is being finalized and will be available on the Parent Portal shortly.`;

    const waPhone = formatWhatsAppPhone(pupil.guardianPhone, countryCode);
    const whatsappHref = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
      : null;

    return {
      pupil,
      report,
      phoneClean: pupil.guardianPhone || '',
      whatsappHref,
      message,
      averageLabel,
      positionLabel,
      verificationCode,
    };
  });
}

export async function downloadGuardianSmsExcel(params: {
  schoolName: string;
  className: string;
  termName: string;
  rows: GuardianDispatchRow[];
}): Promise<void> {
  const headerStyle = {
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    backgroundColor: '#1E3A8A',
  };

  const sheetData: SheetData = [
    [
      'Guardian Name',
      'Guardian Phone',
      'Pupil Name',
      'Admission No.',
      'Class',
      'Average',
      'Position',
      'Verification ID',
      'SMS / WhatsApp Message',
    ].map((h) => ({ value: h, ...headerStyle })),
    ...params.rows.map((r) => [
      { value: r.pupil.guardianName || 'Parent / Guardian', type: String },
      { value: r.phoneClean || '', type: String },
      { value: r.pupil.fullName, type: String },
      { value: r.pupil.admissionNumber, type: String },
      { value: params.className, type: String },
      { value: r.averageLabel, type: String },
      { value: r.positionLabel, type: String },
      { value: r.verificationCode, type: String },
      { value: r.message, type: String },
    ]),
  ];

  await writeXlsxFile(sheetData, {
    sheet: 'Guardian SMS Dispatch',
    stickyRowsCount: 1,
    columns: [
      { width: 22 },
      { width: 16 },
      { width: 24 },
      { width: 18 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 18 },
      { width: 78 },
    ],
  }).toFile(`${slug(params.schoolName)}_${slug(params.className)}_${slug(params.termName)}_SMS_Dispatch.xlsx`);
}
