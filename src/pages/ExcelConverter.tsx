import { useState, useCallback } from 'react';
import { ClipboardPaste, Download, RefreshCw, CheckCircle2, AlertCircle, Table2, ArrowRight, Info, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { Button } from '#/components/ui/button';
import Sidebar from '#/components/layout/Sidebar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const OUTPUT_COLS = [
  'fajr', 'sunrise', 'ishraq', 'zawaal',
  'zuhr', 'asr', 'maghrib', 'isha',
  'fajr_jamat', 'zuhr_jamat', 'asr_jamat', 'maghrib_jamat', 'isha_jamat',
] as const;

const MONTH_ABBR_MAP: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const ALIASES: Record<string, string> = {
  date: 'date', day: 'date',
  fjar: 'fajr', fajar: 'fajr', fajjar: 'fajr',
  fajr_jamat: 'fajr_jamat', fajr_jamaat: 'fajr_jamat', fajrjamat: 'fajr_jamat', fajr_jama: 'fajr_jamat', fajr_jam: 'fajr_jamat',
  sunrize: 'sunrise', sun_rise: 'sunrise',
  ishrak: 'ishraq', zawal: 'zawaal', zawwaal: 'zawaal',
  dhuhr: 'zuhr', dhur: 'zuhr', zuhur: 'zuhr',
  zuhr_jamaat: 'zuhr_jamat', zuhr_jama: 'zuhr_jamat', zuhr_jam: 'zuhr_jamat',
  asar: 'asr', asr_jamaat: 'asr_jamat', asr_jama: 'asr_jamat', asr_jam: 'asr_jamat',
  magrib: 'maghrib', mughrib: 'maghrib',
  maghrib_jamaat: 'maghrib_jamat', maghrib_jama: 'maghrib_jamat', maghrib_jam: 'maghrib_jamat',
  esha: 'isha', isha_jamaat: 'isha_jamat', isha_jama: 'isha_jamat', isha_jam: 'isha_jamat',
};

function normalise(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (OUTPUT_COLS.includes(s as typeof OUTPUT_COLS[number])) return s;
  if (s === 'date' || s === 'day') return 'date';
  return ALIASES[s] ?? null;
}

interface ConvertedRow { date: string; fields: Record<string, string>; }
interface ConvertResult { rows: ConvertedRow[]; skippedColumns: string[]; warnings: string[]; monthsFound: number[]; }

function convertExcel(text: string): ConvertResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  const sample = lines.slice(0, 5).join('\n');
  const tabCount = (sample.match(/\t/g) ?? []).length;
  const commaCount = (sample.match(/,/g) ?? []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';
  const split = (line: string) => line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cols = split(lines[i]).map(normalise);
    if (cols.some((c) => c === 'date' || OUTPUT_COLS.includes(c as typeof OUTPUT_COLS[number]))) { headerIdx = i; break; }
  }

  const rawHeaders = split(lines[headerIdx]);
  const normHeaders = rawHeaders.map(normalise);
  const dateIdx = normHeaders.indexOf('date');
  const skippedColumns: string[] = [];
  rawHeaders.forEach((h, i) => { const n = normHeaders[i]; if (!n && h.trim()) skippedColumns.push(h.trim()); });

  const rows: ConvertedRow[] = [];
  const warnings: string[] = [];
  const monthsSet = new Set<number>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    if (cells.every((c) => c === '')) continue;
    const hasTime = cells.some((c) => /^\d{1,2}:\d{2}$/.test(c));
    const allText = cells.every((c) => c === '' || (/^[a-z\s]+$/i.test(c) && !/^\d/.test(c)));
    if (!hasTime && allText) continue;

    const rawDate = dateIdx >= 0 ? (cells[dateIdx] ?? '') : '';
    let dateStr = '';
    const ddMon = rawDate.match(/^(\d{1,2})[-/](\w+)$/);
    const plainDay = rawDate.match(/^(\d{1,2})$/);

    if (ddMon) {
      const day = parseInt(ddMon[1], 10); const abbr = ddMon[2].toLowerCase().slice(0, 3); const m = MONTH_ABBR_MAP[abbr];
      if (m) { monthsSet.add(m); dateStr = `${String(day).padStart(2, '0')}-${MONTH_ABBRS[m - 1]}`; }
      else { warnings.push(`Row ${i + 1}: unrecognised month "${ddMon[2]}" — skipped`); continue; }
    } else if (plainDay) { dateStr = String(parseInt(plainDay[1], 10)).padStart(2, '0'); }
    else if (rawDate) { warnings.push(`Row ${i + 1}: unrecognised date "${rawDate}" — skipped`); continue; }
    else { continue; }

    const fields: Record<string, string> = {};
    normHeaders.forEach((norm, ci) => {
      if (!norm || norm === 'date') return;
      if (!OUTPUT_COLS.includes(norm as typeof OUTPUT_COLS[number])) return;
      const val = cells[ci]?.trim() ?? '';
      if (!val || val === '-' || val.toLowerCase() === 'n/a') { fields[norm] = ''; }
      else if (/^\d{1,2}:\d{2}$/.test(val)) {
        const [h, m] = val.split(':').map(Number);
        if (h <= 23 && m <= 59) fields[norm] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        else { warnings.push(`Row ${i + 1} "${norm}": time "${val}" out of range`); fields[norm] = ''; }
      }
    });
    rows.push({ date: dateStr, fields });
  }
  return { rows, skippedColumns, warnings, monthsFound: Array.from(monthsSet).sort((a, b) => a - b) };
}

