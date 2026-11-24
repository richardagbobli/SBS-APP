import { jsPDF } from 'jspdf';
import {
  computeReportVerificationCode,
  formatOrdinal,
  PromotionListClassGroup,
  ReportCardPerformanceAnalysis,
} from './calculations';
import { ReportCard, SchoolSettings } from '../types';

function hexToRgb(hex?: string): [number, number, number] {
  const clean = (hex || '#14532D').replace('#', '');
  if (clean.length !== 6) return [20, 83, 45];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [20, 83, 45];
  return [r, g, b];
}

interface PdfImageAsset {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
}

function normalizeDataUrlForPdf(rawDataUrl: string): Promise<PdfImageAsset | null> {
  if (rawDataUrl.startsWith('data:image/png')) {
    return Promise.resolve({ dataUrl: rawDataUrl, format: 'PNG' });
  }
  if (rawDataUrl.startsWith('data:image/jpeg') || rawDataUrl.startsWith('data:image/jpg')) {
    return Promise.resolve({ dataUrl: rawDataUrl, format: 'JPEG' });
  }
  // Convert WebP or other browser-supported formats to PNG via canvas for reliable jsPDF rendering
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = rawDataUrl;
  });
}

async function loadImageForPdf(url?: string): Promise<PdfImageAsset | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    return normalizeDataUrlForPdf(url);
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
    return normalizeDataUrlForPdf(rawDataUrl);
  } catch {
    return null;
  }
}

function drawPageFrame(doc: jsPDF, primary: [number, number, number]) {
  const pageW = 210;
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pageW - 16, 281);
}

function drawPageWatermark(doc: jsPDF, settings: SchoolSettings | null) {
  if (!settings?.showWatermark) return;
  const label = (settings.watermarkText || settings.schoolName || 'OFFICIAL COPY').trim();
  if (!label) return;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(232, 238, 245);
  doc.text(label.toUpperCase().slice(0, 32), 105, 160, {
    align: 'center',
    angle: 38,
  });
}

