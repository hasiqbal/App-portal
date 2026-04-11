import { useState, useEffect, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Textarea } from '#/components/ui/textarea';
import { Switch } from '#/components/ui/switch';
import { AdhkarGroup, Dhikr, PRAYER_TIME_CATEGORIES, PRAYER_TIME_LABELS } from '#/types';
import { createAdhkarGroup, fetchAdhkar, fetchAdhkarGroups, saveDhikrViaEdge } from '#/lib/api';
import { toast } from 'sonner';
import { BookOpen, Loader2, ChevronDown, ChevronUp, CheckCircle2, X, ImagePlus, Trash2, ExternalLink, Copy, Languages, AlertTriangle, Maximize2, Minimize2, Eye, Bold, Italic, Underline, Type, Palette, List, ListOrdered } from 'lucide-react';
import { useUrduTranslation } from '#/hooks/useUrduTranslation';
import { supabase } from '#/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TipTapUnderline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Extension } from '@tiptap/core';

const SUPABASE_URL      = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';

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

const TAFSIRS = [
  { id: 0, label: 'Do not import tafsir' },
  { id: 169, label: 'Ibn Kathir (Abridged) (EN)' },
  { id: 168, label: "Ma'arif al-Qur'an (EN)" },
  { id: 817, label: 'Tazkirul Quran (EN)' },
] as const;

const stripHtmlToText = (html: string) => html
  .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<\/h[1-6]>/gi, '\n\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const fetchTafsirViaPublicApi = async (tafsirId: number, surah: number, ayah: number) => {
  const response = await fetch(`https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${surah}:${ayah}`);
  if (!response.ok) {
    throw new Error(`Tafsir API error (${response.status})`);
  }

  const json = await response.json() as {
    tafsir?: {
      text?: string;
      resource_name?: string;
      translated_name?: { name?: string };
      language_id?: number;
    };
  };

  return {
    text: stripHtmlToText(json.tafsir?.text ?? ''),
    label: json.tafsir?.translated_name?.name || json.tafsir?.resource_name || 'Tafsir',
  };
};

const FONT_SIZES = ['12px','14px','16px','18px','20px','24px','28px','32px'];
const TEXT_COLORS = ['#000000','#1f2937','#6b7280','#dc2626','#ea580c','#16a34a','#0284c7','#7c3aed','#db2777','#0f766e'];

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize }).run(),
    };
  },
});

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeDescriptionToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (looksLikeHtml(trimmed)) return value;
  return `<p>${escapeHtml(value).replace(/\n/g, '<br/>')}</p>`;
};

const getPreviewHtml = (value: string) => {
  const html = normalizeDescriptionToHtml(value);
  return html || '<p><em>No tafsir or app text added yet.</em></p>';
};

