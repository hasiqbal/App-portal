import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dhikr, PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '@/types';
import { createDhikr, updateDhikr } from '@/lib/api';
import { toast } from 'sonner';
import { BookOpen, Loader2, ChevronDown, ChevronUp, CheckCircle2, X, ImagePlus, Trash2, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

const BASE_URL = 'https://ucpmwygyuvbfehjpucpm.backend.onspace.ai/rest/v1';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcG13eWd5dXZiZmVoanB1Y3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDgxMTksImV4cCI6MjA1OTQyNDExOX0.i8tlNr0s9g7D7VhWKUFxXBwU_YhWEarUOBsmCIi-lEA';
const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': ANON_KEY,
};

// 114 Surah names for the picker
const SURAHS = [
  "Al-Fatihah","Al-Baqarah","Ali 'Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus",
  "Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha",
  "Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-'Ankabut","Ar-Rum",
  "Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir",
  "Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf",
  "Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah",
  "As-Saf","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij",
  "Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","'Abasa",
  "At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad",
  "Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-'Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-'Adiyat",
  "Al-Qari'ah","At-Takathur","Al-'Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr",
  "Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas",
];

const SURAHS_AR = [
  "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
  "هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
  "الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
  "لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
  "فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
  "الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
  "الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
  "نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
  "التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
  "الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
  "القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
  "المسد","الإخلاص","الفلق","الناس",
];

const TRANSLATIONS = [
  { id: 131, label: 'Dr. Mustafa Khattab — The Clear Quran (EN)' },
  { id: 20,  label: 'Saheeh International (EN)' },
  { id: 85,  label: 'Marmaduke Pickthall (EN)' },
  { id: 57,  label: 'Abdullah Yusuf Ali (EN)' },
  { id: 95,  label: 'Mufti Taqi Usmani (EN)' },
  { id: 33,  label: 'Dr. Mohsin Khan & Al-Hilali (EN)' },
  { id: 149, label: 'Abdul Haleem — Oxford (EN)' },
  { id: 84,  label: 'Muhammad Asad (EN)' },
] as const;

interface QuranFetchResult {
  arabic: string;
  transliteration: string;
  translation: string;
  surahName: string;
  surahNameAr: string;
  reference: string;
  verseCount: number;
  translationId: number;
}

interface QuranPickerState {
  surah: number;
  ayahFrom: string;
  ayahTo: string;
  translationId: number;
  loading: boolean;
  preview: {
    arabic: string;
    transliteration: string;
    translation: string;
    title: string;
    arabicTitle: string;
    reference: string;
  } | null;
  error: string | null;
}

interface QuranPickerProps {
  onImport: (fields: {
    arabic: string;
    transliteration: string;
    translation: string;
    title: string;
    arabic_title: string;
    reference: string;
  }) => void;
  onClose: () => void;
}