async function renderReportCardPage(
  doc: jsPDF,
  report: ReportCard,
  settings: SchoolSettings | null,
  logoAsset: PdfImageAsset | null,
  photoAsset: PdfImageAsset | null,
  analysis?: ReportCardPerformanceAnalysis | null,
  signatureAsset?: PdfImageAsset | null,
  stampAsset?: PdfImageAsset | null,
  teacherSignatureAsset?: PdfImageAsset | null,
  parentSignatureAsset?: PdfImageAsset | null,
  schoolCode?: string
) {
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;
  const primary = hexToRgb(settings?.primaryColor);
  const accent = hexToRgb(settings?.accentColor || '#B45309');

  const showSchoolLogo = settings?.showSchoolLogo ?? true;
  const showSchoolMotto = settings?.showSchoolMotto ?? true;
  const showPerformanceAnalysis = settings?.showPerformanceAnalysis ?? true;
  const showTermComparison = settings?.showTermComparison ?? true;
  const showVerificationCode = settings?.showVerificationCode ?? true;
  const headerStyle = settings?.reportHeaderStyle || 'classic';

  drawPageWatermark(doc, settings);
  drawPageFrame(doc, primary);

  const ensureSpace = (neededMm: number, currentY: number): number => {
    if (currentY + neededMm <= 278) return currentY;
    doc.addPage();
    drawPageWatermark(doc, settings);
    drawPageFrame(doc, primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primary);
    doc.text(
      `${(settings?.schoolName || 'BASIC SCHOOL').toUpperCase()} — ${report.pupilName || 'Pupil'} (${report.termName || ''}) [Continued]`,
      margin,
      15
    );
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 17, pageW - margin, 17);
    return 21;
  };

  // Header band
  if (headerStyle === 'minimal') {
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.6);
    doc.rect(margin, margin, contentW, 24);
  } else {
    doc.setFillColor(...primary);
    doc.rect(margin, margin, contentW, 24, 'F');
  }

  if (showSchoolLogo && logoAsset) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 3, margin + 2, 20, 20, 2, 2, 'F');
      doc.addImage(logoAsset.dataUrl, logoAsset.format, margin + 4, margin + 3, 18, 18);
    } catch {
      // ignore invalid logo format
    }
  }

  if (headerStyle === 'minimal') {
    doc.setTextColor(...primary);
  } else {
    doc.setTextColor(255, 255, 255);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((settings?.schoolName || 'BASIC SCHOOL REPORT').toUpperCase(), pageW / 2, margin + 9, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (showSchoolMotto && settings?.schoolMotto) {
    doc.text(`"${settings.schoolMotto}"`, pageW / 2, margin + 14, { align: 'center' });
  }
  doc.text(
    [settings?.schoolAddress, settings?.schoolTelephone].filter(Boolean).join(' · '),
    pageW / 2,
    margin + 19.5,
    { align: 'center' }
  );

  // Subtitle Banner
  let y = margin + 27;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const isCompetencyReport =
    report.assessmentMode === 'COMPETENCY' ||
    (report.assessmentMode !== 'NUMERIC_SBA' && report.levelCategory === 'KG');

  const showPhoto = settings?.showPupilPhoto ?? true;
  const showAttendance = settings?.showAttendance ?? true;
  const showClassAverage = settings?.showClassAverage ?? true;
  const showSubjectRemarks = settings?.showSubjectRemarks ?? true;
  const showGradingKey = settings?.showGradingKey ?? true;
  const showPersonality = settings?.showPersonalitySection ?? true;
  const showPromotion = settings?.showPromotionSection ?? true;
  const showReopening = settings?.showReopeningDate ?? true;

  const subtitle =
    settings?.reportCardTitle?.trim().toUpperCase() ||
    (report.levelCategory === 'KG'
      ? isCompetencyReport
        ? 'KINDERGARTEN COMPETENCY & DEVELOPMENTAL REPORT'
        : 'KINDERGARTEN SBA & EXAMINATION TERMINAL REPORT'
      : report.levelCategory === 'JHS'
      ? 'JUNIOR HIGH SCHOOL TERMINAL REPORT CARD'
      : 'PRIMARY SCHOOL TERMINAL REPORT CARD');
  doc.text(subtitle, pageW / 2, y + 5.5, { align: 'center' });

  // Pupil Bio & Photo Row
  y += 11;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentW - (showPhoto ? 26 : 0), 26);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  const col1X = margin + 3;
  const col2X = margin + 84;
  const col1ValMaxW = 50;
  const col2ValMaxW = showPhoto ? 44 : 68;
  const drawField = (label: string, val: string, x: number, rowY: number, maxW: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, x, rowY);
    doc.setFont('helvetica', 'normal');
    const fitted = doc.splitTextToSize(val || '-', maxW)[0] || '-';
    doc.text(fitted, x + 28, rowY);
  };

  drawField('Pupil Name', report.pupilName || '-', col1X, y + 6, col1ValMaxW);
  drawField('Admission No', report.admissionNumber || '-', col1X, y + 12, col1ValMaxW);
  drawField('Class', report.className || '-', col1X, y + 18, col1ValMaxW);
  drawField('Gender', report.gender || '-', col1X, y + 24, col1ValMaxW);

  drawField('Academic Year', report.academicYearName || '-', col2X, y + 6, col2ValMaxW);
  drawField('Term', report.termName || '-', col2X, y + 12, col2ValMaxW);
  if (showAttendance) {
    drawField(
      'Attendance',
      `${report.attendancePresent ?? 0} / ${report.attendanceTotal ?? 0} Days`,
      col2X,
      y + 18,
      col2ValMaxW
    );
  }
  if (showReopening) {
    drawField('Reopening Date', report.reopeningDate || '-', col2X, y + 24, col2ValMaxW);
  }

  if (showPhoto) {
    const photoX = margin + contentW - 24;
    doc.rect(photoX, y, 24, 26);
    if (photoAsset) {
      try {
        doc.addImage(photoAsset.dataUrl, photoAsset.format, photoX + 1, y + 1, 22, 24);
      } catch {
        doc.setFontSize(7);
        doc.text('PHOTO', photoX + 12, y + 14, { align: 'center' });
      }
    } else {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('NO PHOTO', photoX + 12, y + 14, { align: 'center' });
    }
  }

  y += 30;

  // Academic Section
  if (isCompetencyReport) {
    doc.setFillColor(...primary);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('LEARNING AREA', margin + 2, y + 5);
    doc.text('COMPETENCY RATING', margin + 68, y + 5);
    doc.text('TEACHER OBSERVATION', margin + 115, y + 5);
    y += 7;

    const areas = report.kgSnapshots || [];
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      const rowH = 9.5;
      y = ensureSpace(rowH + 4, y);
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentW, rowH);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(a.areaName.slice(0, 34), margin + 2, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.text((a.ratingLabel || String(a.overallRating)).slice(0, 26), margin + 68, y + 6);
      doc.text((a.comment || '-').slice(0, 42), margin + 115, y + 6);
      y += rowH;
    }

    if (showGradingKey) {
      y += 2.5;
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        'Scale Key: 4 - Exceeding Expectations · 3 - Meeting Expectations · 2 - Approaching Expectations · 1 - Needs Support',
        margin,
        y + 3
      );
      y += 6.5;
    } else {
      y += 4;
    }
  } else {
    // Primary & JHS Subject Table
    doc.setFillColor(...primary);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SUBJECT', margin + 2, y + 5);
    doc.text('CA', margin + 58, y + 5, { align: 'right' });
    doc.text('EXAM', margin + 74, y + 5, { align: 'right' });
    doc.text('TOTAL', margin + 91, y + 5, { align: 'right' });
    doc.text('GRADE', margin + 106, y + 5, { align: 'center' });
    doc.text('DESCRIPTION', margin + 118, y + 5);
    if (showSubjectRemarks) {
      doc.text('REMARK', margin + 148, y + 5);
    }
    y += 7;

    const subjects = report.subjectSnapshots || [];
    for (let i = 0; i < subjects.length; i++) {
      const s = subjects[i];
      const rowH = 7;
      y = ensureSpace(rowH + 4, y);
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentW, rowH);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(s.subjectName.slice(0, 28), margin + 2, y + 4.8);
      doc.text(s.caContribution.toFixed(1), margin + 58, y + 4.8, { align: 'right' });
      doc.text(s.examContribution.toFixed(1), margin + 74, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(s.totalScore.toFixed(1), margin + 91, y + 4.8, { align: 'right' });
      doc.text(s.grade, margin + 106, y + 4.8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text((s.gradeDescription || '').slice(0, 16), margin + 118, y + 4.8);
      if (showSubjectRemarks) {
        doc.text((s.subjectRemark || '').slice(0, 22), margin + 148, y + 4.8);
      }
      y += rowH;
    }

    // Overall summary strip
    y += 2.5;
    y = ensureSpace(14, y);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 9.5, 'F');
    doc.setDrawColor(...accent);
    doc.rect(margin, y, contentW, 9.5);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      `Overall Average: ${(report.overallAverage ?? 0).toFixed(1)}%`,
      margin + 4,
      y + 6.2
    );
    if (showClassAverage) {
      doc.text(
        `Class Average: ${(report.classAverage ?? 0).toFixed(1)}%`,
        margin + 68,
        y + 6.2
      );
    }
    if (settings?.showPositionRanking && report.classPosition) {
      doc.text(
        `Position in Class: ${formatOrdinal(report.classPosition)} of ${report.totalPupilsInClass ?? '-'}`,
        margin + 126,
        y + 6.2
      );
    }
    y += 12.5;
  }

  // Academic Performance Analysis & Multi-Term Comparison Section
  if (showPerformanceAnalysis && analysis && analysis.totalCount > 0) {
    const baseHeight = analysis.comparisonMode !== 'NONE' ? 28 : 16;
    y = ensureSpace(baseHeight, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primary);
    doc.text('ACADEMIC PERFORMANCE ANALYSIS', margin, y + 3);
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text(`Standing: ${analysis.performanceBand}`, margin + contentW, y + 3, { align: 'right' });
    y += 4.5;

    // 4-metric insight row
    const boxW = contentW / 4;
    const metrics = [
      {
        label: analysis.isCompetency ? 'Strongest Area' : 'Strongest Subject',
        val: analysis.strongestArea
          ? `${analysis.strongestArea.name.slice(0, 17)} (${analysis.strongestArea.label})`
          : '—',
      },
      {
        label: 'Needs Support',
        val: analysis.supportArea
          ? `${analysis.supportArea.name.slice(0, 17)} (${analysis.supportArea.label})`
          : '—',
      },
      {
        label: analysis.isCompetency ? 'Milestone Mastery' : 'Pass Rate',
        val: `${analysis.passedCount}/${analysis.totalCount} (${analysis.passRate}%)`,
      },
      {
        label: analysis.isCompetency ? 'Competency Mean' : 'vs Class Average',
        val: analysis.isCompetency
          ? analysis.currentAverage !== null
            ? `${analysis.currentAverage.toFixed(2)} / 4.0`
            : '—'
          : analysis.vsClassAverage !== null
          ? `${analysis.vsClassAverage >= 0 ? '+' : ''}${analysis.vsClassAverage.toFixed(1)}%`
          : '—',
      },
    ];

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    for (let i = 0; i < metrics.length; i++) {
      const bx = margin + i * boxW;
      doc.rect(bx, y, boxW, 10.5, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(metrics[i].label, bx + 2, y + 3.8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(metrics[i].val.slice(0, 25), bx + 2, y + 8.5);
    }
    y += 13;

    // Term 2 (Term 1 vs Term 2) & Term 3 (Term 1, Term 2 & Term 3) Comparison
    if (showTermComparison && analysis.comparisonMode !== 'NONE') {
      const isThreeTerms = analysis.comparisonMode === 'TERM_1_2_3';
      const rows = analysis.subjectComparisons.slice(0, 14);
      const neededComp = 16 + rows.length * 5.6;
      y = ensureSpace(Math.min(neededComp, 68), y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...primary);
      doc.text(
        isThreeTerms
          ? 'TERM 1, TERM 2 & TERM 3 PERFORMANCE COMPARISON'
          : 'TERM 1 VS TERM 2 PERFORMANCE COMPARISON',
        margin,
        y + 3
      );

      const u = analysis.unit;
      const dec = analysis.isCompetency ? 2 : 1;
      const t1Txt = analysis.termSummary.term1Avg !== null ? `${analysis.termSummary.term1Avg.toFixed(dec)}${u}` : '—';
      const t2Txt = analysis.termSummary.term2Avg !== null ? `${analysis.termSummary.term2Avg.toFixed(dec)}${u}` : '—';
      const t3Txt = analysis.termSummary.term3Avg !== null ? `${analysis.termSummary.term3Avg.toFixed(dec)}${u}` : '—';
      const cumTxt =
        analysis.termSummary.cumulativeAvg !== null
          ? `${analysis.termSummary.cumulativeAvg.toFixed(dec)}${u}`
          : '—';
      const netTxt =
        analysis.termSummary.netChange !== null
          ? `${analysis.termSummary.netChange >= 0 ? '+' : ''}${analysis.termSummary.netChange.toFixed(dec)}${u}`
          : 'Baseline';

      y += 4.5;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(...accent);
      doc.rect(margin, y, contentW, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const summaryLine = isThreeTerms
        ? `Term 1: ${t1Txt}   |   Term 2: ${t2Txt}   |   Term 3: ${t3Txt}   |   Annual Avg: ${cumTxt}   |   Trend: ${analysis.termSummary.trendLabel} (${netTxt})`
        : `Term 1: ${t1Txt}   |   Term 2: ${t2Txt}   |   Cumulative Avg: ${cumTxt}   |   Trend: ${analysis.termSummary.trendLabel} (${netTxt})`;
      doc.text(summaryLine, margin + 3, y + 4.7);
      y += 8.5;

      if (rows.length > 0) {
        doc.setFillColor(226, 232, 240);
        doc.rect(margin, y, contentW, 5.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(30, 41, 59);
        doc.text(analysis.isCompetency ? 'LEARNING AREA' : 'SUBJECT', margin + 2, y + 4);
        if (isThreeTerms) {
          doc.text('TERM 1', margin + 106, y + 4, { align: 'right' });
          doc.text('TERM 2', margin + 130, y + 4, { align: 'right' });
          doc.text('TERM 3', margin + 154, y + 4, { align: 'right' });
          doc.text('CHANGE', margin + contentW - 2, y + 4, { align: 'right' });
        } else {
          doc.text('TERM 1', margin + 122, y + 4, { align: 'right' });
          doc.text('TERM 2', margin + 150, y + 4, { align: 'right' });
          doc.text('CHANGE', margin + contentW - 2, y + 4, { align: 'right' });
        }
        y += 5.8;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          y = ensureSpace(6, y);
          if (i % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentW, 5.4, 'F');
          }
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, y, contentW, 5.4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(15, 23, 42);
          doc.text(r.name.slice(0, 36), margin + 2, y + 3.8);
          const f = (v: number | null) => (v !== null ? `${v.toFixed(1)}${u}` : '—');
          const dStr = r.delta !== null ? `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}${u}` : '—';
          if (isThreeTerms) {
            doc.text(f(r.term1), margin + 106, y + 3.8, { align: 'right' });
            doc.text(f(r.term2), margin + 130, y + 3.8, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text(f(r.term3), margin + 154, y + 3.8, { align: 'right' });
          } else {
            doc.text(f(r.term1), margin + 122, y + 3.8, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text(f(r.term2), margin + 150, y + 3.8, { align: 'right' });
          }
          if (r.trend === 'up') doc.setTextColor(4, 120, 87);
          else if (r.trend === 'down') doc.setTextColor(190, 18, 60);
          else doc.setTextColor(71, 85, 105);
          doc.text(dStr, margin + contentW - 2, y + 3.8, { align: 'right' });
          y += 5.4;
        }
        y += 3;
      }
    }
  }

  // Personal Development & Conduct
  const traits = report.personalitySnapshot?.traits || [];
  if (showPersonality && traits.length > 0) {
    const half = Math.ceil(Math.min(traits.length, 10) / 2);
    y = ensureSpace(8 + half * 5.8, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primary);
    doc.text('PERSONAL DEVELOPMENT, CONDUCT & ATTITUDE', margin, y + 3);
    y += 5;

    const colW = contentW / 2 - 2;
    for (let i = 0; i < half; i++) {
      const left = traits[i];
      const right = traits[i + half];
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, colW, 5.6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(left.trait, margin + 2, y + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(left.rating, margin + colW - 2, y + 4, { align: 'right' });

      if (right) {
        doc.rect(margin + colW + 4, y, colW, 5.6);
        doc.setFont('helvetica', 'normal');
        doc.text(right.trait, margin + colW + 6, y + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(right.rating, margin + contentW - 2, y + 4, { align: 'right' });
      }
      y += 5.6;
    }
    y += 3.5;
  }

  // Remarks
  const drawBox = (title: string, body: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(body || '—', contentW - 4).slice(0, 5);
    const boxH = Math.max(10.5, lines.length * 3.9 + 4.2);
    y = ensureSpace(boxH + 7, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text(title, margin, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y + 4.2, contentW, boxH);
    doc.text(lines, margin + 2, y + 8.3);
    y += boxH + 6;
  };

  drawBox("CLASS TEACHER'S REMARKS", report.teacherRemarks || '');
  drawBox("HEADTEACHER'S REMARKS", report.headteacherRemarks || '');

  // Promotion & Signatures Footer
  const footerHeight = showPromotion ? 30 : 20;
  y = ensureSpace(footerHeight, y);
  if (y < 245) {
    y = Math.max(y + 2, 245);
  } else {
    y += 2;
  }

  if (showPromotion) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentW, 9.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentW, 9.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Promotion Status: ${report.promotionStatus || 'Pending'}`, margin + 3, y + 6.2);
    doc.text(`Next Class: ${report.nextClassName || '-'}`, margin + 88, y + 6.2);
    doc.text(`Status: ${report.status}`, margin + contentW - 3, y + 6.2, { align: 'right' });
    y += 20;
  } else {
    y += 12;
  }

  if (teacherSignatureAsset) {
    try {
      doc.addImage(teacherSignatureAsset.dataUrl, teacherSignatureAsset.format, margin + 10, y - 10.5, 30, 9.5);
    } catch {
      // ignore invalid teacher signature format
    }
  }
  if (signatureAsset) {
    try {
      doc.addImage(signatureAsset.dataUrl, signatureAsset.format, margin + 72, y - 10.5, 28, 9.5);
    } catch {
      // ignore invalid signature format
    }
  }
  if (stampAsset) {
    try {
      doc.addImage(stampAsset.dataUrl, stampAsset.format, margin + 102, y - 12, 13, 11);
    } catch {
      // ignore invalid stamp format
    }
  }
  if (parentSignatureAsset) {
    try {
      doc.addImage(parentSignatureAsset.dataUrl, parentSignatureAsset.format, margin + 145, y - 10.5, 30, 9.5);
    } catch {
      // ignore invalid parent signature format
    }
  }

  doc.setDrawColor(100, 116, 139);
  doc.line(margin, y, margin + 52, y);
  doc.line(margin + 67, y, margin + 119, y);
  doc.line(margin + 134, y, margin + contentW, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    (settings?.teacherSignatureLabel?.trim() || "Class Teacher's Signature").slice(0, 32),
    margin + 26,
    y + 4,
    { align: 'center' }
  );
  doc.text(
    (settings?.headteacherSignatureLabel?.trim() || "Headteacher's Signature & Stamp").slice(0, 32),
    margin + 93,
    y + 4,
    { align: 'center' }
  );
  doc.text(
    (settings?.parentSignatureLabel?.trim() || "Parent / Guardian's Signature").slice(0, 32),
    margin + 160,
    y + 4,
    { align: 'center' }
  );

  const verificationCode = computeReportVerificationCode(
    report,
    schoolCode || settings?.schoolName?.replace(/[^A-Za-z]/g, '').slice(0, 4) || 'SCH'
  );
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  if (settings?.reportFooterNote && showVerificationCode) {
    doc.text(settings.reportFooterNote.slice(0, 82), margin, 285);
    doc.setFont('helvetica', 'bold');
    doc.text(`VERIFY ID: ${verificationCode}`, margin + contentW, 285, { align: 'right' });
  } else if (settings?.reportFooterNote) {
    doc.text(settings.reportFooterNote.slice(0, 110), pageW / 2, 285, { align: 'center' });
  } else if (showVerificationCode) {
    doc.setFont('helvetica', 'bold');
    doc.text(`OFFICIAL VERIFICATION ID: ${verificationCode}`, margin + contentW, 285, { align: 'right' });
  }
}

export async function downloadReportCardPdf(
  report: ReportCard,
  settings: SchoolSettings | null,
  analysis?: ReportCardPerformanceAnalysis | null,
  schoolCode?: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [logoAsset, photoAsset, signatureAsset, stampAsset, teacherSigAsset, parentSigAsset] =
    await Promise.all([
      loadImageForPdf(settings?.logoUrl),
      loadImageForPdf(report.photoUrl),
      loadImageForPdf(report.headteacherSignatureUrl || settings?.headteacherSignatureUrl),
      loadImageForPdf(settings?.schoolStampUrl),
      loadImageForPdf(report.teacherSignatureUrl || settings?.teacherSignatureUrl),
      loadImageForPdf(report.parentSignatureUrl || settings?.parentSignatureUrl),
    ]);
  await renderReportCardPage(
    doc,
    report,
    settings,
    logoAsset,
    photoAsset,
    analysis,
    signatureAsset,
    stampAsset,
    teacherSigAsset,
    parentSigAsset,
    schoolCode
  );
  const safeName = (report.pupilName || 'Pupil').replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${safeName}_${report.className || ''}_${report.termName || 'Report'}.pdf`);
}

export async function downloadBulkReportCardsPdf(
  reports: ReportCard[],
  settings: SchoolSettings | null,
  className: string,
  analysisByReportId?: Map<string, ReportCardPerformanceAnalysis>,
  schoolCode?: string
): Promise<void> {
  if (reports.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [logoAsset, defaultHeadSig, stampAsset, defaultTeacherSig, defaultParentSig] =
    await Promise.all([
      loadImageForPdf(settings?.logoUrl),
      loadImageForPdf(settings?.headteacherSignatureUrl),
      loadImageForPdf(settings?.schoolStampUrl),
      loadImageForPdf(settings?.teacherSignatureUrl),
      loadImageForPdf(settings?.parentSignatureUrl),
    ]);

  const sigCache = new Map<string, PdfImageAsset | null>();
  const resolveSig = async (
    url: string | undefined,
    fallback: PdfImageAsset | null
  ): Promise<PdfImageAsset | null> => {
    if (!url) return fallback;
    if (sigCache.has(url)) return sigCache.get(url) ?? fallback;
    const loaded = await loadImageForPdf(url);
    sigCache.set(url, loaded);
    return loaded ?? fallback;
  };

  for (let i = 0; i < reports.length; i++) {
    if (i > 0) doc.addPage();
    const rc = reports[i];
    const [photoAsset, headSig, teacherSig, parentSig] = await Promise.all([
      loadImageForPdf(rc.photoUrl),
      resolveSig(rc.headteacherSignatureUrl, defaultHeadSig),
      resolveSig(rc.teacherSignatureUrl, defaultTeacherSig),
      resolveSig(rc.parentSignatureUrl, defaultParentSig),
    ]);
    await renderReportCardPage(
      doc,
      rc,
      settings,
      logoAsset,
      photoAsset,
      analysisByReportId?.get(rc.id) || null,
      headSig,
      stampAsset,
      teacherSig,
      parentSig,
      schoolCode
    );
  }
  const safeClass = className.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${safeClass}_Bulk_Report_Cards.pdf`);
}

export async function downloadPromotionListPdf(params: {
  settings: SchoolSettings | null;
  schoolName: string;
  academicYearName: string;
  groups: PromotionListClassGroup[];
}): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;
  const primary = hexToRgb(params.settings?.primaryColor);
  const logoAsset = await loadImageForPdf(params.settings?.logoUrl);

  const drawHeader = (isFirstPage: boolean) => {
    drawPageFrame(doc, primary);
    if (isFirstPage) {
      doc.setFillColor(...primary);
      doc.rect(margin, margin, contentW, 22, 'F');
      if (logoAsset) {
        try {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(margin + 3, margin + 2, 18, 18, 2, 2, 'F');
          doc.addImage(logoAsset.dataUrl, logoAsset.format, margin + 4, margin + 3, 16, 16);
        } catch {
          // ignore logo errors
        }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.text(params.schoolName.toUpperCase(), pageW / 2, margin + 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `OFFICIAL PROMOTION & GRADUATION LIST — ${params.academicYearName}`,
        pageW / 2,
        margin + 16,
        { align: 'center' }
      );
      return margin + 26;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text(
      `${params.schoolName.toUpperCase()} — PROMOTION LIST (${params.academicYearName}) [Continued]`,
      margin,
      16
    );
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 18, pageW - margin, 18);
    return 22;
  };

  let y = drawHeader(true);

  const nonEmptyGroups = params.groups.filter((g) => g.rows.length > 0);
  const totalPupils = nonEmptyGroups.reduce((acc, g) => acc + g.rows.length, 0);
  const totalPromoted = nonEmptyGroups.reduce((acc, g) => acc + g.promotedCount, 0);
  const totalRetained = nonEmptyGroups.reduce((acc, g) => acc + g.retainedCount, 0);
  const totalGraduated = nonEmptyGroups.reduce((acc, g) => acc + g.graduatedCount, 0);

  // Executive summary bar
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentW, 9, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total Pupils: ${totalPupils}   |   Promoted: ${totalPromoted}   |   Graduated: ${totalGraduated}   |   Retained: ${totalRetained}   |   Pass Mark: ${params.settings?.minPassAverage ?? 50}%`,
    margin + 3,
    y + 5.8
  );
  y += 13;

  const ensureSpace = (needed: number) => {
    if (y + needed <= 275) return;
    doc.addPage();
    y = drawHeader(false);
  };

  for (const group of nonEmptyGroups) {
    ensureSpace(24);
    doc.setFillColor(...primary);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      `${group.sourceClass.name} (${group.sourceClass.levelCategory}) → Target: ${
        group.nextClass ? group.nextClass.name : 'Graduated Alumni'
      }`,
      margin + 2.5,
      y + 4.8
    );
    doc.text(
      `Promoted: ${group.promotedCount} · Grad: ${group.graduatedCount} · Ret: ${group.retainedCount}`,
      margin + contentW - 2.5,
      y + 4.8,
      { align: 'right' }
    );
    y += 7;

    // Column Header
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(7);
    doc.text('#', margin + 2, y + 4.2);
    doc.text('ADM NO.', margin + 9, y + 4.2);
    doc.text('PUPIL NAME', margin + 35, y + 4.2);
    doc.text('SEX', margin + 84, y + 4.2);
    doc.text('T1', margin + 101, y + 4.2, { align: 'right' });
    doc.text('T2', margin + 114, y + 4.2, { align: 'right' });
    doc.text('T3', margin + 127, y + 4.2, { align: 'right' });
    doc.text('ANNUAL', margin + 143, y + 4.2, { align: 'right' });
    doc.text('DECISION', margin + 147, y + 4.2);
    doc.text('NEXT CLASS', margin + contentW - 2, y + 4.2, { align: 'right' });
    y += 6;

    for (let i = 0; i < group.rows.length; i++) {
      const r = group.rows[i];
      ensureSpace(6.5);
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, 6, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentW, 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      const unit = r.isCompetency ? '/4' : '%';
      const fmt = (v: number | null) => (v !== null ? `${v.toFixed(1)}${unit}` : '—');
      doc.text(String(i + 1), margin + 2, y + 4.2);
      doc.text(r.pupil.admissionNumber.slice(0, 14), margin + 9, y + 4.2);
      doc.setFont('helvetica', 'bold');
      doc.text(r.pupil.fullName.slice(0, 26), margin + 35, y + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.text(r.pupil.gender === 'Female' ? 'F' : 'M', margin + 85, y + 4.2);
      doc.text(fmt(r.term1Avg), margin + 101, y + 4.2, { align: 'right' });
      doc.text(fmt(r.term2Avg), margin + 114, y + 4.2, { align: 'right' });
      doc.text(fmt(r.term3Avg), margin + 127, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(fmt(r.annualAvg), margin + 143, y + 4.2, { align: 'right' });

      if (r.decision === 'Retained') doc.setTextColor(190, 18, 60);
      else if (r.decision === 'Graduated') doc.setTextColor(67, 56, 202);
      else doc.setTextColor(4, 120, 87);
      doc.text(r.decision, margin + 147, y + 4.2);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.text(r.toClassName.slice(0, 16), margin + contentW - 2, y + 4.2, { align: 'right' });
      y += 6;
    }
    y += 5;
  }

  // Official Sign-off
  ensureSpace(26);
  y += 10;
  doc.setDrawColor(100, 116, 139);
  doc.line(margin, y, margin + 72, y);
  doc.line(margin + contentW - 72, y, margin + contentW, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Academic Coordinator${params.settings?.academicCoordinatorName ? ` (${params.settings.academicCoordinatorName})` : ''}`,
    margin + 36,
    y + 4.5,
    { align: 'center' }
  );
  doc.text(
    `Headteacher Signature & Stamp${params.settings?.headteacherName ? ` (${params.settings.headteacherName})` : ''}`,
    margin + contentW - 36,
    y + 4.5,
    { align: 'center' }
  );
  doc.setFontSize(7);
  doc.text(
    `Generated on ${new Date().toISOString().slice(0, 10)}`,
    pageW / 2,
    285,
    { align: 'center' }
  );

  const safeYear = params.academicYearName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${params.schoolName.replace(/[^a-zA-Z0-9_-]+/g, '_')}_Promotion_List_${safeYear}.pdf`);
}

export function downloadClassPerformancePdf(params: {
  schoolName: string;
  className: string;
  academicYearName: string;
  termName: string;
  isCompetency?: boolean;
  overallAverage: number;
  assessedCount: number;
  totalPupils: number;
  subjectRows: Array<{ subjectName: string; average: number; highest: number; lowest: number; count: number }>;
  supportPupils: Array<{ pupilName: string; average: number; detail?: string }>;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = 18;
  const drawContHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 83, 45);
    doc.text(
      `${params.schoolName.toUpperCase()} — ${params.className} (${params.termName}) [Continued]`,
      margin,
      14
    );
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 16, 196, 16);
    y = 22;
  };

  const ensureSpace = (needed: number): boolean => {
    if (y + needed <= 280) return false;
    doc.addPage();
    drawContHeader();
    return true;
  };

  const drawTableHeader = () => {
    doc.setFillColor(20, 83, 45);
    doc.rect(margin, y, 182, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(params.isCompetency ? 'LEARNING AREA' : 'SUBJECT', margin + 2, y + 5);
    doc.text('ASSESSED', margin + 95, y + 5, { align: 'right' });
    doc.text(params.isCompetency ? 'AVG (1-4)' : 'AVERAGE %', margin + 125, y + 5, { align: 'right' });
    doc.text('HIGHEST', margin + 153, y + 5, { align: 'right' });
    doc.text('LOWEST', margin + 180, y + 5, { align: 'right' });
    y += 7;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(params.schoolName.toUpperCase(), margin, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(
    `Class Performance Analysis — ${params.className} (${params.academicYearName}, ${params.termName})`,
    margin,
    y
  );
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const avgStr = params.isCompetency
    ? `${params.overallAverage.toFixed(2)} / 4.0`
    : `${params.overallAverage.toFixed(1)}%`;
  doc.text(
    `Pupils Enrolled: ${params.totalPupils} · Pupils Assessed: ${params.assessedCount} · Overall Class Average: ${avgStr}`,
    margin,
    y
  );
  y += 10;

  drawTableHeader();
  for (const row of params.subjectRows) {
    if (ensureSpace(7)) {
      drawTableHeader();
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, 182, 7);
    doc.text(row.subjectName.slice(0, 42), margin + 2, y + 5);
    doc.text(String(row.count), margin + 95, y + 5, { align: 'right' });
    doc.text(row.average.toFixed(params.isCompetency ? 2 : 1), margin + 125, y + 5, { align: 'right' });
    doc.text(row.highest.toFixed(params.isCompetency ? 2 : 1), margin + 153, y + 5, { align: 'right' });
    doc.text(row.lowest.toFixed(params.isCompetency ? 2 : 1), margin + 180, y + 5, { align: 'right' });
    y += 7;
  }

  y += 10;
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    params.isCompetency
      ? 'Pupils Requiring Additional Support (Rating < 2.5 or Needs Support)'
      : 'Pupils Requiring Additional Support (< 55% Overall Average)',
    margin,
    y
  );
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (params.supportPupils.length === 0) {
    doc.text('No pupils flagged below support threshold in this term.', margin, y);
  } else {
    for (const p of params.supportPupils) {
      ensureSpace(6);
      const scoreText = params.isCompetency ? `${p.average.toFixed(2)} / 4.0` : `${p.average.toFixed(1)}%`;
      doc.text(`• ${p.pupilName}: ${scoreText}${p.detail ? ` (${p.detail})` : ''}`, margin + 2, y);
      y += 5.5;
    }
  }

  doc.save(`${params.className.replace(/\s+/g, '_')}_Performance_Report.pdf`);
}
