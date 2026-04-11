
import { useState, useRef } from 'react';
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { PrayerTime, PrayerTimeUpdate } from '#/types';
import { bulkUpdatePrayerTimesFromCsv, bulkUpdatePrayerTimesFromYearCsv, fetchPrayerTimes } from '#/lib/api';
import { toast } from 'sonner';
import { Upload, AlertCircle, CheckCircle2, Loader2, Download, AlertTriangle, ArrowLeft, ClipboardPaste, FileUp, ArrowRight, Info } from 'lucide-react';

// ─── CSV columns — matching user's CSV column order ───────────────────────────
const CSV_COLUMNS: (keyof PrayerTimeUpdate)[] = [
  'fajr', 'sunrise', 'ishraq', 'zawaal', 'zuhr', 'asr',
  'maghrib', 'isha', 'fajr_jamat', 'zuhr_jamat', 'asr_jamat',
  'maghrib_jamat', 'isha_jamat',
];

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Full month names
  january: 1, february: 2, march: 3, april: 4, may2: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function normaliseHeader(raw: string): keyof PrayerTimeUpdate | 'date' | 'month' | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (s === 'date' || s === 'day') return 'date';
  if (s === 'month') return 'month';
  if (CSV_COLUMNS.includes(s as keyof PrayerTimeUpdate)) return s as keyof PrayerTimeUpdate;

  const ALIASES: Record<string, keyof PrayerTimeUpdate | 'date' | 'month'> = {
    fjar: 'fajr', fajar: 'fajr', fajjar: 'fajr',
    fajr_jamat: 'fajr_jamat', fajr_jamaat: 'fajr_jamat', fajr_jama: 'fajr_jamat',
    fajrjamat: 'fajr_jamat', fajr_jam: 'fajr_jamat',
    sunrize: 'sunrise', sun_rise: 'sunrise',
    ishrak: 'ishraq',
    zawal: 'zawaal', zawwaal: 'zawaal',
    dhuhr: 'zuhr', dhur: 'zuhr', zuhur: 'zuhr',
    zuhr_jamaat: 'zuhr_jamat', zuhr_jama: 'zuhr_jamat', zuhr_jam: 'zuhr_jamat',
    asar: 'asr',
    asr_jamaat: 'asr_jamat', asr_jama: 'asr_jamat', asr_jam: 'asr_jamat',
    magrib: 'maghrib', mughrib: 'maghrib',
    maghrib_jamaat: 'maghrib_jamat', maghrib_jama: 'maghrib_jamat',
    maghrib_jam: 'maghrib_jamat', laghrib_jam: 'maghrib_jamat', laghrib_jama: 'maghrib_jamat',
    laghrib_jamat: 'maghrib_jamat',
    esha: 'isha',
    isha_jamaat: 'isha_jamat', isha_jama: 'isha_jamat', isha_jam: 'isha_jamat',
  };
  return ALIASES[s] ?? null;
}

/** Returns true if a cell value looks like a date (01-Jan, 01/Feb, DD/MM/YYYY, DD-MM, or plain day 1–31) */
function looksLikeDate(cell: string): boolean {
  const s = cell.trim();
  // DD-Mon or DD/Mon (e.g. 01-Jan, 01/Feb)
  if (/^\d{1,2}[-/]\w+$/.test(s)) return true;
  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return true;
  // DD-MM or DD/MM (ambiguous short form)
  if (/^\d{1,2}[/-]\d{1,2}$/.test(s)) return true;
  // "Month Day" or "Day Month" e.g. "February 1" or "1 February"
  if (/^([A-Za-z]{3,})\s+\d{1,2}$/.test(s) || /^\d{1,2}\s+[A-Za-z]{3,}$/.test(s)) return true;
  // Plain day number
  if (/^\d{1,2}$/.test(s)) return true;
  return false;
}

/**
 * Parse a date cell into { month, day }.
 * Handles: DD-Mon, DD/Mon, DD/MM/YYYY, DD-MM-YYYY, DD/MM, DD-MM,
 *          "February 1", "1 February", plain day number.
 * Returns null if unrecognisable.
 */
