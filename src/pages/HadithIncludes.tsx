import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { toast } from 'sonner';
import {
  fetchHadithScrapeTargets,
  replaceHadithScrapeTargets,
} from '#/lib/api';
import type {
  HadithScrapeCollectionKey,
  HadithScrapeTarget,
  HadithScrapeTargetPayload,
} from '#/types';

type CollectionConfig = {
  key: HadithScrapeCollectionKey;
  label: string;
  pathPattern: string;
};

const COLLECTIONS: CollectionConfig[] = [
  { key: 'adab', label: 'Al-Adab Al-Mufrad', pathPattern: '/adab/{book}/{hadith}' },
  { key: 'riyadussalihin', label: 'Riyad as-Salihin', pathPattern: '/riyadussalihin/{book}/{hadith}' },
  { key: 'shamail', label: 'Ash-Shama\'il Al-Muhammadiyah', pathPattern: '/shamail/{book}/{hadith}' },
];

type EditableTarget = {
  localId: string;
  id?: string;
  collection_key: HadithScrapeCollectionKey;
  book_number: string;
  hadith_number: string;
  enabled: boolean;
  weight: string;
  notes: string;
};

function nextLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyRow(collectionKey: HadithScrapeCollectionKey = 'adab'): EditableTarget {
  return {
    localId: nextLocalId(),
    collection_key: collectionKey,
    book_number: '1',
    hadith_number: '1',
    enabled: true,
    weight: '1',
    notes: '',
  };
}

function mapTargetToEditable(row: HadithScrapeTarget): EditableTarget {
  return {
    localId: row.id,
    id: row.id,
    collection_key: row.collection_key,
    book_number: String(row.book_number),
    hadith_number: String(row.hadith_number),
    enabled: row.enabled,
    weight: String(row.weight),
    notes: row.notes ?? '',
  };
}

function buildSunnahUrl(row: EditableTarget): string {
  return `https://sunnah.com/${row.collection_key}/${row.book_number}/${row.hadith_number}`;
}

function labelForCollection(key: HadithScrapeCollectionKey): string {
  return COLLECTIONS.find((c) => c.key === key)?.label ?? key;
}

