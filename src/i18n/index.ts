/**
 * i18n – internationalisation module.
 *
 * Uses i18next (no framework adapter – vanilla TS).
 * Supported languages: de, en  (fr, es: add translation file + entry here)
 *
 * Language resolution order:
 *   1. localStorage  ('planspiel_lang')   – explicit user choice, highest priority
 *   2. navigator.language                 – browser/OS setting, only if supported
 *   3. 'de'                               – hard fallback (this is a German-first app)
 *
 * Note: browser language is only used when the user has never made an explicit
 * choice. On first visit, a German-browser user gets DE, an English-browser
 * user gets EN. After any flag click the choice is persisted to localStorage
 * and the browser setting is no longer consulted.
 */

import i18next from 'i18next'
import de from './de.json'
import en from './en.json'

// ── Supported languages ────────────────────────────────────────────────────

export interface LangMeta {
  code:  string
  flag:  string   // emoji flag
  label: string   // native name
}

export const SUPPORTED_LANGS: LangMeta[] = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  // { code: 'fr', flag: '🇫🇷', label: 'Français' },   // add fr.json to enable
  // { code: 'es', flag: '🇪🇸', label: 'Español'  },   // add es.json to enable
]

export type SupportedLang = 'de' | 'en'

const STORAGE_KEY = 'planspiel_lang'
const FALLBACK    = 'de' as SupportedLang

// ── Language detection ─────────────────────────────────────────────────────

function detectLang(): SupportedLang {
  // 1. explicit user choice (flag click persisted to localStorage)
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED_LANGS.some(l => l.code === stored)) {
    return stored as SupportedLang
  }
  // 2. browser/OS setting – only first visit, no stored preference
  const browser = navigator.language?.split('-')[0]?.toLowerCase()
  if (browser && SUPPORTED_LANGS.some(l => l.code === browser)) {
    return browser as SupportedLang
  }
  // 3. hard fallback – German first
  return FALLBACK
}

// ── i18next initialisation ─────────────────────────────────────────────────

let _ready = false

export async function initI18n(): Promise<void> {
  if (_ready) return
  await i18next.init({
    lng:         detectLang(),
    fallbackLng: FALLBACK,
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
  })
  _ready = true
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Translate a key with optional interpolation variables.
 * Falls back to the key string itself if not found (never throws).
 *
 * Examples:
 *   t('nav.home')                          → "Home"
 *   t('home.waiting', {ready:2, total:4})  → "⏳ Warte auf Eingaben: 2 von 4 Gruppen bereit."
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  return i18next.t(key, vars as Record<string, unknown>) as string
}

/** Current active language code. */
export function getLang(): SupportedLang {
  return (i18next.language ?? FALLBACK) as SupportedLang
}

/**
 * Switch language, persist to localStorage, notify all subscribers.
 * No-op if already on the requested language.
 */
export async function setLang(lang: SupportedLang): Promise<void> {
  if (lang === getLang()) return
  localStorage.setItem(STORAGE_KEY, lang)
  await i18next.changeLanguage(lang)
  _listeners.forEach(fn => fn(lang))
}

// ── Subscriptions ──────────────────────────────────────────────────────────

type LangListener = (lang: SupportedLang) => void
const _listeners = new Set<LangListener>()

/**
 * Subscribe to language changes. Returns an unsubscribe function.
 */
export function onLangChange(fn: LangListener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