function parseDate(
  rawDate: string,
  fixedMonth: number
): { month: number; day: number; yearScope: boolean } | null {
  const s = rawDate.trim();
  if (!s) return null;

  // DD-Mon or DD/Mon (e.g. 01-Apr, 01/Apr)
  const ddMon = s.match(/^(\d{1,2})[-/]([A-Za-z]+)$/);
  if (ddMon) {
    const day   = parseInt(ddMon[1], 10);
    const abbr  = ddMon[2].toLowerCase().slice(0, 3);
    const month = MONTH_ABBR_MAP[abbr] ?? MONTH_ABBR_MAP[ddMon[2].toLowerCase()];
    if (month && day >= 1 && day <= 31) return { month, day, yearScope: true };
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day   = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return { month, day, yearScope: true };
  }

  // DD/MM or DD-MM (two-number short form — treat as DD/MM)
  const ddmm = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (ddmm) {
    const day   = parseInt(ddmm[1], 10);
    const month = parseInt(ddmm[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return { month, day, yearScope: true };
  }

  // "February 1" or "Feb 1"
  const monDay = s.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monDay) {
    const abbr  = monDay[1].toLowerCase().slice(0, 3);
    const month = MONTH_ABBR_MAP[abbr] ?? MONTH_ABBR_MAP[monDay[1].toLowerCase()];
    const day   = parseInt(monDay[2], 10);
    if (month && day >= 1 && day <= 31) return { month, day, yearScope: true };
  }

  // "1 February" or "1 Feb"
  const dayMon = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (dayMon) {
    const day   = parseInt(dayMon[1], 10);
    const abbr  = dayMon[2].toLowerCase().slice(0, 3);
    const month = MONTH_ABBR_MAP[abbr] ?? MONTH_ABBR_MAP[dayMon[2].toLowerCase()];
    if (month && day >= 1 && day <= 31) return { month, day, yearScope: true };
  }

  // Plain day number — use fixedMonth
  const plain = s.match(/^(\d{1,2})$/);
  if (plain) {
    const day = parseInt(plain[1], 10);
    if (day >= 1 && day <= 31) return { month: fixedMonth, day, yearScope: false };
  }

  return null;
}

interface ParsedRow {
  month: number;
  day: number;
  fields: PrayerTimeUpdate;
  errors: string[];
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

interface ParseResult {
  rows: ParsedRow[];
  unknownColumns: { col: string; suggestion?: string }[];
  parseErrors: string[];
  validationIssues: ValidationIssue[];
  isYearScope: boolean;
  headerless: boolean;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(text: string, scopeHint: 'year' | 'month', fixedMonth: number): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 1) {
    return {
      rows: [], unknownColumns: [], isYearScope: false, headerless: false,
      parseErrors: ['CSV appears to be empty. Please paste at least one row of data.'],
      validationIssues: [],
    };
  }

  const sample = lines.slice(0, 5).join('\n');
  const tabCount = (sample.match(/\t/g) ?? []).length;
  const commaCount = (sample.match(/,/g) ?? []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';
  const splitRow = (line: string) => line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

  // ── Header detection: scan first 5 lines for column names ─────────────────
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cols = splitRow(lines[i]).map(normaliseHeader);
    if (cols.some((c) => c === 'date' || c === 'month' || CSV_COLUMNS.includes(c as keyof PrayerTimeUpdate))) {
      headerRowIdx = i;
      break;
    }
  }

  // ── Headerless detection: first cell of first line looks like a date ───────
  const firstLineCells = splitRow(lines[0]);
  const isHeaderless = headerRowIdx === -1 && looksLikeDate(firstLineCells[0] ?? '');

  // ── Build header mapping ───────────────────────────────────────────────────
  let rawHeaders: string[];
  let normHeaders: (keyof PrayerTimeUpdate | 'date' | 'month' | null)[];
  let dataStartIdx: number;

  if (isHeaderless) {
    // No header row — use positional default: DATE, then CSV_COLUMNS in order
    rawHeaders   = ['DATE', ...CSV_COLUMNS];
    normHeaders  = (['date', ...CSV_COLUMNS] as typeof normHeaders);
    dataStartIdx = 0;
  } else if (headerRowIdx !== -1) {
    // Header row found
    rawHeaders   = splitRow(lines[headerRowIdx]);
    normHeaders  = rawHeaders.map(normaliseHeader);
    dataStartIdx = headerRowIdx + 1;
  } else {
    // Neither header nor date-like first cell
    return {
      rows: [], unknownColumns: [], isYearScope: scopeHint === 'year', headerless: false,
      parseErrors: [
        'Could not detect a header row or date values in the pasted data. ' +
        'Either include a header row (DATE, FAJR, SUNRISE…) or start with date values like "01-Jan" or "01-Feb".',
      ],
      validationIssues: [],
    };
  }

  const hasDateCol  = normHeaders.includes('date');
  const hasMonthCol = normHeaders.includes('month');
  const isYearScope = hasDateCol || hasMonthCol || scopeHint === 'year';

  const unknownColumns: { col: string; suggestion?: string }[] = [];
  const recognisedTimeCols = normHeaders.filter(
    (h) => h !== null && h !== 'date' && h !== 'month' && CSV_COLUMNS.includes(h as keyof PrayerTimeUpdate)
  );
  const validationIssues: ValidationIssue[] = [];
  if (recognisedTimeCols.length === 0) {
    validationIssues.push({ type: 'error', message: 'No recognised prayer time columns found. Check your column names match: fajr, sunrise, zuhr, asr, maghrib, isha.' });
    return { rows: [], unknownColumns, parseErrors: [], validationIssues, isYearScope, headerless: isHeaderless };
  }

  const dateIdx  = normHeaders.indexOf('date');
  const monthIdx = normHeaders.indexOf('month');

  const rows: ParsedRow[] = [];
  const keysSeen = new Set<string>();
  let detectedYearScope = hasMonthCol;

  for (let i = dataStartIdx; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const hasTime = cells.some((c) => /^\d{1,2}:\d{2}$/.test(c));
    const allText = cells.every((c) => c === '' || (/^[a-z\s]+$/i.test(c) && !/^\d/.test(c)));
    if (!hasTime && allText) continue;
    if (cells.every((c) => c === '')) continue;

    const rowErrors: string[] = [];
    let month = fixedMonth;
    let day = 0;

    const rawDate = cells[dateIdx] ?? '';
    const parsed = parseDate(rawDate, fixedMonth);

    if (parsed) {
      month = parsed.month;
      day   = parsed.day;
      if (parsed.yearScope) detectedYearScope = true;
    } else if (hasMonthCol && monthIdx !== -1) {
      const rawMonth = cells[monthIdx] ?? '';
      const parsedMonth = parseInt(rawMonth, 10);
      if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        rowErrors.push(`Row ${i + 1}: invalid month "${rawMonth}"`);
      } else { month = parsedMonth; }
      const dayParsed = parseDate(rawDate, fixedMonth);
      if (dayParsed) { day = dayParsed.day; } else {
        rowErrors.push(`Row ${i + 1}: unrecognised date/day value "${rawDate}"`);
      }
    } else {
      rowErrors.push(`Row ${i + 1}: unrecognised date "${rawDate}" — use DD-Mon (e.g. 01-Feb), DD/MM/YYYY, DD-MM, or plain day number`);
    }

    if (day < 1 || day > 31 || isNaN(day)) {
      rows.push({ month, day: day || 0, fields: {}, errors: rowErrors.length ? rowErrors : [`Row ${i + 1}: invalid day "${rawDate}"`] });
      continue;
    }

    const key = `${month}-${day}`;
    if (keysSeen.has(key)) {
      rowErrors.push(`Row ${i + 1}: duplicate entry for ${MONTHS_FULL[month - 1]} day ${day}`);
    } else { keysSeen.add(key); }

    const fields: PrayerTimeUpdate = {};
    normHeaders.forEach((norm, colIdx) => {
      if (!norm || norm === 'date' || norm === 'month') return;
      if (!CSV_COLUMNS.includes(norm as keyof PrayerTimeUpdate)) return;
      const col = norm as keyof PrayerTimeUpdate;
      const val = cells[colIdx]?.trim() ?? '';
      if (val === '' || val === '-' || val.toLowerCase() === 'n/a') {
        (fields as Record<string, null>)[col] = null;
      } else if (/^\d{1,2}:\d{2}$/.test(val)) {
        const [h, m] = val.split(':').map(Number);
        if (h > 23 || m > 59) {
          rowErrors.push(`Row ${i + 1} col "${rawHeaders[colIdx]}": time "${val}" out of range`);
        } else {
          (fields as Record<string, string>)[col] = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        }
      }
    });

    rows.push({ month, day, fields, errors: rowErrors });
  }

  return { rows, unknownColumns, parseErrors: [], validationIssues, isYearScope: detectedYearScope || isYearScope, headerless: isHeaderless };
}

