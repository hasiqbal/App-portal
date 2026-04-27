import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Loader2, RefreshCw, Save } from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { toast } from 'sonner';
import {
  fetchHadithInclusionRules,
  replaceHadithInclusionRules,
} from '#/lib/api';
import type { HadithInclusionRulePayload, HadithInclusionRule } from '#/types';

type BookConfig = {
  key: string;
  label: string;
  englishEdition: string;
};

const BOOKS: BookConfig[] = [
  { key: 'nawawi', label: 'Nawawi 40', englishEdition: 'eng-nawawi' },
  { key: 'bukhari', label: 'Bukhari', englishEdition: 'eng-bukhari' },
  { key: 'muslim', label: 'Muslim', englishEdition: 'eng-muslim' },
  { key: 'abudawud', label: 'Abu Dawud', englishEdition: 'eng-abudawud' },
  { key: 'tirmidhi', label: 'Tirmidhi', englishEdition: 'eng-tirmidhi' },
  { key: 'nasai', label: 'Nasai', englishEdition: 'eng-nasai' },
  { key: 'ibnmajah', label: 'Ibn Majah', englishEdition: 'eng-ibnmajah' },
];

type FormRow = {
  enabled: boolean;
  sectionsCsv: string;
};

function buildDefaultForm(): Record<string, FormRow> {
  return Object.fromEntries(BOOKS.map((book) => [
    book.key,
    { enabled: true, sectionsCsv: '' },
  ]));
}

function parseSectionsCsv(value: string): number[] {
  if (!value.trim()) return [];
  const set = new Set<number>();

  for (const token of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    if (token.includes('-')) {
      const [rawStart, rawEnd] = token.split('-').map((part) => Number(part.trim()));
      if (Number.isInteger(rawStart) && Number.isInteger(rawEnd) && rawStart > 0 && rawEnd >= rawStart) {
        for (let i = rawStart; i <= rawEnd; i += 1) set.add(i);
      }
      continue;
    }

    const n = Number(token);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }

  return [...set].sort((a, b) => a - b);
}

function formatSectionRules(rules: HadithInclusionRule[]): string {
  const values = rules
    .filter((rule) => rule.include_scope === 'section' && typeof rule.section_number === 'number')
    .map((rule) => rule.section_number as number)
    .sort((a, b) => a - b);
  return values.join(', ');
}

export default function HadithIncludes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<HadithInclusionRule[]>([]);
  const [form, setForm] = useState<Record<string, FormRow>>(buildDefaultForm());

  const loadRules = async () => {
    setLoading(true);
    try {
      const rows = await fetchHadithInclusionRules();
      setRules(rows);

      if (rows.length === 0) {
        setForm(buildDefaultForm());
        return;
      }

      const next = buildDefaultForm();
      for (const book of BOOKS) {
        const bookRules = rows.filter((rule) => rule.collection_key === book.key && rule.enabled);
        const hasBookRule = bookRules.some((rule) => rule.include_scope === 'book');
        const sectionCsv = formatSectionRules(bookRules);
        next[book.key] = {
          enabled: hasBookRule || sectionCsv.length > 0,
          sectionsCsv: sectionCsv,
        };
      }

      setForm(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load hadith include rules.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const includedCount = useMemo(
    () => BOOKS.filter((book) => form[book.key]?.enabled).length,
    [form],
  );

  const handleToggle = (key: string, enabled: boolean) => {
    setForm((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled,
      },
    }));
  };

  const handleSectionsChange = (key: string, sectionsCsv: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        sectionsCsv,
      },
    }));
  };

  const handleSave = async () => {
    const payload: HadithInclusionRulePayload[] = [];

    for (const book of BOOKS) {
      const row = form[book.key];
      if (!row?.enabled) continue;

      payload.push({
        collection_key: book.key,
        edition_key: book.englishEdition,
        include_scope: 'book',
        section_number: null,
        enabled: true,
      });

      const sections = parseSectionsCsv(row.sectionsCsv);
      for (const section of sections) {
        payload.push({
          collection_key: book.key,
          edition_key: book.englishEdition,
          include_scope: 'section',
          section_number: section,
          enabled: true,
        });
      }
    }

    if (payload.length === 0) {
      toast.error('Select at least one book. Empty rules would default back to all books.');
      return;
    }

    setSaving(true);
    try {
      const updated = await replaceHadithInclusionRules(payload);
      setRules(updated);
      toast.success('Hadith include rules saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save include rules.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <BookOpenCheck size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">Hadith Include Controls</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Daily random hadith will be selected only from included books and sections.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadRules} disabled={loading} className="gap-2">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading || saving} className="gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Rules'}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 max-w-4xl space-y-4">
          <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 text-sm text-[hsl(150_20%_28%)]">
            Included books: <strong>{includedCount}</strong> / {BOOKS.length}. 
            If no rules exist, the backend defaults to all books.
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" />
              <span className="text-sm">Loading include rules…</span>
            </div>
          ) : (
            <div className="space-y-3">
              {BOOKS.map((book) => (
                <div key={book.key} className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[hsl(150_30%_18%)]">{book.label}</p>
                      <p className="text-xs text-muted-foreground">Collection key: {book.key}</p>
                    </div>

                    <Label className="inline-flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form[book.key]?.enabled ?? false}
                        onChange={(e) => handleToggle(book.key, e.target.checked)}
                      />
                      Include this book
                    </Label>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs text-[hsl(150_30%_18%)]">
                      Included sections (optional) — CSV or ranges like 1,3,7-10
                    </Label>
                    <Input
                      value={form[book.key]?.sectionsCsv ?? ''}
                      onChange={(e) => handleSectionsChange(book.key, e.target.value)}
                      placeholder="Leave blank to include all sections for this book"
                      disabled={!form[book.key]?.enabled}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Keyword safety filters are hardcoded in the daily edge function and apply only to random daily selection.
          </div>

          {!!rules.length && (
            <p className="text-xs text-muted-foreground">
              Persisted rules in DB: {rules.length}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