const RichDescriptionEditor = ({ value, onChange, expanded }: { value: string; onChange: (nextHtml: string) => void; expanded: boolean }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit, TipTapUnderline, TextStyle, Color, FontSize],
    content: normalizeDescriptionToHtml(value),
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      attributes: {
        class: `px-3 py-3 text-sm leading-relaxed focus:outline-none ${expanded ? 'min-h-[260px]' : 'min-h-[120px]'}`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeDescriptionToHtml(value);
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-[hsl(140_20%_88%)] overflow-hidden focus-within:ring-2 focus-within:ring-[hsl(142_60%_35%/0.3)] focus-within:border-[hsl(142_50%_70%)]">
      <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-[hsl(140_20%_88%)] bg-[hsl(140_30%_97%)]">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} className={`w-7 h-7 rounded flex items-center justify-center ${editor.isActive('bold') ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)]'}`}><Bold size={13} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} className={`w-7 h-7 rounded flex items-center justify-center ${editor.isActive('italic') ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)]'}`}><Italic size={13} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} className={`w-7 h-7 rounded flex items-center justify-center ${editor.isActive('underline') ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)]'}`}><Underline size={13} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} className={`w-7 h-7 rounded flex items-center justify-center ${editor.isActive('bulletList') ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)]'}`}><List size={13} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} className={`w-7 h-7 rounded flex items-center justify-center ${editor.isActive('orderedList') ? 'bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]' : 'text-muted-foreground hover:bg-[hsl(140_20%_94%)]'}`}><ListOrdered size={13} /></button>

        <div className="relative">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowSizePicker((v) => !v); setShowColorPicker(false); }} className="flex items-center gap-1 px-2 h-7 rounded text-xs text-muted-foreground hover:bg-[hsl(140_20%_94%)]">
            <Type size={12} /> Size
          </button>
          {showSizePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[hsl(140_20%_88%)] rounded-lg shadow-lg p-1 min-w-[90px]">
              {FONT_SIZES.map((size) => (
                <button key={size} type="button" onMouseDown={(e) => { e.preventDefault(); (editor.chain().focus() as ReturnType<typeof editor.chain> & { setFontSize: (value: string) => { run: () => boolean } }).setFontSize(size).run(); setShowSizePicker(false); }} className="w-full text-left px-2 py-1 text-xs hover:bg-[hsl(142_50%_95%)] rounded" style={{ fontSize: size }}>{size}</button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((v) => !v); setShowSizePicker(false); }} className="flex items-center gap-1 px-2 h-7 rounded text-xs text-muted-foreground hover:bg-[hsl(140_20%_94%)]">
            <Palette size={12} /> Colour
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[hsl(140_20%_88%)] rounded-lg shadow-lg p-2 min-w-[120px]">
              <div className="grid grid-cols-5 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button key={color} type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(color).run(); setShowColorPicker(false); }} className="w-5 h-5 rounded border border-border/50" style={{ background: color }} />
                ))}
              </div>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }} className="mt-1.5 w-full text-[11px] text-muted-foreground hover:text-foreground">Reset colour</button>
            </div>
          )}
        </div>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none" />
    </div>
  );
};

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
  tafsirId: number;
  importTafsir: boolean;
  loading: boolean;
  preview: {
    arabic: string;
    transliteration: string;
    translation: string;
    translationLabel: string;
    title: string;
    arabicTitle: string;
    reference: string;
    tafsir: string;
    tafsirLabel: string;
  } | null;
  error: string | null;
}

const PUBLIC_TRANSLATION_EDITION: Record<number, string> = {
  20: 'en.sahih',
  33: 'en.hilali',
  57: 'en.yusufali',
  84: 'en.asad',
  85: 'en.pickthall',
  95: 'en.maududi',
  131: 'en.sahih',
  149: 'en.sahih',
};

const fetchQuranViaPublicApi = async (
  surah: number,
  ayahFrom?: number,
  ayahTo?: number,
  translationId: number = 131,
): Promise<QuranFetchResult> => {
  const edition = PUBLIC_TRANSLATION_EDITION[translationId] ?? 'en.sahih';
  const base = `https://api.alquran.cloud/v1/surah/${surah}`;

  const [arabicRes, translitRes, translationRes] = await Promise.all([
    fetch(`${base}/quran-uthmani`),
    fetch(`${base}/en.transliteration`),
    fetch(`${base}/${edition}`),
  ]);

  if (!arabicRes.ok || !translationRes.ok) {
    throw new Error(`Public Quran API error (${arabicRes.status}/${translationRes.status})`);
  }

  const arabicJson = await arabicRes.json() as {
    data: { ayahs: Array<{ numberInSurah: number; text: string }>; englishName: string; name: string };
  };
  const translationJson = await translationRes.json() as {
    data: { ayahs: Array<{ numberInSurah: number; text: string }>; englishName: string };
  };

  const translitJson = translitRes.ok
    ? await translitRes.json() as { data: { ayahs: Array<{ numberInSurah: number; text: string }> } }
    : null;

  const allArabic = arabicJson.data.ayahs ?? [];
  const allTranslation = translationJson.data.ayahs ?? [];
  const allTranslit = translitJson?.data?.ayahs ?? [];

  const start = Math.max(1, ayahFrom ?? 1);
  const end = Math.min(allArabic.length, ayahTo ?? allArabic.length);
  if (start > end || allArabic.length === 0) throw new Error('No verses returned. Check ayah range.');

  const sliceStart = start - 1;
  const sliceEnd = end;
  const arabicSlice = allArabic.slice(sliceStart, sliceEnd);
  const translationSlice = allTranslation.slice(sliceStart, sliceEnd);
  const translitSlice = allTranslit.slice(sliceStart, sliceEnd);

  const arabic = arabicSlice.map((v) => `${v.text} \u{FD3E}${v.numberInSurah}\u{FD3F}`).join('\n');
  const transliteration = translitSlice.length > 0
    ? translitSlice.map((v) => `${v.text} (${v.numberInSurah})`).join('\n')
    : arabicSlice.map((v) => `(${v.numberInSurah})`).join('\n');
  const translation = translationSlice.length > 0
    ? translationSlice.map((v) => `${v.text} (${v.numberInSurah})`).join('\n')
    : arabicSlice.map((v) => `(${v.numberInSurah})`).join('\n');

  const refRange = start === end ? `${surah}:${start}` : `${surah}:${start}\u2013${end}`;

  return {
    arabic,
    transliteration,
    translation,
    surahName: translationJson.data.englishName || arabicJson.data.englishName || SURAHS[surah - 1],
    surahNameAr: SURAHS_AR[surah - 1] || arabicJson.data.name || '',
    reference: `Quran ${refRange}`,
    verseCount: arabicSlice.length,
    translationId,
  };
};

