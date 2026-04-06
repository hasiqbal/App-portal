
import { useState, useRef } from 'react';
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PrayerTime, PrayerTimeUpdate } from '@/types';
import { bulkUpdatePrayerTimesFromCsv, bulkUpdatePrayerTimesFromYearCsv } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, AlertCircle, CheckCircle2, Loader2, Download, AlertTriangle, ArrowLeft, ClipboardPaste, FileUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

// ─── CSV columns — matching user's CSV column order ───────────────────────────
// Jumu'ah times are excluded — they are set via the bulk Jumu'ah tool on the Prayer Times page
const CSV_COLUMNS: (keyof PrayerTimeUpdate)[] = [
  'fajr',
  'sunrise',
  'ishraq',
  'zawaal',
  'zuhr',
  'asr',
  'maghrib',
  'isha',
  'fajr_jamat',
  'zuhr_jamat',
  'asr_jamat',
  'maghrib_jamat',
  'isha_jamat',
];

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Normalise a raw header string → canonical key or special token.
// Returns null if the column should be silently skipped.
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
    // jumu'ah aliases intentionally omitted — set via the portal tool
  };
  return ALIASES[s] ?? null;
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
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(text: string, scopeHint: 'year' | 'month', fixedMonth: number): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      rows: [], unknownColumns: [], isYearScope: false,
      parseErrors: ['CSV must have a header row and at least one data row.'],
      validationIssues: [],
    };
  }

  // ── Auto-detect delimiter (tab vs comma) using all sample lines ───────────
  const sample = lines.slice(0, 5).join('\n');
  const tabCount = (sample.match(/\t/g) ?? []).length;
  const commaCount = (sample.match(/,/g) ?? []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const splitRow = (line: string) =>
    line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

  // ── Find the real header row ──────────────────────────────────────────────
  // Excel sheets often have section-label rows above the actual headers
  // (e.g. "STARTING TIMES" / "JAMAAT TIMES" spanning merged cells).
  // Scan the first 5 lines and use the first one that contains a recognised column.
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cols = splitRow(lines[i]).map(normaliseHeader);
    const hasKnown = cols.some(
      (c) => c === 'date' || c === 'month' || CSV_COLUMNS.includes(c as keyof PrayerTimeUpdate)
    );
    if (hasKnown) { headerRowIdx = i; break; }
  }

  const rawHeaders = splitRow(lines[headerRowIdx]);
  const normHeaders = rawHeaders.map(normaliseHeader);

  const hasDateCol  = normHeaders.includes('date');
  const hasMonthCol = normHeaders.includes('month');
  const isYearScope = hasDateCol || hasMonthCol || scopeHint === 'year';

  if (!hasDateCol) {
    return {
      rows: [], unknownColumns: [], isYearScope,
      parseErrors: [
        'CSV must include a "DATE" or "day" column. Values like "01-Jan" or plain day numbers (1, 2 …) are both accepted. ' +
        'If you copied from Excel with section-label rows (e.g. "STARTING TIMES"), make sure the row with DATE/FAJR/etc. is included.',
      ],
      validationIssues: [],
    };
  }

  const unknownColumns: { col: string; suggestion?: string }[] = [];
  const recognisedTimeCols = normHeaders.filter(
    (h) => h !== null && h !== 'date' && h !== 'month' && CSV_COLUMNS.includes(h as keyof PrayerTimeUpdate)
  );
  const validationIssues: ValidationIssue[] = [];
  if (recognisedTimeCols.length === 0) {
    validationIssues.push({
      type: 'error',
      message: 'No recognised prayer time columns found. Please check your column names.',
    });
    return { rows: [], unknownColumns, parseErrors: [], validationIssues, isYearScope };
  }

  const dateIdx  = normHeaders.indexOf('date');
  const monthIdx = normHeaders.indexOf('month');

  const rows: ParsedRow[] = [];
  const keysSeen = new Set<string>();
  let detectedYearScope = hasMonthCol;

  // Start data rows right after the header row
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);

    // Skip section-header rows and fully empty rows
    const hasTime = cells.some((c) => /^\d{1,2}:\d{2}$/.test(c));
    const allText = cells.every((c) => c === '' || (/^[a-z\s]+$/i.test(c) && !/^\d/.test(c)));
    if (!hasTime && allText) continue;
    if (cells.every((c) => c === '')) continue;

    const rowErrors: string[] = [];
    let month = fixedMonth;
    let day = 0;

    const rawDate = cells[dateIdx] ?? '';
    // DD-Mon format: "01-Jan", "1-Jan", "15-Feb"
    const ddMon = rawDate.match(/^(\d{1,2})[-/](\w+)$/);
    // Plain day number: "1", "15"
    const plainDay = rawDate.match(/^\d{1,2}$/);

    if (ddMon) {
      day = parseInt(ddMon[1], 10);
      const abbr = ddMon[2].toLowerCase().slice(0, 3);
      const parsedMonth = MONTH_ABBR_MAP[abbr] ?? parseInt(ddMon[2], 10);
      if (!parsedMonth || parsedMonth < 1 || parsedMonth > 12) {
        rowErrors.push(`Row ${i + 1}: unrecognised month in date "${rawDate}"`);
      } else {
        month = parsedMonth;
        detectedYearScope = true;
      }
    } else if (plainDay) {
      day = parseInt(plainDay[0], 10);
      month = fixedMonth;
    } else if (hasMonthCol && monthIdx !== -1) {
      const rawMonth = cells[monthIdx] ?? '';
      const parsedMonth = parseInt(rawMonth, 10);
      if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        rowErrors.push(`Row ${i + 1}: invalid month "${rawMonth}" (must be 1–12)`);
      } else {
        month = parsedMonth;
      }
      day = parseInt(rawDate, 10);
      if (isNaN(day)) {
        rowErrors.push(`Row ${i + 1}: unrecognised date/day value "${rawDate}"`);
      }
    } else {
      const parts = rawDate.split(/[-/]/).map(Number);
      if (parts.length === 2 && parts[0] >= 1 && parts[1] >= 1 && parts[1] <= 12) {
        day = parts[0]; month = parts[1];
      } else {
        rowErrors.push(`Row ${i + 1}: unrecognised date "${rawDate}" — use DD-Mon (e.g. 01-Jan) or a plain day number`);
      }
    }

    if (day < 1 || day > 31 || isNaN(day)) {
      rows.push({ month, day: day || 0, fields: {}, errors: rowErrors.length ? rowErrors : [`Row ${i + 1}: invalid day value "${rawDate}"`] });
      continue;
    }

    const key = `${month}-${day}`;
    if (keysSeen.has(key)) {
      rowErrors.push(`Row ${i + 1}: duplicate entry for ${MONTHS_FULL[month - 1]} day ${day}`);
    } else {
      keysSeen.add(key);
    }

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
      // Non-time, non-empty values (e.g. colour formatting text) — skip silently
    });

    rows.push({ month, day, fields, errors: rowErrors });
  }

  return { rows, unknownColumns, parseErrors: [], validationIssues, isYearScope: detectedYearScope || isYearScope };
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
        const dateStr = `${String(d).padStart(2, '0')}-${monthAbbrs[m - 1]}`;
        dataRows.push([dateStr, ...CSV_COLUMNS.map(() => '')].join(','));
      }
    }
  } else {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${String(d).padStart(2, '0')}-${monthAbbrs[month - 1]}`;
      dataRows.push([dateStr, ...CSV_COLUMNS.map(() => '')].join(','));
    }
  }

  const csv = [header, ...dataRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = scope === 'year'
    ? `prayer-times-${year}.csv`
    : `prayer-times-${year}-${String(month).padStart(2, '0')}-${MONTHS_FULL[month - 1].toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────
interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  month: number;
  monthName: string;
  year: number;
  onImported: (updatedByMonth: Map<number, PrayerTime[]>) => void;
  /** Pre-loaded CSV text (e.g. passed from the Excel Converter page via sessionStorage) */
  preloadedCsv?: string;
}

type Stage = 'idle' | 'validating' | 'parsed' | 'saving' | 'done';
type InputMode = 'upload' | 'paste';

const CsvImportModal = ({ open, onClose, month, monthName, year, onImported, preloadedCsv }: CsvImportModalProps) => {
  const scope: 'year' | 'month' = 'year';
  const [stage, setStage] = useState<Stage>('idle');
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [pasteText, setPasteText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Auto-parse pre-loaded CSV when the modal opens with one
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
    if (!open) {
      preloadHandled.current = false;
    }
  }, [open, preloadedCsv, month]);

  const reset = () => {
    setStage('idle');
    setParseResult(null);
    setFileName('');
    setProgress('');
    setPasteText('');
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
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a .csv file.');
      return;
    }
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

  const proceedToPreview = () => setStage('parsed');

  const validRows = parseResult?.rows.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = parseResult?.rows.filter((r) => r.errors.length > 0) ?? [];
  const allRowErrors = errorRows.flatMap((r) => r.errors);
  const blockingIssues = (parseResult?.validationIssues ?? []).filter((i) => i.type === 'error');
  const warningIssues = (parseResult?.validationIssues ?? []).filter((i) => i.type === 'warning');
  const parseErrors = parseResult?.parseErrors ?? [];
  const canProceed = blockingIssues.length === 0 && parseErrors.length === 0 && validRows.length > 0;

  const rowsByMonth = new Map<number, typeof validRows>();
  validRows.forEach((r) => {
    if (!rowsByMonth.has(r.month)) rowsByMonth.set(r.month, []);
    rowsByMonth.get(r.month)!.push(r);
  });
  const monthsAffected = Array.from(rowsByMonth.keys()).sort((a, b) => a - b);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setStage('saving');

    const isYear = parseResult?.isYearScope ?? scope === 'year';

    if (isYear) {
      const totalMonths = monthsAffected.length;
      setProgress(`Saving ${validRows.length} rows across ${totalMonths} month${totalMonths !== 1 ? 's' : ''}…`);
      try {
        const resultMap = await bulkUpdatePrayerTimesFromYearCsv(rowsByMonth);
        resultMap.forEach((updated, m) => {
          queryClient.setQueryData<PrayerTime[]>(['prayer_times', m], (old) => {
            if (!old) return old;
            const map = new Map(updated.map((r) => [r.id, r]));
            return old.map((r) => map.get(r.id) ?? r);
          });
        });
        setStage('done');
        setProgress('');
        const totalRows = Array.from(resultMap.values()).reduce((s, arr) => s + arr.length, 0);
        toast.success(`${totalRows} row${totalRows !== 1 ? 's' : ''} imported across ${resultMap.size} month${resultMap.size !== 1 ? 's' : ''} for ${year}.`);
        onImported(resultMap);
        setTimeout(() => handleClose(), 1000);
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
        queryClient.setQueryData<PrayerTime[]>(['prayer_times', month], (old) => {
          if (!old) return old;
          const map = new Map(updated.map((r) => [r.id, r]));
          return old.map((r) => map.get(r.id) ?? r);
        });
        setStage('done');
        setProgress('');
        toast.success(`${updated.length} row${updated.length !== 1 ? 's' : ''} imported for ${monthName}.`);
        onImported(new Map([[month, updated]]));
        setTimeout(() => handleClose(), 1000);
      } catch (err) {
        console.error('CSV import error:', err);
        toast.error('Import failed. Check the console for details.');
        setStage('parsed');
        setProgress('');
      }
    }
  };

  const previewCols = CSV_COLUMNS.filter((col) => validRows.some((r) => col in r.fields));
  const effectiveScope = parseResult?.isYearScope ?? (scope === 'year');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl max-h-[92vh] overflow-y-auto mx-2 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
            <Upload size={15} className="text-primary shrink-0" />
            <span>Import Prayer Times CSV</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
            Upload or paste prayer times in HH:MM format — including directly from Excel.
          </p>
        </DialogHeader>

        {/* ── Input mode tabs ── */}
        {stage === 'idle' && (
          <div className="flex gap-1 p-1 rounded-xl bg-muted/60 border border-border">
            {(['upload', 'paste'] as InputMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  inputMode === mode
                    ? 'bg-card shadow-sm text-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode === 'upload' ? <FileUp size={13} /> : <ClipboardPaste size={13} />}
                {mode === 'upload' ? 'Upload File' : 'Paste from Excel'}
              </button>
            ))}
          </div>
        )}



        {/* ── Column hint ── */}
        {stage === 'idle' && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Expected columns — extra/unknown columns are silently skipped
            </p>
            <div className="flex flex-wrap gap-1">
              <code className="text-[10px] font-mono bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-primary font-semibold">DATE</code>
              <span className="text-[10px] text-muted-foreground/60 self-center mx-0.5">·</span>
              {CSV_COLUMNS.map((col) => (
                <code key={col} className="text-[10px] font-mono bg-muted/80 border border-border/60 px-1.5 py-0.5 rounded text-muted-foreground">{col}</code>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Column names are case-insensitive; spaces allowed (e.g. "Fajr Jamat" = fajr_jamat).
              Section header rows from Excel (e.g. "STARTING TIMES") are automatically skipped.
              Jumu'ah times are not in the CSV — use the "Set Jumu'ah" tool on the Prayer Times page instead.
            </p>
          </div>
        )}

        {/* ── Template download ── */}
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Template available:</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => downloadTemplate('year', year, month)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Download size={12} /> Full Year {year}
            </button>
          </div>
        </div>

        {/* ── Upload drop zone ── */}
        {stage === 'idle' && inputMode === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 sm:p-10 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            <Upload size={28} className="text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Drop CSV file here or tap to browse</p>
              <p className="text-xs text-muted-foreground mt-1">DATE · FAJR · SUNRISE · Ishraq · Zawaal · ZUHR · ASR · Maghrib · ISHA · Fajr Jamat…</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {/* ── Paste zone ── */}
        {stage === 'idle' && inputMode === 'paste' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                Select all cells in Excel and paste below (Ctrl+A then Ctrl+C)
              </p>
              <button
                onClick={async () => {
                  const text = await navigator.clipboard.readText().catch(() => '');
                  if (text) setPasteText(text);
                  else toast.error('Could not read clipboard. Paste manually.');
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ClipboardPaste size={11} /> Paste from clipboard
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`DATE\tFAJR\tSUNRISE\tIshraq\tZawaal\tZUHR\tASR\tMaghrib\tISHA\tFajr Jamat\t...
01-Jan\t06:13\t08:25\t08:45\t11:43\t12:13\t14:13\t15:59\t17:48\t07:15\t...
02-Jan\t06:13\t08:25\t08:45\t11:44\t12:14\t14:14\t16:00\t17:49\t07:15\t...`}
              className="w-full h-44 font-mono text-xs rounded-xl border border-border bg-muted/30 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                {pasteText.trim()
                  ? `${pasteText.trim().split('\n').length} line${pasteText.trim().split('\n').length !== 1 ? 's' : ''} detected`
                  : 'Section header rows like "STARTING TIMES" are automatically skipped'}
              </p>
              <Button
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}
                size="sm"
                className="gap-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                {parseResult.rows.length} row{parseResult.rows.length !== 1 ? 's' : ''} found
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${effectiveScope ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {effectiveScope ? `Year scope — ${monthsAffected.length} month${monthsAffected.length !== 1 ? 's' : ''}` : `Month scope — ${monthName}`}
              </span>
            </div>

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
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                  <AlertCircle size={14} /> {blockingIssues.length} blocking issue{blockingIssues.length !== 1 ? 's' : ''} — import blocked
                </div>
                {blockingIssues.map((issue, i) => <p key={i} className="text-xs text-destructive pl-5">{issue.message}</p>)}
              </div>
            )}

            {warningIssues.length > 0 && (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs">
                  <AlertTriangle size={14} /> {warningIssues.length} warning{warningIssues.length !== 1 ? 's' : ''} — import will skip these columns
                </div>
                {warningIssues.map((issue, i) => (
                  <div key={i} className="pl-5">
                    <p className="text-xs text-amber-700">{issue.message}</p>
                    {issue.suggestion && <p className="text-xs text-amber-600 mt-0.5 italic">{issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            )}

            {allRowErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 max-h-32 overflow-y-auto">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-xs mb-1">
                  <AlertCircle size={13} /> {allRowErrors.length} row error{allRowErrors.length !== 1 ? 's' : ''} — affected rows skipped
                </div>
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
                  {warningIssues.length > 0 && (
                    <p className="text-xs text-emerald-600 mt-0.5">Unrecognised columns will be ignored.</p>
                  )}
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

        {/* ── Preview ── */}
        {(stage === 'parsed' || stage === 'saving' || stage === 'done') && parseResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">File: <strong>{fileName}</strong></span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{validRows.length} valid row{validRows.length !== 1 ? 's' : ''}</span>
              {errorRows.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{errorRows.length} skipped</span>}
              {effectiveScope && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{monthsAffected.length} month{monthsAffected.length !== 1 ? 's' : ''}</span>}
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

            {validRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-48 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        {effectiveScope && <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Month</th>}
                        <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Day</th>
                        {previewCols.map((col) => (
                          <th key={col} className="px-3 py-1.5 text-left font-semibold border-b border-border whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 60).map((r, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          {effectiveScope && (
                            <td className="px-3 py-1 font-mono font-bold text-primary text-[10px]">{MONTHS_FULL[r.month - 1].slice(0, 3)}</td>
                          )}
                          <td className="px-3 py-1 font-mono font-bold">{r.day}</td>
                          {previewCols.map((col) => (
                            <td key={col} className="px-3 py-1 font-mono text-muted-foreground">
                              {(r.fields as Record<string, string | null>)[col] ?? <span className="text-muted-foreground/40">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validRows.length > 60 && (
                  <p className="text-xs text-muted-foreground px-3 py-1 border-t border-border bg-muted/30">Showing 60 of {validRows.length} rows</p>
                )}
              </div>
            )}

            {stage === 'done' && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                <CheckCircle2 size={16} /> Import complete!
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
          <Button variant="outline" onClick={handleClose} disabled={stage === 'saving'} className="w-full sm:w-auto">
            {stage === 'done' ? 'Close' : 'Cancel'}
          </Button>

          {stage === 'validating' && canProceed && (
            <Button onClick={proceedToPreview} className="w-full sm:w-auto" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              Preview {validRows.length} Row{validRows.length !== 1 ? 's' : ''} →
            </Button>
          )}

          {stage === 'parsed' && validRows.length > 0 && (
            <Button onClick={handleImport} disabled={stage === 'saving'} className="w-full sm:w-auto" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
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