export default function HadithIncludes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState<EditableTarget[]>([]);
  const [persistedCount, setPersistedCount] = useState(0);

  const loadTargets = async () => {
    setLoading(true);
    try {
      const rows = await fetchHadithScrapeTargets();
      setPersistedCount(rows.length);
      if (rows.length === 0) {
        setTargets([
          createEmptyRow('adab'),
          createEmptyRow('riyadussalihin'),
          createEmptyRow('shamail'),
        ]);
      } else {
        setTargets(rows.map((row) => mapTargetToEditable(row)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load hadith scrape targets.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTargets();
  }, []);

  const enabledCount = useMemo(() => targets.filter((row) => row.enabled).length, [targets]);

  const updateTarget = (localId: string, patch: Partial<EditableTarget>) => {
    setTargets((prev) => prev.map((row) => (
      row.localId === localId
        ? { ...row, ...patch }
        : row
    )));
  };

  const addRow = () => {
    setTargets((prev) => [...prev, createEmptyRow('adab')]);
  };

  const removeRow = (localId: string) => {
    setTargets((prev) => prev.filter((row) => row.localId !== localId));
  };

  const handleSave = async () => {
    const payload: HadithScrapeTargetPayload[] = [];
    const dedupe = new Set<string>();

    for (let index = 0; index < targets.length; index += 1) {
      const row = targets[index];
      const book = Number(row.book_number);
      const hadith = Number(row.hadith_number);
      const weight = Number(row.weight);

      if (!Number.isInteger(book) || book <= 0) {
        toast.error(`Row ${index + 1}: book number must be a positive integer.`);
        return;
      }

      if (!Number.isInteger(hadith) || hadith <= 0) {
        toast.error(`Row ${index + 1}: hadith number must be a positive integer.`);
        return;
      }

      if (!Number.isInteger(weight) || weight <= 0) {
        toast.error(`Row ${index + 1}: weight must be a positive integer.`);
        return;
      }

      const dedupeKey = `${row.collection_key}:${book}:${hadith}`;
      if (dedupe.has(dedupeKey)) {
        toast.error(`Duplicate target found at row ${index + 1}: ${dedupeKey}`);
        return;
      }
      dedupe.add(dedupeKey);

      payload.push({
        collection_key: row.collection_key,
        book_number: book,
        hadith_number: hadith,
        enabled: row.enabled,
        weight,
        display_order: (index + 1) * 10,
        notes: row.notes.trim() || null,
      });
    }

    if (targets.length === 0) {
      toast.error('Add at least one scrape target before saving.');
      return;
    }

    setSaving(true);
    try {
      const updated = await replaceHadithScrapeTargets(payload);
      setPersistedCount(updated.length);
      setTargets(updated.map((row) => mapTargetToEditable(row)));
      toast.success('Hadith scrape target pool saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save scrape targets.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <BookOpenCheck size={20} className="text-[hsl(142_60%_32%)]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hadith Random Scrape Pool</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Daily random scrape runs against curated sunnah.com targets for adab, riyadussalihin, and shamail.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadTargets} disabled={loading} className="gap-2">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={addRow} disabled={loading || saving} className="gap-2">
                <Plus size={14} /> Add Row
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading || saving} className="gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Targets'}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 max-w-4xl space-y-4">
          <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 text-sm text-[hsl(150_20%_28%)]">
            Enabled targets: <strong>{enabledCount}</strong> / {targets.length}. Persisted rows: <strong>{persistedCount}</strong>.
          </div>

          <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3 text-xs text-[hsl(150_20%_28%)] space-y-1">
            {COLLECTIONS.map((collection) => (
              <p key={collection.key}>
                <strong>{collection.label}</strong>: {collection.pathPattern}
              </p>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin text-[hsl(142_60%_35%)]" />
              <span className="text-sm">Loading scrape targets…</span>
            </div>
          ) : (
            <div className="space-y-3">
              {targets.map((target, index) => (
                <div key={target.localId} className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[hsl(150_30%_18%)]">Target #{index + 1}</p>
                      <p className="text-xs text-muted-foreground">{labelForCollection(target.collection_key)}</p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeRow(target.localId)}
                      disabled={targets.length <= 1 || saving}
                      className="gap-2"
                    >
                      <Trash2 size={14} /> Remove
                    </Button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Collection</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={target.collection_key}
                        onChange={(e) => updateTarget(target.localId, { collection_key: e.target.value as HadithScrapeCollectionKey })}
                        disabled={saving}
                      >
                        {COLLECTIONS.map((collection) => (
                          <option key={collection.key} value={collection.key}>{collection.key}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Book #</Label>
                      <Input
                        value={target.book_number}
                        onChange={(e) => updateTarget(target.localId, { book_number: e.target.value })}
                        inputMode="numeric"
                        disabled={saving}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Hadith #</Label>
                      <Input
                        value={target.hadith_number}
                        onChange={(e) => updateTarget(target.localId, { hadith_number: e.target.value })}
                        inputMode="numeric"
                        disabled={saving}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Weight</Label>
                      <Input
                        value={target.weight}
                        onChange={(e) => updateTarget(target.localId, { weight: e.target.value })}
                        inputMode="numeric"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input
                        value={target.notes}
                        onChange={(e) => updateTarget(target.localId, { notes: e.target.value })}
                        placeholder="Optional context for this target"
                        disabled={saving}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Preview URL</Label>
                      <p className="text-xs rounded-md border border-[hsl(140_20%_88%)] px-3 py-2 bg-[hsl(142_50%_97%)] break-all">
                        {buildSunnahUrl(target)}
                      </p>
                    </div>
                  </div>

                  <Label className="mt-3 inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={target.enabled}
                      onChange={(e) => updateTarget(target.localId, { enabled: e.target.checked })}
                      disabled={saving}
                    />
                    Enable this target
                  </Label>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Daily picker chooses one UTC-day random target globally from enabled rows. If scrape fails, backend retries other targets before returning noCandidate.
          </div>

          {!!persistedCount && (
            <p className="text-xs text-muted-foreground">
              Persisted targets in DB: {persistedCount}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