interface QuranPickerProps {
  onImport: (fields: {
    arabic: string;
    transliteration: string;
    translation: string;
    title: string;
    arabic_title: string;
    reference: string;
    tafsir?: string;
  }) => void;
  onClose: () => void;
}

const QuranPicker = ({ onImport, onClose }: QuranPickerProps) => {
  const [state, setState] = useState<QuranPickerState>({
    surah: 1, ayahFrom: '', ayahTo: '', translationId: 131, tafsirId: 0, importTafsir: false,
    loading: false, preview: null, error: null,
  });

  const set = <K extends keyof QuranPickerState>(key: K, val: QuranPickerState[K]) =>
    setState((prev) => ({ ...prev, [key]: val }));

  const fetchQuran = async () => {
    const { surah, ayahFrom, ayahTo, translationId, tafsirId } = state;
    const from = parseInt(ayahFrom, 10) || undefined;
    const to   = parseInt(ayahTo, 10)   || undefined;
    setState((prev) => ({ ...prev, loading: true, error: null, preview: null }));
    const { data, error } = await supabase.functions.invoke('quran-fetch', {
      body: { surah, ayahFrom: from, ayahTo: to, translationId },
    });
    let result: QuranFetchResult | null = null;

    if (!error) {
      result = data as QuranFetchResult;
    } else {
      let msg = error.message;
      let statusCode = 0;
      if (error instanceof FunctionsHttpError) {
        try {
          statusCode = error.context?.status ?? 0;
          const text = await error.context?.text();
          msg = `[${statusCode}] ${text || error.message}`;
        } catch {
          msg = error.message;
        }
      }

      const shouldFallback = statusCode === 404 || statusCode === 500 || /not found|failed to fetch|edge function/i.test(msg);

      if (shouldFallback) {
        try {
          result = await fetchQuranViaPublicApi(surah, from, to, translationId);
          toast.info('Quran import fallback is active (public API).');
        } catch (fallbackErr) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          setState((prev) => ({ ...prev, loading: false, error: `Primary API failed: ${msg}. Fallback failed: ${fallbackMsg}` }));
          return;
        }
      } else {
        setState((prev) => ({ ...prev, loading: false, error: msg }));
        return;
      }
    }

    if (!result) {
      setState((prev) => ({ ...prev, loading: false, error: 'Quran import returned no data.' }));
      return;
    }

    const surahName   = result.surahName   || SURAHS[surah - 1];
    const surahNameAr = result.surahNameAr || SURAHS_AR[surah - 1];
    const isFullSurah = !ayahFrom.trim() && !ayahTo.trim();
    const rangeStr = isFullSurah ? '' : to && to !== from ? ` (${from}–${to})` : from ? ` (${from})` : '';
    const translationLabel = TRANSLATIONS.find((option) => option.id === translationId)?.label ?? 'English Translation';
    let tafsir = '';
    let tafsirLabel = '';
    let warning = '';

    if (tafsirId !== 0) {
      try {
        const tafsirResult = await fetchTafsirViaPublicApi(tafsirId, surah, from ?? 1);
        tafsir = tafsirResult.text;
        tafsirLabel = tafsirResult.label;
      } catch (tafsirError) {
        warning = tafsirError instanceof Error ? tafsirError.message : 'Failed to fetch tafsir.';
      }
    }

    setState((prev) => ({
      ...prev, loading: false, error: warning || null,
      preview: {
        arabic: result.arabic, transliteration: result.transliteration, translation: result.translation,
        translationLabel,
        title: `Surah ${surahName}${rangeStr}`, arabicTitle: `سُورَةُ ${surahNameAr}`,
        reference: result.reference,
        tafsir,
        tafsirLabel,
      },
    }));
  };

  const handleImport = () => {
    if (!state.preview) return;
    onImport({
      arabic: state.preview.arabic, transliteration: state.preview.transliteration,
      translation: state.preview.translation, title: state.preview.title,
      arabic_title: state.preview.arabicTitle, reference: state.preview.reference,
      tafsir: state.importTafsir && state.preview.tafsir ? state.preview.tafsir : undefined,
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
        <Label className="text-xs font-medium text-emerald-800 mb-1 block">English Translation</Label>
        <select value={state.translationId} onChange={(e) => set('translationId', parseInt(e.target.value, 10))}
          className="w-full h-8 rounded-md border border-emerald-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {TRANSLATIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
        <div>
          <Label className="text-xs font-medium text-emerald-800 mb-1 block">Tafsir to Import</Label>
          <select
            value={state.tafsirId}
            onChange={(e) => {
              const nextTafsirId = parseInt(e.target.value, 10);
              set('tafsirId', nextTafsirId);
              set('importTafsir', nextTafsirId !== 0);
            }}
            className="w-full h-8 rounded-md border border-emerald-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400">
            {TAFSIRS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 h-8 text-[11px] font-medium text-emerald-800">
          <input
            type="checkbox"
            checked={state.importTafsir}
            disabled={state.tafsirId === 0}
            onChange={(e) => set('importTafsir', e.target.checked)}
          />
          Import into Tafsir field
        </label>
      </div>
      <Button onClick={fetchQuran} disabled={state.loading} size="sm" className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8">
        {state.loading ? <><Loader2 size={12} className="animate-spin" /> Fetching…</> : <><BookOpen size={12} /> Fetch Ayahs</>}
      </Button>
      {state.error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{state.error}</p>}
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
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">{state.preview.translationLabel}</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3">{state.preview.translation}</p>
            </div>
          </div>
          {state.preview.tafsir && (
            <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tafsir</p>
                <span className="text-[10px] text-emerald-700 font-medium">{state.preview.tafsirLabel}</span>
              </div>
              <p className="text-[11px] text-foreground/80 leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">{state.preview.tafsir}</p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Reference: <span className="font-medium text-foreground/70">{state.preview.reference}</span>
            {' · '}Title: <span className="font-medium text-foreground/70">{state.preview.title}</span>
          </p>
          <Button onClick={handleImport} size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
            <CheckCircle2 size={12} />Import into Form{state.importTafsir && state.preview.tafsir ? ' + Tafsir' : ''}
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
  onGroupCreated?: (group: AdhkarGroup) => void;
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
  urdu_translation: '',
  is_active: true,
  sections: null,
  file_url: '',
  tafsir: '',
  description: '',
};

type FormState = typeof EMPTY;

const DhikrModal = ({ open, row, presetGroup, onClose, onSaved, onGroupCreated, onFinalized, onRevert, onUpdated }: DhikrModalProps) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { translateToUrdu, translating: translatingUrdu } = useUrduTranslation();
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!row;
  const [existingGroups, setExistingGroups] = useState<AdhkarGroup[]>([]);
  const [groupOrderMap, setGroupOrderMap] = useState<Record<string, number | null>>({});
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [showQuranPicker, setShowQuranPicker] = useState(false);
  const [showMetaSection, setShowMetaSection] = useState(false);
  const [showTafsirEditor, setShowTafsirEditor] = useState(false);
  const [showDescriptionEditor, setShowDescriptionEditor] = useState(false);
  const [saveMode, setSaveMode] = useState<'update' | 'copy'>('update');
  const [existingEntries, setExistingEntries] = useState<Dhikr[]>([]);
  const [generatedUrdu, setGeneratedUrdu] = useState(false);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const existingGroupNames = existingGroups.map((group) => group.name).sort((left, right) => left.localeCompare(right));

  useEffect(() => {
    if (!open) return;
    fetchAdhkarGroups()
      .then((rows) => {
        const orderMap: Record<string, number | null> = {};
        rows.forEach((r) => {
          if (r.name && !(r.name in orderMap)) orderMap[r.name] = r.display_order;
        });
        setExistingGroups(rows);
        setGroupOrderMap(orderMap);
      })
      .catch((e) => console.error('Failed to load adhkar groups:', e));

    fetchAdhkar()
      .then((rows) => setExistingEntries(rows))
      .catch((e) => console.error('Failed to load adhkar entries:', e));
  }, [open]);

  useEffect(() => {
    if (row) {
      setForm({
        title: row.title, arabic_title: row.arabic_title ?? '', arabic: row.arabic,
        transliteration: row.transliteration ?? '', translation: row.translation ?? '',
        urdu_translation: row.urdu_translation ?? '',
        reference: row.reference ?? '', count: row.count, prayer_time: row.prayer_time,
        group_name: row.group_name ?? '', group_order: row.group_order ?? '',
        display_order: row.display_order ?? '', is_active: row.is_active,
        sections: row.sections, file_url: row.file_url ?? '', tafsir: row.tafsir ?? '',
        description: row.description ?? '',
      });
      setShowGroupInput(false);
      setShowQuranPicker(false);
      setShowMetaSection(false);
      setShowTafsirEditor(Boolean(row.tafsir?.trim()));
      setShowDescriptionEditor(Boolean(row.description?.trim()));
      setSaveMode('update');
      setGeneratedUrdu(false);
    } else {
      setForm({ ...EMPTY, ...(presetGroup ? { group_name: presetGroup.name, prayer_time: presetGroup.prayerTime } : {}) });
      setShowGroupInput(false);
      setShowQuranPicker(false);
      setShowMetaSection(false);
      setShowTafsirEditor(false);
      setShowDescriptionEditor(false);
      setSaveMode('copy');
      setGeneratedUrdu(false);
      setUploadingImage(false);
      setUploadingImage(false);
    }
  }, [row, open, presetGroup]);

  const duplicateInGroup = useMemo(() => {
    const title = form.title.trim().toLowerCase();
    const group = (form.group_name ?? '').trim().toLowerCase();
    if (!title || !group) return null;

    const duplicate = existingEntries.find((entry) => {
      if (isEdit && row?.id && entry.id === row.id) return false;
      return (entry.title ?? '').trim().toLowerCase() === title && (entry.group_name ?? '').trim().toLowerCase() === group;
    });

    return duplicate ?? null;
  }, [existingEntries, form.group_name, form.title, isEdit, row?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleQuranImport = (fields: {
    arabic: string; transliteration: string; translation: string;
    title: string; arabic_title: string; reference: string; tafsir?: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      arabic: fields.arabic, transliteration: fields.transliteration,
      translation: fields.translation,
      title: prev.title || fields.title,
      arabic_title: prev.arabic_title || fields.arabic_title,
      reference: fields.reference,
      tafsir: fields.tafsir ?? prev.tafsir,
    }));
    if (fields.tafsir) {
      setShowTafsirEditor(true);
    }
  };

  const isPlaceholder = !form.arabic.trim();

  const buildPayload = (resolvedGroupOrder?: number) => ({
    title: form.title.trim(),
    arabic_title: form.arabic_title?.trim() || null,
    arabic: form.arabic.trim() || '',
    transliteration: form.transliteration?.trim() || null,
    translation: form.translation?.trim() || null,
    urdu_translation: form.urdu_translation?.trim() || null,
    reference: form.reference?.trim() || null,
    count: form.count || '1',
    prayer_time: form.prayer_time,
    group_name: form.group_name?.trim() || null,
    group_order: form.group_order !== '' ? Number(form.group_order) : (resolvedGroupOrder ?? 0),
    display_order: form.display_order !== '' ? Number(form.display_order) : 0,
    is_active: form.is_active,
    sections: form.sections,
    file_url: form.file_url?.trim() || null,
    tafsir: stripHtmlToText(form.tafsir ?? '') ? form.tafsir.trim() : null,
    description: form.description?.trim() || null,
  });

  const ensureGroupExists = async (): Promise<AdhkarGroup | null> => {
    const groupName = form.group_name?.trim();
    if (!groupName) return null;

    const existingGroup = existingGroups.find((group) => group.name === groupName);
    if (existingGroup) return existingGroup;

    const maxDisplayOrder = existingGroups.reduce((maxValue, group) => Math.max(maxValue, group.display_order ?? 0), 0);
    const displayOrder = form.group_order !== '' ? Number(form.group_order) : maxDisplayOrder + 10;

    const createdGroup = await createAdhkarGroup({
      name: groupName,
      prayer_time: form.prayer_time,
      icon: '📿',
      icon_color: '#ffffff',
      icon_bg_color: '#0f766e',
      badge_text: null,
      badge_color: '#0f766e',
      description: null,
      display_order: displayOrder,
    });

    setExistingGroups((prev) => [...prev, createdGroup]);
    setGroupOrderMap((prev) => ({ ...prev, [createdGroup.name]: createdGroup.display_order }));
    onGroupCreated?.(createdGroup);
    return createdGroup;
  };

  // ── Save as New Copy: creates a new entry, original stays intact ──────────
  const handleSaveAsCopy = async () => {
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    let tempId: string | null = null;
    try {
      const groupMeta = await ensureGroupExists();
      const payload = buildPayload(groupMeta?.display_order ?? undefined);
      tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: Dhikr = { id: tempId, ...payload, created_at: now, updated_at: now };
      onSaved(optimistic);
      onClose();
      const real = await saveDhikrViaEdge('create', payload);
      onFinalized?.(tempId, real);
      toast.success(isEdit ? 'Saved as new entry.' : 'Dhikr added.');
    } catch (err: unknown) {
      if (tempId) onRevert?.(tempId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Save Changes: updates the existing entry in-place ────────────────────
  const handleSaveChanges = async () => {
    if (!row?.id) return;
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    try {
      const groupMeta = await ensureGroupExists();
      const payload = buildPayload(groupMeta?.display_order ?? undefined);
      const optimistic: Dhikr = { ...row, ...payload, updated_at: new Date().toISOString() };
      onUpdated?.(optimistic);
      onClose();
      const real = await saveDhikrViaEdge('update', payload, row.id);
      onUpdated?.(real);
      toast.success('Changes saved.');
    } catch (err: unknown) {
      onUpdated?.(row);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save changes: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrimarySave = async () => {
    if (isEdit && saveMode === 'update') {
      await handleSaveChanges();
      return;
    }
    await handleSaveAsCopy();
  };

  const handleModalKeyDown = async (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isTextArea = target.tagName === 'TEXTAREA';
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (!saving) await handlePrimarySave();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !isTextArea) {
      e.preventDefault();
      if (!saving) await handlePrimarySave();
    }
  };

  const handleAutoFillMissingTranslations = async () => {
    let changed = false;
    const englishTranslation = form.translation.trim();

    if (!form.urdu_translation.trim() && englishTranslation) {
      const urduSource = englishTranslation;
      if (urduSource) {
        const translated = await translateToUrdu(urduSource);
        if (translated) {
          set('urdu_translation', translated);
          setGeneratedUrdu(true);
          changed = true;
        }
      }
    }

    if (changed) {
      toast.success('Filled the Urdu translation from the English translation.');
      return;
    }

    if (!englishTranslation) {
      toast('Add or import the English translation first, then auto-fill Urdu.');
      return;
    }

    toast('No missing translation fields to fill.');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto border-[hsl(140_20%_88%)]" onKeyDown={handleModalKeyDown}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
                <BookOpen size={15} className="text-[hsl(142_60%_32%)]" />
              </div>
              {isEdit ? 'Edit Dhikr' : 'Add New Dhikr'}
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
                  ? 'border-[hsl(142_50%_70%)] bg-[hsl(142_50%_93%)] text-[hsl(142_60%_28%)]'
                  : 'border-[hsl(142_50%_75%)] bg-[hsl(142_50%_97%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_93%)]'
              }`}
              title="Import Arabic text from Quran"
            >
              <BookOpen size={13} />Quran Import
              {showQuranPicker ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>

          {isEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input type="radio" checked={saveMode === 'update'} onChange={() => setSaveMode('update')} />
                Update existing
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input type="radio" checked={saveMode === 'copy'} onChange={() => setSaveMode('copy')} />
                Duplicate and save as new copy
              </label>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch id="is_active_top" checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
              <Label htmlFor="is_active_top" className="cursor-pointer text-xs">Active in app</Label>
            </div>
            <span className="text-[10px] text-muted-foreground">Enter to save · Ctrl+Enter quick save</span>
          </div>

          {duplicateInGroup && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2">
              <AlertTriangle size={13} />
              Possible duplicate: same title already exists in this group.
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5 py-1">
          {showQuranPicker && <QuranPicker onImport={handleQuranImport} onClose={() => setShowQuranPicker(false)} />}

          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Basic Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Title * <span className="text-muted-foreground font-normal">(required)</span></Label>
                <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Surah Al-Ikhlas" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arabic_title" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Arabic Title</Label>
                <Input id="arabic_title" value={form.arabic_title} onChange={(e) => set('arabic_title', e.target.value)} placeholder="سُورَةُ الإِخْلَاص" dir="rtl" className="text-right font-arabic" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="group_name" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Name</Label>
                {!showGroupInput ? (
                  <div className="flex gap-1.5">
                    <select
                      id="group_name"
                      value={form.group_name}
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
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— None —</option>
                      {existingGroupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                      <option value="__new__">+ Add new group…</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Input ref={groupInputRef} id="group_name" value={form.group_name} onChange={(e) => set('group_name', e.target.value)} placeholder="New group name…" className="flex-1" />
                    <button type="button" onClick={() => { setShowGroupInput(false); if (!existingGroupNames.includes(form.group_name as string) && !(form.group_name as string).trim()) set('group_name', ''); }} className="px-2 h-9 rounded-md border border-input text-xs text-muted-foreground hover:bg-secondary transition-colors" title="Back to list">↩</button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prayer_time" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Prayer Time</Label>
                <select id="prayer_time" value={form.prayer_time} onChange={(e) => set('prayer_time', e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                  {PRAYER_TIME_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{PRAYER_TIME_LABELS[cat] ?? cat}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="count" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Count / Repetitions</Label>
                <Input id="count" value={form.count} onChange={(e) => set('count', e.target.value)} placeholder="e.g. 3 or 33" />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Content</h3>
              <button
                type="button"
                disabled={translatingUrdu || saving}
                onClick={handleAutoFillMissingTranslations}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-50 transition-colors"
              >
                {translatingUrdu ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
                Auto-fill missing translations
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="arabic" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Arabic Text</Label>
                  {isPlaceholder && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Placeholder</span>}
                </div>
                <Textarea
                  id="arabic"
                  value={form.arabic}
                  onChange={(e) => set('arabic', e.target.value)}
                  placeholder="Leave empty to save as a placeholder…"
                  className="text-right leading-[2.5] min-h-[220px]"
                  dir="rtl"
                  style={{ fontFamily: '"Scheherazade New", serif', fontSize: '1.2rem' }}
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="transliteration" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Transliteration</Label>
                  <Textarea id="transliteration" value={form.transliteration} onChange={(e) => set('transliteration', e.target.value)} placeholder="Subhana-llah..." className="min-h-[74px] text-sm" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="translation" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Translation</Label>
                  </div>
                  <Textarea id="translation" value={form.translation} onChange={(e) => set('translation', e.target.value)} placeholder="Glory be to Allah..." className="min-h-[84px] text-sm" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="urdu_translation" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Urdu Translation</Label>
                    {generatedUrdu && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">⚡ Generated from English</span>}
                  </div>
                  <Textarea
                    id="urdu_translation"
                    value={form.urdu_translation}
                    onChange={(e) => { set('urdu_translation', e.target.value); setGeneratedUrdu(false); }}
                    placeholder="اردو ترجمہ یہاں لکھیں…"
                    dir="rtl"
                    className="min-h-[84px] text-sm text-right"
                    style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: '2.1' }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[hsl(145_28%_84%)] bg-[hsl(145_35%_97%)] p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[hsl(150_30%_24%)]">Tafsir / App Text</p>
                  <p className="text-[11px] text-[hsl(150_18%_42%)]">Use this for the app-facing explanation or a shortened tafsir excerpt.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowTafsirEditor((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(145_28%_78%)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[hsl(150_30%_26%)] hover:bg-[hsl(145_35%_95%)]"
                  >
                    {showTafsirEditor ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    {showTafsirEditor ? 'Collapse Editor' : 'Expand Editor'}
                  </button>
                </div>
              </div>

              {showTafsirEditor && (
                <div className="space-y-3 rounded-lg border border-[hsl(145_20%_84%)] bg-white p-3">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[hsl(150_30%_18%)]">Editable Tafsir / App Text</Label>
                      <RichDescriptionEditor
                        value={form.tafsir}
                        onChange={(nextHtml) => set('tafsir', nextHtml)}
                        expanded={showTafsirEditor}
                      />
                      <p className="text-[10px] text-muted-foreground">This supports rich formatting: bold, italic, underline, font size, color, and lists.</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(150_30%_18%)]">
                        <Eye size={12} /> App Preview
                      </div>
                      <div className="min-h-[260px] rounded-lg border border-[hsl(145_20%_84%)] bg-[hsl(145_22%_99%)] px-4 py-3 text-[hsl(150_14%_34%)]">
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: getPreviewHtml(form.tafsir) }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Description / Benefits ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Description / Benefits</p>
                <p className="text-[11px] text-amber-700/70">Short benefits text — displayed as the Benefits button in the app.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDescriptionEditor((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
              >
                {showDescriptionEditor ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                {showDescriptionEditor ? 'Collapse' : 'Expand Editor'}
              </button>
            </div>
            {showDescriptionEditor && (
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="e.g. Whoever recites this 10 times after Fajr…"
                className="min-h-[100px] text-sm bg-white"
              />
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-3">
            <button
              type="button"
              onClick={() => setShowMetaSection((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Meta (advanced)</span>
              {showMetaSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showMetaSection && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="group_order" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Group Order</Label>
                    <Input id="group_order" type="number" min={1} value={form.group_order} onChange={(e) => set('group_order', e.target.value)} placeholder="e.g. 100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="display_order" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Display Order</Label>
                    <Input id="display_order" type="number" min={1} value={form.display_order} onChange={(e) => set('display_order', e.target.value)} placeholder="e.g. 10" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reference" className="text-xs font-semibold text-[hsl(150_30%_18%)]">Reference</Label>
                  <Input id="reference" value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="e.g. Quran 112 or Bukhari 1234" />
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
                      <img src={form.file_url} alt="Attached file" className="object-contain w-full" style={{ maxHeight: 180 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <button type="button" onClick={() => set('file_url', '')} className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/90 text-white hover:bg-destructive transition-colors shadow" title="Remove image">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input value={form.file_url} onChange={(e) => set('file_url', e.target.value)} placeholder="https://... or upload below" className="flex-1 text-sm" />
                    <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] text-xs font-medium hover:bg-[hsl(142_50%_95%)] transition-colors disabled:opacity-50 shrink-0">
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
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="pt-2 gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} className="border-[hsl(140_20%_88%)]">Cancel</Button>
          {isEdit && (
            <Button
              variant="outline"
              onClick={() => { setSaveMode('copy'); void handleSaveAsCopy(); }}
              className="gap-1.5 border-[hsl(142_50%_75%)] text-[hsl(142_60%_32%)] hover:bg-[hsl(142_50%_95%)]"
            >
              <Copy size={13} /> Duplicate and Save
            </Button>
          )}
          <Button
            onClick={() => { void handlePrimarySave(); }}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {isEdit ? (saveMode === 'update' ? 'Save Changes' : 'Save as New Copy') : 'Add Dhikr'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DhikrModal;