function buildCsv(rows: ConvertedRow[]): string {
  const header = ['DATE', ...OUTPUT_COLS].join(',');
  const dataRows = rows.map((r) => [r.date, ...OUTPUT_COLS.map((col) => r.fields[col] ?? '')].join(','));
  return [header, ...dataRows].join('\n');
}

const ExcelConverter = () => {
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [csvOutput, setCsvOutput] = useState('');
  const navigate = useNavigate();
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const handleConvert = useCallback(() => {
    const text = pasted.trim();
    if (!text) { toast.error('Please paste your Excel content first.'); return; }
    const res = convertExcel(text);
    setResult(res); setCsvOutput(buildCsv(res.rows));
    if (res.rows.length === 0) toast.error('No valid rows found. Check that data has a DATE column and time values.');
    else toast.success(`Converted ${res.rows.length} rows successfully.`);
  }, [pasted]);

  const handleDownload = () => {
    if (!csvOutput) return;
    const blob = new Blob([csvOutput], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'prayer-times-converted.csv'; a.click();
    URL.revokeObjectURL(url); toast.success('CSV downloaded.');
  };

  const handleCopyCsv = async () => { if (!csvOutput) return; await navigator.clipboard.writeText(csvOutput); toast.success('CSV copied to clipboard.'); };
  const handleReset = () => { setPasted(''); setResult(null); setCsvOutput(''); };

  const handleCopyAndImport = async () => {
    if (!csvOutput) return;
    try { await navigator.clipboard.writeText(csvOutput); } catch { /* noop */ }
    sessionStorage.setItem('csv_import_payload', csvOutput);
    toast.success('CSV ready — opening Prayer Times import…');
    navigate('/prayer-times?import=1');
  };

  const previewRows = result?.rows.slice(0, 50) ?? [];

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 md:pt-0">

        {/* Banner */}
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
              <FileSpreadsheet size={20} className="text-[hsl(142_60%_32%)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Excel → CSV Converter</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Paste Excel prayer times data and convert to CSV format for import.</p>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 max-w-7xl">
          {/* Info banner */}
          <div className="flex items-start gap-3 rounded-xl border border-[hsl(142_50%_75%)] bg-[hsl(142_50%_97%)] px-4 py-3 mb-6">
            <Info size={15} className="text-[hsl(142_60%_35%)] shrink-0 mt-0.5" />
            <div className="text-xs text-[hsl(142_55%_25%)] leading-relaxed space-y-0.5">
              <p><strong>How to use:</strong> In Excel, select all data (Ctrl+A), copy (Ctrl+C), then paste below.</p>
              <p>Section headers are automatically skipped. Jumu'ah times are excluded — set those using the bulk Jumu'ah tool on Prayer Times page.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Left: Input */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)] flex items-center gap-2">
                  <ClipboardPaste size={14} className="text-[hsl(142_60%_35%)]" /> Paste Excel Data
                </h2>
                {pasted && <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw size={11} /> Reset</button>}
              </div>

              <textarea value={pasted} onChange={(e) => { setPasted(e.target.value); setResult(null); setCsvOutput(''); }}
                placeholder={`Paste Excel content here. Example:\n\nDATE\tFAJR\tSUNRISE\tZUHR\tASR\tMAGHRIB\tISHA\tFajr Jamat\n01-Jan\t06:13\t08:25\t12:13\t14:13\t15:59\t17:48\t07:15`}
                className="w-full h-72 font-mono text-xs rounded-xl border border-[hsl(140_20%_88%)] bg-white px-3 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(142_60%_35%/0.3)] focus:border-[hsl(142_50%_70%)] placeholder:text-muted-foreground/40 transition-all"
                spellCheck={false} />

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{pasted.trim() ? `${pasted.trim().split('\n').length} lines pasted` : 'Accepts tab-delimited (Excel) or comma-separated data'}</p>
                <button onClick={async () => { const text = await navigator.clipboard.readText().catch(() => ''); if (text) { setPasted(text); setResult(null); setCsvOutput(''); } else toast.error('Could not read clipboard.'); }}
                  className="text-xs text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1">
                  <ClipboardPaste size={11} /> Paste from clipboard
                </button>
              </div>

              <Button onClick={handleConvert} disabled={!pasted.trim()} className="w-full gap-2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <ArrowRight size={14} /> Convert to CSV
              </Button>

              {/* Output columns reference */}
              <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white p-4 space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Output columns</p>
                <div className="flex flex-wrap gap-1">
                  <code className="text-[10px] font-mono bg-[hsl(142_50%_93%)] border border-[hsl(142_50%_80%)] px-1.5 py-0.5 rounded text-[hsl(142_60%_28%)] font-bold">DATE</code>
                  {OUTPUT_COLS.map((col) => (
                    <code key={col} className="text-[10px] font-mono bg-[hsl(140_20%_95%)] border border-[hsl(140_20%_88%)] px-1.5 py-0.5 rounded text-muted-foreground">{col}</code>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Jumu'ah times excluded — set via "Set Jumu'ah" on Prayer Times page.</p>
              </div>
            </div>

            {/* Right: Output */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[hsl(150_30%_12%)] flex items-center gap-2">
                  <Table2 size={14} className="text-[hsl(142_60%_35%)]" /> Converted Output
                  {result && <span className="text-xs font-normal text-muted-foreground">— {result.rows.length} rows</span>}
                </h2>
                {csvOutput && (
                  <div className="flex gap-2">
                    <button onClick={handleCopyCsv} className="text-xs text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1"><ClipboardPaste size={11} /> Copy</button>
                    <button onClick={handleDownload} className="text-xs text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1"><Download size={11} /> Download</button>
                  </div>
                )}
              </div>

              {result && (result.skippedColumns.length > 0 || result.warnings.length > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                  {result.skippedColumns.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1"><AlertCircle size={12} />{result.skippedColumns.length} column{result.skippedColumns.length !== 1 ? 's' : ''} skipped</p>
                      <div className="flex flex-wrap gap-1">{result.skippedColumns.map((c) => <code key={c} className="text-[10px] bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800">{c}</code>)}</div>
                    </div>
                  )}
                  {result.warnings.slice(0, 5).map((w, i) => <p key={i} className="text-[11px] text-amber-700">{w}</p>)}
                  {result.warnings.length > 5 && <p className="text-[10px] text-amber-600">…and {result.warnings.length - 5} more warnings</p>}
                </div>
              )}

              {result && result.monthsFound.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.monthsFound.map((m) => (
                    <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]">
                      {MONTHS_FULL[m - 1]} ({result.rows.filter((r) => { const abbr = r.date.split('-')[1]?.toLowerCase(); return abbr && MONTH_ABBR_MAP[abbr] === m; }).length}d)
                    </span>
                  ))}
                </div>
              )}

              {result && result.rows.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-800">{result.rows.length} rows ready</p>
                      <p className="text-xs text-emerald-600">Send directly to Prayer Times importer, or download first.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={handleCopyAndImport} className="gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                      <ExternalLink size={12} /> Open in Prayer Times Import
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-xs">
                      <Download size={12} /> Download CSV
                    </Button>
                  </div>
                </div>
              )}

              {!result && (
                <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-[hsl(140_20%_88%)] bg-white text-muted-foreground gap-3">
                  <Table2 size={32} className="opacity-20" />
                  <p className="text-sm">Converted CSV will appear here</p>
                  <p className="text-xs opacity-60">Paste your Excel data and click Convert</p>
                </div>
              )}

              {result && previewRows.length > 0 && (
                <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white overflow-hidden">
                  <div className="px-3 py-2 bg-[hsl(140_30%_97%)] border-b border-[hsl(140_20%_88%)] flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Preview (first {Math.min(50, result.rows.length)} rows)</p>
                    <p className="text-[10px] text-muted-foreground">{result.rows.length} total</p>
                  </div>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-[10px] border-collapse font-mono">
                      <thead className="bg-[hsl(140_30%_97%)] sticky top-0">
                        <tr>
                          <th className="px-2.5 py-1.5 text-left font-bold border-b border-[hsl(140_20%_88%)] text-[hsl(142_60%_28%)] whitespace-nowrap">DATE</th>
                          {OUTPUT_COLS.map((col) => <th key={col} className="px-2.5 py-1.5 text-left font-semibold border-b border-[hsl(140_20%_88%)] text-muted-foreground whitespace-nowrap">{col}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className={`border-b border-[hsl(140_20%_88%)]/40 ${i % 2 === 0 ? '' : 'bg-[hsl(140_30%_97%)]/50'}`}>
                            <td className="px-2.5 py-1 font-bold text-[hsl(142_60%_28%)] whitespace-nowrap">{r.date}</td>
                            {OUTPUT_COLS.map((col) => <td key={col} className="px-2.5 py-1 text-muted-foreground whitespace-nowrap">{r.fields[col] || <span className="text-muted-foreground/30">—</span>}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {csvOutput && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Raw CSV output</p>
                    <button onClick={handleCopyCsv} className="text-xs text-[hsl(142_60%_35%)] hover:underline flex items-center gap-1"><ClipboardPaste size={10} /> Copy</button>
                  </div>
                  <textarea readOnly value={csvOutput} className="w-full h-28 font-mono text-[10px] rounded-xl border border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)] px-3 py-2 resize-none focus:outline-none text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ExcelConverter;
