// ─── Hijri Calendar (separate table, keyed by gregorian year/month/day) ─────
export interface HijriCalendarEntry {
  id?: string;
  gregorian_year: number;
  gregorian_month: number;
  gregorian_day: number;
  gregorian_date: string;   // DD/MM/YYYY
  hijri_date: string;       // e.g. "5 Shawwal 1447 AH"
  created_at?: string;
  updated_at?: string;
}

export interface HijriMonthOverride {
  id?: string;
  hijri_year: number;
  hijri_month: number; // 1-12
  days_in_month: 29 | 30;
  created_at?: string;
  updated_at?: string;
}

export interface PrayerTime {
  id: string;
  month: number;
  day: number;
  fajr: string | null;
  fajr_jamat: string | null;
  sunrise: string;
  ishraq: string | null;
  zawaal: string | null;
  zuhr: string;
  zuhr_jamat: string | null;
  asr: string;
  asr_jamat: string | null;
  maghrib: string;
  maghrib_jamat: string | null;
  isha: string;
  isha_jamat: string | null;
  jumu_ah_1: string | null;
  jumu_ah_2: string | null;
  created_at: string;
  updated_at: string;
}

export type PrayerTimeUpdate = Partial<Omit<PrayerTime, 'id' | 'created_at' | 'updated_at'>>;

export type AdhkarContentType = 'adhkar' | 'quran' | 'qaseedah' | 'naat';
export type AdhkarContentSource = 'db' | 'local' | 'api';
export type QaseedahNaatType = 'qaseedah' | 'naat';