const QuranPicker = ({ onImport, onClose }: QuranPickerProps) => {
  const [state, setState] = useState<QuranPickerState>({
    surah: 1, ayahFrom: '', ayahTo: '', translationId: 131,
    loading: false, preview: null, error: null,
  });

  const set = <K extends keyof QuranPickerState>(key: K, val: QuranPickerState[K]) =>
    setState((prev) => ({ ...prev, [key]: val }));

  const fetchQuran = async () => {
    const { surah, ayahFrom, ayahTo, translationId } = state;
    const from = parseInt(ayahFrom, 10) || undefined;
    const to   = parseInt(ayahTo, 10)   || undefined;
    setState((prev) => ({ ...prev, loading: true, error: null, preview: null }));
    const { data, error } = await supabase.functions.invoke('quran-fetch', {
      body: { surah, ayahFrom: from, ayahTo: to, translationId },
    });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = error.context?.status ?? 500;
          const text = await error.context?.text();
          msg = `[${statusCode}] ${text || error.message}`;
        } catch { /* keep original */ }
      }
      setState((prev) => ({ ...prev, loading: false, error: msg }));
      return;
    }
    const result = data as QuranFetchResult;
    const surahName   = result.surahName   || SURAHS[surah - 1];
    const surahNameAr = result.surahNameAr || SURAHS_AR[surah - 1];
    const isFullSurah = !ayahFrom.trim() && !ayahTo.trim();
    const rangeStr = isFullSurah ? '' : to && to !== from ? ` (${from}–${to})` : from ? ` (${from})` : '';
    setState((prev) => ({
      ...prev, loading: false,
      preview: {
        arabic: result.arabic, transliteration: result.transliteration, translation: result.translation,
        title: `Surah ${surahName}${rangeStr}`, arabicTitle: `سُورَةُ ${surahNameAr}`,
        reference: result.reference,
      },
    }));
  };

  const handleImport = () => {
    if (!state.preview) return;
    onImport({
      arabic: state.preview.arabic, transliteration: state.preview.transliteration,
      translation: state.preview.translation, title: state.preview.title,
      arabic_title: state.preview.arabicTitle, reference: state.preview.reference,
    });
    onClose();
    toast.success(`Imported ${state.preview.title}`);
  };

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 space-y-3 mt-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-emerald-700" />
          <span className="text-sm font-semibold text-emerald-800">Import from Quran</span>
          <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">@quranjs/api</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-emerald-100 transition-colors">
          <X size={13} className="text-emerald-700" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label className="text-xs font-medium text-emerald-800 mb-1 block">Surah</Label>
          <select value={state.surah} onChange={(e) => set('surah', parseInt(e.target.value, 10))}
            className="w-full h-8 rounded-md border border-emerald-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400">
            {SURAHS.map((name, i) => <option key={i + 1} value={i + 1}>{i + 1}. {name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium text-emerald-800 mb-1 block">From Ayah</Label>
          <Input value={state.ayahFrom} onChange={(e) => set('ayahFrom', e.target.value)} placeholder="1 (optional)" className="h-8 text-xs border-emerald-300 bg-white" type="number" min={1} />
        </div>
        <div>
          <Label className="text-xs font-medium text-emerald-800 mb-1 block">To Ayah</Label>
          <Input value={state.ayahTo} onChange={(e) => set('ayahTo', e.target.value)} placeholder="end (optional)" className="h-8 text-xs border-emerald-300 bg-white" type="number" min={1} />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-emerald-800 mb-1 block">Translation</Label>
        <select value={state.translationId} onChange={(e) => set('translationId', parseInt(e.target.value, 10))}
          className="w-full h-8 rounded-md border border-emerald-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {TRANSLATIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <Button onClick={fetchQuran} disabled={state.loading} size="sm" className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8">
        {state.loading ? <><Loader2 size={12} className="animate-spin" /> Fetching…</> : <><BookOpen size={12} /> Fetch Ayahs</>}
      </Button>
      {state.error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>}
      {state.preview && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={13} />Preview — {state.preview.title}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Arabic</p>
              <span className="text-[8px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">Indo-Pak Script</span>
            </div>
            <p dir="rtl" className="text-right leading-[2.4] text-foreground/90 line-clamp-6"
              style={{ fontFamily: '"Scheherazade New", serif', fontSize: '1.25rem' }}>{state.preview.arabic}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Transliteration</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3">{state.preview.transliteration}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Translation</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3">{state.preview.translation}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Reference: <span className="font-medium text-foreground/70">{state.preview.reference}</span>
            {' · '}Title: <span className="font-medium text-foreground/70">{state.preview.title}</span>
          </p>
          <Button onClick={handleImport} size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
            <CheckCircle2 size={12} />Import into Form
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface DhikrModalProps {
  open: boolean;
  row: Dhikr | null;
  presetGroup?: { name: string; prayerTime: string } | null;
  onClose: () => void;
  onSaved: (dhikr: Dhikr) => void;
  onFinalized?: (tempId: string, real: Dhikr) => void;
  onRevert?: (tempId: string) => void;
  /** Called when the user chooses "Save Changes" (update in-place, no new entry) */
  onUpdated?: (dhikr: Dhikr) => void;
}

const EMPTY = {
  title: '',
  arabic_title: '',
  arabic: '',
  transliteration: '',
  translation: '',
  reference: '',
  count: '1',
  prayer_time: 'after-fajr',
  group_name: '',
  group_order: '' as number | string,
  display_order: '' as number | string,
  is_active: true,
  sections: null,
  file_url: '',
  description: '',
};

type FormState = typeof EMPTY;

const DhikrModal = ({ open, row, presetGroup, onClose, onSaved, onFinalized, onRevert, onUpdated }: DhikrModalProps) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!row;
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [groupOrderMap, setGroupOrderMap] = useState<Record<string, number | null>>({});
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [showQuranPicker, setShowQuranPicker] = useState(false);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${BASE_URL}/adhkar?select=group_name,group_order&order=group_name.asc,group_order.asc`, {
      headers: AUTH_HEADERS,
    })
      .then((r) => r.json())
      .then((rows: { group_name: string | null; group_order: number | null }[]) => {
        const orderMap: Record<string, number | null> = {};
        rows.forEach((r) => {
          if (r.group_name && !(r.group_name in orderMap)) orderMap[r.group_name] = r.group_order;
        });
        setExistingGroups(Object.keys(orderMap).sort());
        setGroupOrderMap(orderMap);
      })
      .catch((e) => console.error('Failed to load group names:', e));
  }, [open]);

  useEffect(() => {
    if (row) {
      setForm({
        title: row.title, arabic_title: row.arabic_title ?? '', arabic: row.arabic,
        transliteration: row.transliteration ?? '', translation: row.translation ?? '',
        reference: row.reference ?? '', count: row.count, prayer_time: row.prayer_time,
        group_name: row.group_name ?? '', group_order: row.group_order ?? '',
        display_order: row.display_order ?? '', is_active: row.is_active,
        sections: row.sections, file_url: row.file_url ?? '', description: row.description ?? '',
      });
      setShowGroupInput(false);
      setShowQuranPicker(false);
    } else {
      setForm({ ...EMPTY, ...(presetGroup ? { group_name: presetGroup.name, prayer_time: presetGroup.prayerTime } : {}) });
      setShowGroupInput(false);
      setShowQuranPicker(false);
      setUploadingImage(false);
    }
  }, [row, open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleQuranImport = (fields: {
    arabic: string; transliteration: string; translation: string;
    title: string; arabic_title: string; reference: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      arabic: fields.arabic, transliteration: fields.transliteration,
      translation: fields.translation,
      title: prev.title || fields.title,
      arabic_title: prev.arabic_title || fields.arabic_title,
      reference: fields.reference,
    }));
  };

  const isPlaceholder = !form.arabic.trim();

  const buildPayload = () => ({
    title: form.title.trim(),
    arabic_title: form.arabic_title?.trim() || null,
    arabic: form.arabic.trim() || '',
    transliteration: form.transliteration?.trim() || null,
    translation: form.translation?.trim() || null,
    reference: form.reference?.trim() || null,
    count: form.count || '1',
    prayer_time: form.prayer_time,
    group_name: form.group_name?.trim() || null,
    group_order: form.group_order !== '' ? Number(form.group_order) : 0,
    display_order: form.display_order !== '' ? Number(form.display_order) : 0,
    is_active: form.is_active,
    sections: form.sections,
    file_url: form.file_url?.trim() || null,
    description: form.description?.trim() || null,
  });

  // ── Save as New Copy: creates a new entry, original stays intact ──────────
  const handleSaveAsCopy = () => {
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    const payload = buildPayload();
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: Dhikr = { id: tempId, ...payload, created_at: now, updated_at: now };
    onSaved(optimistic);
    createDhikr(payload)
      .then((real) => {
        onFinalized?.(tempId, real);
        toast.success(isEdit ? 'Saved as new entry — original preserved.' : 'Dhikr added.');
      })
      .catch((err: unknown) => {
        onRevert?.(tempId);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Failed to save: ${msg}`);
      });
  };

  // ── Save Changes: updates the existing entry in-place ────────────────────
  const handleSaveChanges = () => {
    if (!row?.id) return;
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    const payload = buildPayload();
    // Optimistic update
    const optimistic: Dhikr = { ...row, ...payload, updated_at: new Date().toISOString() };
    onUpdated?.(optimistic);
    updateDhikr(row.id, payload)
      .then((real) => {
        onUpdated?.(real);
        toast.success('Changes saved.');
      })
      .catch(() => {
        onUpdated?.(row); // revert to original
        toast.error('Failed to save changes.');
      });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {isEdit ? 'Edit Dhikr' : 'Add New Dhikr'}
              {isEdit && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <Copy size={9} /> saves as new copy
                </span>
              )}
              {isEdit && isPlaceholder && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  ⏳ Placeholder
                </span>
              )}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setShowQuranPicker((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                showQuranPicker
                  ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
              title="Import Arabic text from Quran"
            >
              <BookOpen size={13} />Quran Import
              {showQuranPicker ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>
          {isEdit && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Saving will create a <strong>new separate entry</strong> with your changes. The original entry remains unchanged. Delete it manually if no longer needed.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {showQuranPicker && <QuranPicker onImport={handleQuranImport} onClose={() => setShowQuranPicker(false)} />}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title * <span className="text-muted-foreground font-normal text-xs">(required)</span></Label>
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Surah Al-Ikhlas" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arabic_title">Arabic Title</Label>
              <Input id="arabic_title" value={form.arabic_title} onChange={(e) => set('arabic_title', e.target.value)}
                placeholder="سُورَةُ الإِخْلَاص" dir="rtl" className="text-right font-arabic" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="arabic">Arabic Text</Label>
              {isPlaceholder && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  ⏳ Placeholder — content coming soon
                </span>
              )}
            </div>
            <Textarea id="arabic" value={form.arabic} onChange={(e) => set('arabic', e.target.value)}
              placeholder="Leave empty to save as a placeholder…" className="text-right leading-[2.6] min-h-[90px]"
              dir="rtl" style={{ fontFamily: '"Scheherazade New", serif', fontSize: '1.2rem' }} />
            {isPlaceholder && (
              <p className="text-[11px] text-amber-600 leading-snug">
                This entry will be visible with the title only. Fill in the Arabic text later to complete it.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transliteration">Transliteration</Label>
            <Textarea id="transliteration" value={form.transliteration} onChange={(e) => set('transliteration', e.target.value)}
              placeholder="Subḥāna-llāh..." className="min-h-[60px] text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="translation">Translation</Label>
            <Textarea id="translation" value={form.translation} onChange={(e) => set('translation', e.target.value)}
              placeholder="Glory be to Allah..." className="min-h-[60px] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prayer_time">Prayer Time</Label>
              <div
                id="prayer_time"
                className="flex items-center gap-2 h-9 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground select-none"
                title="Prayer time is set at the group level — edit the group to change it"
              >
                <span className="text-base leading-none">🔒</span>
                <span>{PRAYER_TIME_LABELS[form.prayer_time] ?? form.prayer_time}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 font-medium">group-level</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Change via the group's ⚙ Edit button.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="count">Count / Repetitions</Label>
              <Input id="count" value={form.count} onChange={(e) => set('count', e.target.value)} placeholder="e.g. 3 or 33" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="group_name">Group Name</Label>
              {!showGroupInput ? (
                <div className="flex gap-1.5">
                  <select id="group_name" value={form.group_name}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowGroupInput(true); set('group_name', '');
                        setTimeout(() => groupInputRef.current?.focus(), 50);
                      } else {
                        set('group_name', e.target.value);
                        if (e.target.value && e.target.value in groupOrderMap) {
                          const autoOrder = groupOrderMap[e.target.value];
                          set('group_order', autoOrder !== null ? autoOrder : '');
                        }
                      }
                    }}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">— None —</option>
                    {existingGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="__new__">+ Add new group…</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Input ref={groupInputRef} id="group_name" value={form.group_name}
                    onChange={(e) => set('group_name', e.target.value)} placeholder="New group name…" className="flex-1" />
                  <button type="button" onClick={() => { setShowGroupInput(false); if (!existingGroups.includes(form.group_name as string) && !(form.group_name as string).trim()) set('group_name', ''); }}
                    className="px-2 h-9 rounded-md border border-input text-xs text-muted-foreground hover:bg-secondary transition-colors" title="Back to list">↩</button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group_order">Group Order</Label>
              <Input id="group_order" type="number" min={1} value={form.group_order} onChange={(e) => set('group_order', e.target.value)} placeholder="e.g. 100" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_order">Display Order</Label>
              <Input id="display_order" type="number" min={1} value={form.display_order} onChange={(e) => set('display_order', e.target.value)} placeholder="e.g. 10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Short description visible in the app…" className="min-h-[60px] text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" value={form.reference} onChange={(e) => set('reference', e.target.value)}
              placeholder="e.g. Quran 112 or Bukhari 1234" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Image / File URL</Label>
              {form.file_url && (
                <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <ExternalLink size={11} /> Preview
                </a>
              )}
            </div>
            {form.file_url && (
              <div className="relative w-full rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center" style={{ maxHeight: 180 }}>
                <img src={form.file_url} alt="Attached file" className="object-contain w-full" style={{ maxHeight: 180 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <button type="button" onClick={() => set('file_url', '')}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/90 text-white hover:bg-destructive transition-colors shadow" title="Remove image">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <Input value={form.file_url} onChange={(e) => set('file_url', e.target.value)} placeholder="https://... or upload below" className="flex-1 text-sm" />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 shrink-0">
                {uploadingImage ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {uploadingImage ? 'Uploading…' : 'Upload'}
              </button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,application/pdf" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  const ext = file.name.split('.').pop() ?? 'jpg';
                  const path = `adhkar/${crypto.randomUUID()}.${ext}`;
                  const { data, error } = await supabase.storage.from('adhkar-images').upload(path, file, { contentType: file.type, upsert: false });
                  setUploadingImage(false);
                  if (error || !data) { toast.error('Image upload failed: ' + (error?.message ?? 'Unknown error')); return; }
                  const { data: urlData } = supabase.storage.from('adhkar-images').getPublicUrl(data.path);
                  set('file_url', urlData.publicUrl);
                  toast.success('Image uploaded successfully.');
                  if (imageInputRef.current) imageInputRef.current.value = '';
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Upload an image to the adhkar-images storage bucket, or paste a public URL.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            <Label htmlFor="is_active" className="cursor-pointer">Active (visible in app)</Label>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {isEdit && (
            <Button
              variant="outline"
              onClick={() => { handleSaveAsCopy(); onClose(); }}
              className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Copy size={13} /> Save as New Copy
            </Button>
          )}
          <Button
            onClick={() => { isEdit ? handleSaveChanges() : handleSaveAsCopy(); onClose(); }}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {isEdit ? 'Save Changes' : 'Add Dhikr'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DhikrModal;