// ─── Template download ────────────────────────────────────────────────────────
function downloadTemplate(scope: 'year' | 'month', year: number, month: number) {
  const header = ['DATE', ...CSV_COLUMNS].join(',');
  const dataRows: string[] = [];
  const monthAbbrs = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (scope === 'year') {
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(year, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        dataRows.push([`${String(d).padStart(2,'0')}-${monthAbbrs[m-1]}`, ...CSV_COLUMNS.map(() => '')].join(','));
      }
    }
  } else {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      dataRows.push([`${String(d).padStart(2,'0')}-${monthAbbrs[month-1]}`, ...CSV_COLUMNS.map(() => '')].join(','));
    }
  }

  const csv = [header, ...dataRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = scope === 'year'
    ? `prayer-times-${year}.csv`
    : `prayer-times-${year}-${String(month).padStart(2,'0')}-${MONTHS_FULL[month-1].toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Diff cell ────────────────────────────────────────────────────────────────
const DiffCell = ({ oldVal, newVal }: { oldVal: string | null | undefined; newVal: string | null | undefined }) => {
  const old_ = oldVal ?? null;
  const new_ = newVal ?? null;
  const changed = old_ !== new_;

  if (!changed) {
    return <span className="font-mono text-muted-foreground">{new_ ?? <span className="opacity-30">—</span>}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded px-1 py-0.5 bg-amber-50 border border-amber-200">
      <span className="font-mono text-[10px] text-red-400 line-through">{old_ ?? '—'}</span>
      <ArrowRight size={9} className="text-amber-400 shrink-0" />
      <span className="font-mono text-[10px] font-bold text-emerald-700">{new_ ?? '—'}</span>
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  month: number;
  monthName: string;
  year: number;
  onImported: (updatedByMonth: Map<number, PrayerTime[]>) => void;
  preloadedCsv?: string;
}

type Stage = 'idle' | 'validating' | 'loadingExisting' | 'parsed' | 'saving' | 'done';
type InputMode = 'upload' | 'paste';

const CsvImportModal = ({ open, onClose, month, monthName, year, onImported, preloadedCsv }: CsvImportModalProps) => {
  const scope: 'year' | 'month' = 'year';
  const [stage,        setStage]        = useState<Stage>('idle');
  const [inputMode,    setInputMode]    = useState<InputMode>('upload');
  const [pasteText,    setPasteText]    = useState('');
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null);
  const [fileName,     setFileName]     = useState('');
  const [progress,     setProgress]     = useState('');
  const [existingData, setExistingData] = useState<Map<number, Map<number, PrayerTime>>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);

  const preloadHandled = useRef(false);
  React.useEffect(() => {
    if (open && preloadedCsv && !preloadHandled.current) {
      preloadHandled.current = true;
      setInputMode('paste');
      setPasteText(preloadedCsv);
      const result = parseCsv(preloadedCsv, 'year', month);
      setParseResult(result);
      setFileName('excel-converter-output.csv');
      setStage('validating');
    }
    if (!open) { preloadHandled.current = false; }
  }, [open, preloadedCsv, month]);

  const reset = () => {
    setStage('idle');
    setParseResult(null);
    setFileName('');
    setProgress('');
    setPasteText('');
    setExistingData(new Map());
    preloadHandled.current = false;
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  const handleParseCsv = (text: string, name: string) => {
    const result = parseCsv(text, scope, month);
    setParseResult(result);
    setFileName(name);
    setStage('validating');
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { toast.error('Please upload a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => handleParseCsv(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const handlePasteSubmit = () => {
    const text = pasteText.trim();
    if (!text) { toast.error('Please paste CSV content first.'); return; }
    handleParseCsv(text, 'pasted-content.csv');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows    = parseResult?.rows.filter((r) => r.errors.length === 0) ?? [];
  const errorRows    = parseResult?.rows.filter((r) => r.errors.length > 0) ?? [];
  const allRowErrors = errorRows.flatMap((r) => r.errors);
  const blockingIssues = (parseResult?.validationIssues ?? []).filter((i) => i.type === 'error');
  const warningIssues  = (parseResult?.validationIssues ?? []).filter((i) => i.type === 'warning');
  const parseErrors    = parseResult?.parseErrors ?? [];
  const canProceed     = blockingIssues.length === 0 && parseErrors.length === 0 && validRows.length > 0;

  const rowsByMonth = new Map<number, typeof validRows>();
  validRows.forEach((r) => {
    if (!rowsByMonth.has(r.month)) rowsByMonth.set(r.month, []);
    rowsByMonth.get(r.month)!.push(r);
  });
  const monthsAffected = Array.from(rowsByMonth.keys()).sort((a, b) => a - b);

  const proceedToPreview = async () => {
    setStage('loadingExisting');
    try {
      const fetches = await Promise.all(
        monthsAffected.map(async (m) => {
          const rows = await fetchPrayerTimes(m);
          const byDay = new Map(rows.map((r) => [r.day, r]));
          return [m, byDay] as [number, Map<number, PrayerTime>];
        })
      );
      setExistingData(new Map(fetches));
    } catch {
      setExistingData(new Map());
    }
    setStage('parsed');
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setStage('saving');

    const isYear = parseResult?.isYearScope ?? scope === 'year';

    if (isYear) {
      const totalMonths = monthsAffected.length;
      setProgress(`Saving ${validRows.length} rows across ${totalMonths} month${totalMonths !== 1 ? 's' : ''}…`);
      try {
        const resultMap = await bulkUpdatePrayerTimesFromYearCsv(rowsByMonth);
        setStage('done');
        setProgress('');
        toast.success(`${validRows.length} row${validRows.length !== 1 ? 's' : ''} imported across ${resultMap.size} month${resultMap.size !== 1 ? 's' : ''} for ${year}.`);
        onImported(resultMap);
      } catch (err) {
        console.error('CSV year import error:', err);
        toast.error('Import failed. Check the console for details.');
        setStage('parsed');
        setProgress('');
      }
    } else {
      setProgress(`Saving ${validRows.length} rows for ${monthName}…`);
      try {
        const updated = await bulkUpdatePrayerTimesFromCsv(month, validRows);
        setStage('done');
        setProgress('');
        toast.success(`${updated.length} row${updated.length !== 1 ? 's' : ''} imported for ${monthName}.`);
        onImported(new Map([[month, updated]]));
      } catch (err) {
        console.error('CSV import error:', err);
        toast.error('Import failed. Check the console for details.');
        setStage('parsed');
        setProgress('');
      }
    }
  };

  const effectiveScope = parseResult?.isYearScope ?? (scope === 'year');
  const previewCols = CSV_COLUMNS.filter((col) => validRows.some((r) => col in r.fields));

  const changedCellCount = validRows.reduce((acc, r) => {
    const existing = existingData.get(r.month)?.get(r.day);
    if (!existing) return acc + Object.keys(r.fields).length;
    return acc + previewCols.filter((col) => {
      const newVal = (r.fields as Record<string, string | null>)[col];
      const oldVal = (existing as unknown as Record<string, string | null | undefined>)[col];
      return newVal !== (oldVal ?? null);
    }).length;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-4xl max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto border-[hsl(140_20%_88%)]">
        <DialogHeader>
          <DialogTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <Upload size={15} className="text-[hsl(142_60%_32%)]" />
            </div>
            Import Prayer Times CSV
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
            Upload or paste prayer times in HH:MM format — headers optional when dates like "01-Feb" are in the first column.
          </p>
        </DialogHeader>

        {/* ── Input mode tabs ── */}
        {stage === 'idle' && (
          <div className="flex gap-1 p-1 rounded-xl bg-muted/60 border border-border">
            {(['upload', 'paste'] as InputMode[]).map((mode) => (
              <button key={mode} onClick={() => setInputMode(mode)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  inputMode === mode
                    ? 'bg-white shadow-sm text-[hsl(150_30%_12%)] border border-[hsl(140_20%_88%)]'
                    : 'text-muted-foreground hover:text-foreground'}`}>
                {mode === 'upload' ? <FileUp size={13} /> : <ClipboardPaste size={13} />}
                {mode === 'upload' ? 'Upload File' : 'Paste from Excel'}
              </button>
            ))}
          </div>
        )}

        {/* ── Column hint ── */}
        {stage === 'idle' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Expected columns
              </p>
              <span className="text-[10px] text-muted-foreground/60">— extra columns silently skipped · headers optional if first column has dates</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <code className="text-[10px] font-mono bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-primary font-semibold">DATE</code>
              <span className="text-[10px] text-muted-foreground/60 self-center mx-0.5">·</span>
              {CSV_COLUMNS.map((col) => (
                <code key={col} className="text-[10px] font-mono bg-muted/80 border border-border/60 px-1.5 py-0.5 rounded text-muted-foreground">{col}</code>
              ))}
            </div>
          </div>
        )}

        {/* ── Template download ── */}
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Template available:</span>
          <button onClick={() => downloadTemplate('year', year, month)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Download size={12} /> Full Year {year}
          </button>
        </div>

        {/* ── Upload drop zone ── */}
        {stage === 'idle' && inputMode === 'upload' && (
          <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[hsl(140_20%_88%)] rounded-xl p-8 sm:p-10 cursor-pointer hover:border-[hsl(142_50%_70%)] hover:bg-[hsl(142_50%_97%)] transition-all">
            <Upload size={28} className="text-[hsl(142_50%_70%)]" />
            <div className="text-center">
              <p className="text-sm font-medium">Drop CSV file here or tap to browse</p>
              <p className="text-xs text-muted-foreground mt-1">DATE · FAJR · SUNRISE · ZUHR · ASR · MAGHRIB · ISHA · Jamat times…</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {/* ── Paste zone ── */}
        {stage === 'idle' && inputMode === 'paste' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                Select cells in Excel and paste below — headers not required if dates (01-Jan, 01-Feb…) are in column A
              </p>
              <button onClick={async () => {
                  const text = await navigator.clipboard.readText().catch(() => '');
                  if (text) setPasteText(text);
                  else toast.error('Could not read clipboard. Paste manually.');
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0">
                <ClipboardPaste size={11} /> Paste from clipboard
              </button>
            </div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder={`01-Feb\t04:29\t06:41\t07:01\t12:43\t13:13\t17:42\t19:47\t21:31\t05:45\t14:00\t18:45\t19:47\t21:45\n02-Feb\t04:26\t06:36\t...`}
              className="w-full h-44 font-mono text-xs rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(142_30%_97%)] px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(142_60%_35%/0.3)] focus:border-[hsl(142_50%_70%)] placeholder:text-muted-foreground/50 transition-all"
              spellCheck={false} />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[10px] text-muted-foreground">
                {pasteText.trim()
                  ? `${pasteText.trim().split('\n').length} line${pasteText.trim().split('\n').length !== 1 ? 's' : ''} detected`
                  : 'Paste any section — headers auto-detected, section titles like "STARTING TIMES" are skipped'}
              </p>
              <Button onClick={handlePasteSubmit} disabled={!pasteText.trim()} size="sm" className="gap-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <CheckCircle2 size={13} /> Validate CSV
              </Button>
            </div>
          </div>
        )}

        {/* ── Validation report ── */}
        {stage === 'validating' && parseResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">File: <strong className="text-foreground">{fileName}</strong></span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">{parseResult.rows.length} rows found</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${effectiveScope ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {effectiveScope ? `Year scope — ${monthsAffected.length} month${monthsAffected.length !== 1 ? 's' : ''}` : `Month scope — ${monthName}`}
              </span>
              {parseResult.headerless && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1">
                  <Info size={10} /> Auto column order
                </span>
              )}
            </div>

            {/* Headerless info banner */}
            {parseResult.headerless && parseErrors.length === 0 && blockingIssues.length === 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
                <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  No header row detected — columns mapped automatically in order:{' '}
                  <strong>DATE, {CSV_COLUMNS.join(', ')}</strong>.
                  If your spreadsheet uses a different column order, add a header row.
                </p>
              </div>
            )}

            {effectiveScope && monthsAffected.length > 0 && blockingIssues.length === 0 && parseErrors.length === 0 && (
              <div className="flex flex-wrap gap-1">
                {monthsAffected.map((m) => (
                  <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {MONTHS_FULL[m - 1]} ({rowsByMonth.get(m)?.length ?? 0}d)
                  </span>
                ))}
              </div>
            )}

            {parseErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs"><AlertCircle size={14} /> File cannot be parsed</div>
                {parseErrors.map((e, i) => <p key={i} className="text-xs text-destructive pl-5">{e}</p>)}
              </div>
            )}

            {blockingIssues.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs"><AlertCircle size={14} /> Blocking issues</div>
                {blockingIssues.map((issue, i) => <p key={i} className="text-xs text-destructive pl-5">{issue.message}</p>)}
              </div>
            )}

            {warningIssues.length > 0 && (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs"><AlertTriangle size={14} /> Warnings</div>
                {warningIssues.map((issue, i) => <p key={i} className="text-xs text-amber-700 pl-5">{issue.message}</p>)}
              </div>
            )}

            {allRowErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 max-h-32 overflow-y-auto">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-xs mb-1"><AlertCircle size={13} /> {allRowErrors.length} row errors — affected rows skipped</div>
                {allRowErrors.map((e, i) => <p key={i} className="text-xs text-red-700 pl-4">{e}</p>)}
              </div>
            )}

            {canProceed && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} ready to import
                    {effectiveScope && ` across ${monthsAffected.length} month${monthsAffected.length !== 1 ? 's' : ''}`}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">Click "Preview Changes" to see exactly what will be updated before saving.</p>
                </div>
              </div>
            )}

            {!canProceed && parseErrors.length === 0 && blockingIssues.length === 0 && validRows.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                No valid rows to import. Please fix the errors and try again.
              </div>
            )}

            <button onClick={reset} className="text-xs text-primary hover:underline flex items-center gap-1">
              <ArrowLeft size={11} /> {inputMode === 'paste' ? 'Edit pasted content' : 'Choose a different file'}
            </button>
          </div>
        )}

        {/* ── Loading existing data for diff ── */}
        {stage === 'loadingExisting' && (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 size={16} className="animate-spin text-[hsl(142_60%_35%)]" />
            <span className="text-sm">Fetching current times to show changes…</span>
          </div>
        )}

        {/* ── Preview with diff ── */}
        {(stage === 'parsed' || stage === 'saving' || stage === 'done') && parseResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">File: <strong>{fileName}</strong></span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{validRows.length} valid row{validRows.length !== 1 ? 's' : ''}</span>
              {errorRows.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{errorRows.length} skipped</span>}
              {effectiveScope && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{monthsAffected.length} month{monthsAffected.length !== 1 ? 's' : ''}</span>}
              {changedCellCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium border border-amber-200">
                  {changedCellCount} cell{changedCellCount !== 1 ? 's' : ''} changing
                </span>
              )}
              {parseResult.headerless && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Auto column order</span>
              )}
            </div>

            {effectiveScope && monthsAffected.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {monthsAffected.map((m) => (
                  <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {MONTHS_FULL[m - 1]} ({rowsByMonth.get(m)?.length ?? 0}d)
                  </span>
                ))}
              </div>
            )}

            {existingData.size > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 flex-wrap">
                <span className="font-semibold text-amber-700">Change legend:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-red-400 line-through">old</span>
                  <ArrowRight size={8} className="text-amber-400" />
                  <span className="font-mono font-bold text-emerald-700">new</span>
                  <span className="ml-1">= value changing</span>
                </span>
                <span className="font-mono text-muted-foreground">same = unchanged</span>
              </div>
            )}

            {validRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-64 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-muted/60 sticky top-0 z-10">
                      <tr>
                        {effectiveScope && <th className="px-2 py-1.5 text-left font-semibold border-b border-border whitespace-nowrap">Month</th>}
                        <th className="px-2 py-1.5 text-left font-semibold border-b border-border">Day</th>
                        {previewCols.map((col) => (
                          <th key={col} className="px-2 py-1.5 text-left font-semibold border-b border-border whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 100).map((r, i) => {
                        const existing = existingData.get(r.month)?.get(r.day);
                        const hasAnyChange = previewCols.some((col) => {
                          const newVal = (r.fields as Record<string, string | null>)[col];
                          const oldVal = existing ? (existing as unknown as Record<string, string | null | undefined>)[col] : undefined;
                          return newVal !== (oldVal ?? null);
                        });
                        return (
                          <tr key={i} className={`border-b border-border/40 ${hasAnyChange ? 'bg-amber-50/40' : 'hover:bg-muted/20'}`}>
                            {effectiveScope && (
                              <td className="px-2 py-1 font-mono font-bold text-primary text-[10px] whitespace-nowrap">
                                {MONTHS_FULL[r.month - 1].slice(0, 3)}
                              </td>
                            )}
                            <td className="px-2 py-1 font-mono font-bold">{r.day}</td>
                            {previewCols.map((col) => {
                              const newVal = (r.fields as Record<string, string | null>)[col] ?? null;
                              const oldVal = existing ? ((existing as unknown as Record<string, string | null | undefined>)[col] ?? null) : null;
                              return (
                                <td key={col} className="px-2 py-1 whitespace-nowrap">
                                  {existingData.size > 0
                                    ? <DiffCell oldVal={oldVal} newVal={newVal} />
                                    : <span className="font-mono text-muted-foreground">{newVal ?? <span className="opacity-30">—</span>}</span>
                                  }
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {validRows.length > 100 && (
                  <p className="text-xs text-muted-foreground px-3 py-1 border-t border-border bg-muted/30">Showing 100 of {validRows.length} rows</p>
                )}
              </div>
            )}

            {stage === 'done' && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                <CheckCircle2 size={16} /> Import complete! Calendar updated.
              </div>
            )}

            {stage === 'saving' && progress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> {progress}
              </div>
            )}

            {stage === 'parsed' && (
              <button onClick={() => setStage('validating')} className="text-xs text-primary hover:underline flex items-center gap-1">
                <ArrowLeft size={11} /> Back to validation report
              </button>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-1 flex-col sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={stage === 'saving' || stage === 'loadingExisting'} className="w-full sm:w-auto border-[hsl(140_20%_88%)]">
            {stage === 'done' ? 'Close' : 'Cancel'}
          </Button>

          {stage === 'validating' && canProceed && (
            <Button onClick={proceedToPreview} className="w-full sm:w-auto gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              Preview Changes →
            </Button>
          )}

          {stage === 'parsed' && validRows.length > 0 && (
            <Button onClick={handleImport} className="w-full sm:w-auto gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              Import {validRows.length} Row{validRows.length !== 1 ? 's' : ''}
              {effectiveScope && ` (${monthsAffected.length} months)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CsvImportModal;