export interface Dhikr {
  id: string;
  title: string;
  arabic_title: string | null;
  arabic: string;
  transliteration: string | null;
  translation: string | null;
  urdu_translation: string | null;
  reference: string | null;
  count: string;
  prayer_time: string;
  group_name: string | null;
  group_order: number | null;
  display_order: number | null;
  sections: unknown | null;
  is_active: boolean;
  file_url: string | null;
  content_type?: AdhkarContentType | null;
  content_source?: AdhkarContentSource | null;
  content_key?: string | null;
  tafsir: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type DhikrPayload = Omit<Dhikr, 'id' | 'created_at' | 'updated_at'>;

export interface QaseedahNaatGroup {
  id: string;
  name: string;
  content_type: QaseedahNaatType;
  legacy_group_name: string | null;
  description: string | null;
  icon: string;
  icon_color: string;
  icon_bg_color: string;
  badge_text: string | null;
  badge_color: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type QaseedahNaatGroupPayload = Omit<QaseedahNaatGroup, 'id' | 'created_at' | 'updated_at'>;

export interface QaseedahNaatEntry {
  id: string;
  group_id: string;
  group_name: string;
  content_type: QaseedahNaatType;
  legacy_adhkar_id: string | null;
  title: string;
  arabic_title: string | null;
  arabic: string;
  transliteration: string | null;
  translation: string | null;
  urdu_translation: string | null;
  reference: string | null;
  count: string;
  prayer_time: string;
  display_order: number;
  is_active: boolean;
  sections: unknown | null;
  file_url: string | null;
  tafsir: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type QaseedahNaatEntryPayload = Omit<QaseedahNaatEntry, 'id' | 'group_name' | 'created_at' | 'updated_at'>;

export type HowToLanguage = 'en' | 'ur' | 'ar';
export type HowToBlockKind = 'text' | 'action' | 'note' | 'recitation';

export interface HowToGroup {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type HowToGroupPayload = Omit<HowToGroup, 'id' | 'created_at' | 'updated_at'>;

export interface HowToGuide {
  id: string;
  group_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  intro: string | null;
  language: HowToLanguage;
  icon: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
  publish_start_at: string | null;
  publish_end_at: string | null;
  created_at: string;
  updated_at: string;
}

export type HowToGuidePayload = Omit<HowToGuide, 'id' | 'created_at' | 'updated_at'>;

export interface HowToSection {
  id: string;
  guide_id: string;
  heading: string;
  section_order: number;
  created_at: string;
  updated_at: string;
}

export interface HowToStep {
  id: string;
  section_id: string;
  step_order: number;
  title: string;
  detail: string | null;
  note: string | null;
  rich_content_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface HowToStepBlock {
  id: string;
  step_id: string;
  block_order: number;
  kind: HowToBlockKind;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HowToStepImage {
  id: string;
  step_id: string;
  display_order: number;
  image_url: string;
  thumb_url: string | null;
  caption: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface HowToGuideTree {
  guide: HowToGuide;
  sections: Array<{
    section: HowToSection;
    steps: Array<{
      step: HowToStep;
      blocks: HowToStepBlock[];
      images: HowToStepImage[];
    }>;
  }>;
}

// Slug → display label mapping
export const PRAYER_TIME_LABELS: Record<string, string> = {
  'before-fajr': 'Before Fajr',
  'fajr': 'Fajr',
  'after-fajr': 'After Fajr',
  'ishraq': 'Ishraq',
  'duha': 'Duha',
  'zuhr': 'Zuhr',
  'after-zuhr': 'After Zuhr',
  'asr': 'Asr',
  'after-asr': 'After Asr',
  'maghrib': 'Maghrib',
  'after-maghrib': 'After Maghrib',
  'isha': 'Isha',
  'after-isha': 'After Isha',
  'before-sleep': 'Before Sleep',
  'morning': 'Morning',
  'evening': 'Evening',
  'jumuah': "Jumu'ah",
  'after-jumuah': "After Jumu'ah",
  'general': 'General / Anytime',
};

export const PRAYER_TIME_CATEGORIES = [
  'before-fajr',
  'fajr',
  'after-fajr',
  'ishraq',
  'duha',
  'zuhr',
  'after-zuhr',
  'asr',
  'after-asr',
  'maghrib',
  'after-maghrib',
  'isha',
  'after-isha',
  'before-sleep',
  'morning',
  'evening',
  'jumuah',
  'after-jumuah',
  'general',
] as const;

export type PrayerTimeCategory = typeof PRAYER_TIME_CATEGORIES[number];

// Adhkar-specific subset: only "before" and "after" prayer time slots.
// Standalone prayer names (fajr, isha, etc.) are not used for adhkar grouping.
export const ADHKAR_PRAYER_TIME_CATEGORIES = [
  'before-fajr',
  'after-fajr',
  'after-zuhr',
  'after-asr',
  'after-maghrib',
  'after-isha',
  'before-sleep',
  'after-jumuah',
  'morning',
  'evening',
  'general',
] as const;

// ─── Adhkar Group Metadata ────────────────────────────────────────────────────

export interface AdhkarGroup {
  id: string;
  name: string;
  prayer_time: string | null;
  group_name: string | null;
  icon: string;
  icon_color: string;
  icon_bg_color: string;
  badge_text: string | null;
  badge_color: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  bg_image_url: string | null;
  content_type: AdhkarContentType | null;
  content_source: AdhkarContentSource | null;
  content_key: string | null;
  card_icon: string | null;
  card_badge: string | null;
  card_subtitle: string | null;
  arabic_title: string | null;
  card_reference: string | null;
  card_color: string | null;
  created_at: string;
  updated_at: string;
}

export type AdhkarGroupPayload = Omit<AdhkarGroup, 'id' | 'created_at' | 'updated_at'>;

// Also allow bg_image_url in group payloads (newly added column)
export type AdhkarGroupPayloadExtended = AdhkarGroupPayload & { bg_image_url?: string | null };

export const GROUP_ICON_OPTIONS = [
  // Islamic symbols
  { value: '☪️',  label: 'Star & Crescent' },
  { value: '🕌',  label: 'Mosque' },
  { value: '📿',  label: 'Prayer Beads (Tasbih)' },
  { value: '🤲',  label: 'Hands in Dua' },
  { value: '🌙',  label: 'Crescent Moon' },
  { value: '🕋',  label: 'Kaaba' },
  { value: '📖',  label: 'Quran / Book' },
  { value: '📜',  label: 'Scroll' },
  // Nature & Light
  { value: '⭐',  label: 'Star' },
  { value: '🌟',  label: 'Glowing Star' },
  { value: '✨',  label: 'Sparkles' },
  { value: '💫',  label: 'Dizzy Star' },
  { value: '🌠',  label: 'Shooting Star' },
  { value: '🔆',  label: 'Light / Nur' },
  { value: '🌿',  label: 'Leaves / Herb' },
  { value: '🌺',  label: 'Flower' },
  { value: '🍃',  label: 'Leaves' },
  { value: '🕊️',  label: 'Dove / Peace' },
  // Virtues
  { value: '❤️',  label: 'Heart' },
  { value: '💎',  label: 'Diamond (Knowledge)' },
  { value: '🪷',  label: 'Lotus' },
  { value: '🛡️',  label: 'Shield / Protection' },
  { value: '🔔',  label: 'Bell (Reminder)' },
  { value: '🏛️',  label: 'Dome' },
];

// ─── Announcements ──────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  type: string | null;
  urdu_title: string | null;
  body: string | null;
  urdu_body: string | null;
  tag: boolean;
  lead_names: string | null;
  urdu_lead_names: string | null;
  start_time: string | null;
  link_url: string | null;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type AnnouncementPayload = Omit<Announcement, 'id' | 'created_at' | 'updated_at'>;

// ─── Sunnah Reminders ────────────────────────────────────────────────────────

export interface SunnahReminder {
  id: string;
  title: string;
  arabic_title: string | null;
  arabic: string | null;
  transliteration: string | null;
  translation: string | null;
  urdu_translation: string | null;
  description: string | null;
  reference: string | null;
  count: string;
  category: string;
  group_name: string | null;
  group_order: number | null;
  display_order: number | null;
  is_active: boolean;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export type SunnahReminderPayload = Omit<SunnahReminder, 'id' | 'created_at' | 'updated_at'>;

export interface SunnahGroup {
  id: string;
  name: string;
  category: string | null;
  icon: string;
  icon_color: string;
  icon_bg_color: string;
  badge_text: string | null;
  badge_color: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type SunnahGroupPayload = Omit<SunnahGroup, 'id' | 'created_at' | 'updated_at'>;

export const SUNNAH_CATEGORIES = [
  'prayer',
  'fasting',
  'morning',
  'evening',
  'eating',
  'sleep',
  'friday',
  'social',
  'worship',
  'general',
] as const;

export type SunnahCategory = typeof SUNNAH_CATEGORIES[number];

export const SUNNAH_CATEGORY_LABELS: Record<string, string> = {
  'prayer':   'Prayer (Salah)',
  'fasting':  'Fasting (Sawm)',
  'morning':  'Morning Routines',
  'evening':  'Evening Routines',
  'eating':   'Eating & Drinking',
  'sleep':    'Sleep & Waking',
  'friday':   "Jumu'ah (Friday)",
  'social':   'Social Conduct',
  'worship':  'Worship & Dhikr',
  'general':  'General Sunnah',
};

export const SUNNAH_CATEGORY_COLORS: Record<string, { pill: string; dot: string }> = {
  'prayer':   { pill: 'bg-teal-100 text-teal-800 border-teal-200',     dot: '#0d9488' },
  'fasting':  { pill: 'bg-orange-100 text-orange-800 border-orange-200', dot: '#f97316' },
  'morning':  { pill: 'bg-amber-100 text-amber-800 border-amber-200',   dot: '#f59e0b' },
  'evening':  { pill: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: '#6366f1' },
  'eating':   { pill: 'bg-green-100 text-green-800 border-green-200',   dot: '#22c55e' },
  'sleep':    { pill: 'bg-violet-100 text-violet-800 border-violet-200', dot: '#8b5cf6' },
  'friday':   { pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: '#10b981' },
  'social':   { pill: 'bg-sky-100 text-sky-800 border-sky-200',         dot: '#0ea5e9' },
  'worship':  { pill: 'bg-rose-100 text-rose-800 border-rose-200',      dot: '#f43f5e' },
  'general':  { pill: 'bg-gray-100 text-gray-700 border-gray-200',      dot: '#6b7280' },
};

export const GROUP_COLOR_PRESETS = [
  { bg: '#6366f1', label: 'Indigo' },
  { bg: '#8b5cf6', label: 'Purple' },
  { bg: '#10b981', label: 'Emerald' },
  { bg: '#ef4444', label: 'Red' },
  { bg: '#f59e0b', label: 'Amber' },
  { bg: '#3b82f6', label: 'Blue' },
  { bg: '#ec4899', label: 'Pink' },
  { bg: '#14b8a6', label: 'Teal' },
  { bg: '#f97316', label: 'Orange' },
  { bg: '#84cc16', label: 'Lime' },
];
