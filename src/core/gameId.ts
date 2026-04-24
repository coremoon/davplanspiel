/**
 * Game ID word lists – one common noun per letter of the alphabet, per language.
 *
 * Core insight: the WORDS are memory aids for LETTERS.
 * "apfel-hund-katze-stern" and "a h k s" and "ahks" and "A B E X"
 * all resolve to the same index array. The letters carry the information;
 * the words help humans remember and speak them aloud.
 * (Same principle as BIP39 mnemonics in Bitcoin.)
 *
 * Input pipeline – applied in order to each token:
 *   1. Normalize   lowercase + strip diacritics + strip non-alpha  →  slug
 *   2. Letter?     if slug.length === 1  →  direct index (charCode - 97)
 *   3. Exact word? look up slug in word list  →  index
 *   4. Fuzzy word? Levenshtein ≤ 2 against word list  →  index + correction note
 *   5. Fail        token cannot be resolved  →  return null
 *
 * Special case – compact input "ahks" (4 letters, no separator):
 *   Detected when the entire input (after normalization) is exactly 4 alpha chars
 *   and each char is a valid letter (a–z). Expanded to ['a','h','k','s'] before pipeline.
 *
 * Accepted input forms (all equivalent for game A-H-K-S):
 *   "apfel-hund-katze-stern"    full words, hyphen
 *   "apfel hund katze stern"    full words, space
 *   "a-h-k-s"                   single letters, hyphen
 *   "a h k s"                   single letters, space
 *   "ahks"                      compact 4-letter, no separator
 *   "A H K S"                   uppercase letters
 *   "Apfel Hunt Katse Stern"    words with typos (Levenshtein ≤ 2)
 *   "apple horse kite star"     any supported language
 *
 * Order is always irrelevant: "s k h a" == "a h k s"
 *
 * Canonical internal form: sorted index tuple, e.g. [0, 7, 10, 18]
 * DB key (language-independent): "00-07-10-18"
 *
 * Capacity: C(26,4) = 14,950 unique game IDs.
 *
 * TODO: Words marked (*) are placeholder choices – adjust before production use.
 *
 * Index mapping (A=0, B=1, ... Z=25):
 *  0  A   1  B   2  C   3  D   4  E   5  F   6  G   7  H
 *  8  I   9  J  10  K  11  L  12  M  13  N  14  O  15  P
 * 16  Q  17  R  18  S  19  T  20  U  21  V  22  W  23  X
 * 24  Y  25  Z
 */

export type LangCode = 'de' | 'en' | 'fr' | 'es'

/**
 * 26 pre-normalized slug words per language.
 * Rules: lowercase, a-z only, no accents, no umlauts, no special characters.
 * Word at index i must start with the i-th letter of the alphabet.
 */
export const WORD_LISTS: Record<LangCode, readonly string[]> = {
  de: [
    'apfel',    //  0 A
    'berg',     //  1 B
    'cafe',     //  2 C  (*) alternatively "computer"
    'dach',     //  3 D
    'erde',     //  4 E
    'fuchs',    //  5 F
    'garten',   //  6 G
    'hund',     //  7 H
    'insel',    //  8 I
    'jagd',     //  9 J  (*) = hunt; alternatively "jacke"
    'katze',    // 10 K
    'lampe',    // 11 L
    'mond',     // 12 M
    'nacht',    // 13 N
    'ofen',     // 14 O
    'pferd',    // 15 P
    'quelle',   // 16 Q
    'regen',    // 17 R
    'stern',    // 18 S
    'turm',     // 19 T
    'ufer',     // 20 U  (*) = riverbank; alternatively "uhr"
    'vogel',    // 21 V
    'wald',     // 22 W
    'xanadu',   // 23 X  (*) fantasy/loanword
    'yoga',     // 24 Y  (*) loanword; alternatively "yak"
    'zug',      // 25 Z
  ],

  en: [
    'apple',    //  0 A
    'bear',     //  1 B
    'cloud',    //  2 C
    'door',     //  3 D
    'eagle',    //  4 E
    'forest',   //  5 F
    'garden',   //  6 G
    'horse',    //  7 H
    'island',   //  8 I
    'jungle',   //  9 J
    'kite',     // 10 K
    'lamp',     // 11 L
    'moon',     // 12 M
    'night',    // 13 N
    'ocean',    // 14 O
    'penguin',  // 15 P
    'quest',    // 16 Q  (*) abstract but universally known
    'river',    // 17 R
    'star',     // 18 S
    'tower',    // 19 T
    'umbrella', // 20 U
    'valley',   // 21 V
    'wolf',     // 22 W
    'xylophone',// 23 X  (*) classic placeholder
    'yard',     // 24 Y  (*) alternatively "yacht"
    'zebra',    // 25 Z
  ],

  fr: [
    'abricot',  //  0 A
    'bateau',   //  1 B
    'chateau',  //  2 C  (château → chateau)
    'desert',   //  3 D  (désert → desert)
    'etoile',   //  4 E  (étoile → etoile) (*)
    'foret',    //  5 F  (forêt → foret)
    'gateau',   //  6 G  (gâteau → gateau)
    'hibou',    //  7 H
    'ile',      //  8 I  (île → ile)
    'jardin',   //  9 J
    'koala',    // 10 K  (*) loanword
    'lune',     // 11 L
    'mouton',   // 12 M
    'nuit',     // 13 N
    'oiseau',   // 14 O
    'pont',     // 15 P
    'quiche',   // 16 Q  (*)
    'riviere',  // 17 R  (rivière → riviere)
    'soleil',   // 18 S
    'tour',     // 19 T
    'usine',    // 20 U  (*) alternatively "univers"
    'vallee',   // 21 V  (vallée → vallee)
    'wagon',    // 22 W  (*) loanword
    'xylophone',// 23 X  (*)
    'yoga',     // 24 Y  (*) loanword
    'zebre',    // 25 Z  (zèbre → zebre)
  ],

  es: [
    'arbol',    //  0 A  (árbol → arbol)
    'barco',    //  1 B
    'ciudad',   //  2 C
    'desierto', //  3 D
    'estrella', //  4 E
    'flor',     //  5 F
    'gato',     //  6 G  (*) alternatively "globo"
    'hierro',   //  7 H  (*) alternatively "hoja"
    'isla',     //  8 I
    'jardin',   //  9 J  (jardín → jardin)
    'koala',    // 10 K  (*) loanword
    'luna',     // 11 L
    'monte',    // 12 M
    'noche',    // 13 N
    'oceano',   // 14 O  (océano → oceano)
    'pajaro',   // 15 P  (pájaro → pajaro) (*) alternatively "puente"
    'queso',    // 16 Q
    'rio',      // 17 R  (río → rio)
    'sol',      // 18 S
    'torre',    // 19 T
    'universo', // 20 U
    'valle',    // 21 V
    'wafle',    // 22 W  (*) loanword
    'xilofono', // 23 X  (xilófono → xilofono)
    'yate',     // 24 Y  (*) = yacht
    'zebra',    // 25 Z  (*) also "cebra"
  ],
} as const

// ── Primitives ─────────────────────────────────────────────────────────────

/**
 * Normalize user input to a clean slug: lowercase, strip diacritics, a-z only.
 */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
}

/**
 * Exact word lookup. Normalizes input, compares against pre-normalized list.
 * Returns index 0–25 or -1.
 */
export function wordToIndex(input: string, lang: LangCode): number {
  return WORD_LISTS[lang].indexOf(normalizeWord(input))
}

// ── Levenshtein ────────────────────────────────────────────────────────────

/** Edit distance between two strings (classic DP). */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
    }
  }
  return dp[m]![n]!
}

/**
 * Best fuzzy match in the word list for a given slug.
 * Returns null if best distance > maxDistance.
 */
export function fuzzyMatchWord(
  input:       string,
  lang:        LangCode,
  maxDistance: number = 2,
): { index: number; word: string; distance: number } | null {
  const slug = normalizeWord(input)
  const list = WORD_LISTS[lang]
  let bestIndex = -1, bestWord = '', bestDist = Infinity
  for (let i = 0; i < list.length; i++) {
    const d = levenshtein(slug, list[i]!)
    if (d < bestDist) { bestDist = d; bestIndex = i; bestWord = list[i]! }
  }
  if (bestIndex === -1 || bestDist > maxDistance) return null
  return { index: bestIndex, word: bestWord, distance: bestDist }
}

// ── Token resolver ─────────────────────────────────────────────────────────

export type TokenResult =
  | { ok: true;  index: number; matched: string; distance: 0; mode: 'letter' | 'exact' }
  | { ok: true;  index: number; matched: string; distance: number; mode: 'fuzzy' }
  | { ok: false; input: string }

/**
 * Resolve a single token to an index using the full pipeline:
 *   1. normalize
 *   2. single letter → direct index
 *   3. exact word match
 *   4. fuzzy word match (Levenshtein ≤ 2)
 *   5. fail
 */
export function resolveToken(token: string, lang: LangCode): TokenResult {
  const slug = normalizeWord(token)
  if (!slug) return { ok: false, input: token }

  if (slug.length === 1) {
    const idx = slug.charCodeAt(0) - 97
    if (idx >= 0 && idx <= 25)
      return { ok: true, index: idx, matched: slug, distance: 0, mode: 'letter' }
    return { ok: false, input: token }
  }

  // Try all languages – current lang first
  const langs: LangCode[] = [lang, ...(['de','en','fr','es'] as LangCode[]).filter(l => l !== lang)]
  for (const l of langs) {
    const exact = WORD_LISTS[l].indexOf(slug)
    if (exact !== -1)
      return { ok: true, index: exact, matched: slug, distance: 0, mode: 'exact' }
  }

  // Fuzzy across all languages – pick best match
  let bestIndex = -1, bestWord = '', bestDist = Infinity
  for (const l of langs) {
    const match = fuzzyMatchWord(slug, l, 2)
    if (match && match.distance < bestDist) {
      bestDist = match.distance; bestIndex = match.index; bestWord = match.word
    }
  }
  if (bestIndex !== -1)
    return { ok: true, index: bestIndex, matched: bestWord, distance: bestDist, mode: 'fuzzy' }

  return { ok: false, input: token }
}

// ── parseGameId ────────────────────────────────────────────────────────────

export interface ParseResult {
  indices:     [number, number, number, number]
  corrections: Array<{ input: string; matched: string; distance: number; mode: string }>
}

/**
 * Parse any game ID input into a canonical sorted index tuple.
 * Returns null if input cannot be resolved to exactly 4 distinct indices.
 */
export function parseGameId(input: string, lang: LangCode): ParseResult | null {
  const cleaned = normalizeWord(input.trim())

  const isCompact = /^[a-z]{4}$/.test(cleaned)
    && input.trim().split(/[-\s]+/).filter(Boolean).length === 1

  const parts: string[] = isCompact
    ? cleaned.split('')
    : input.toLowerCase().trim().split(/[-\s]+/).filter(Boolean)

  if (parts.length !== 4) return null

  const indices:     number[]                = []
  const corrections: ParseResult['corrections'] = []

  for (const part of parts) {
    const result = resolveToken(part, lang)
    if (!result.ok) return null
    indices.push(result.index)
    if (result.distance > 0 || result.mode === 'letter') {
      corrections.push({
        input:    part,
        matched:  result.matched,
        distance: result.distance,
        mode:     result.mode,
      })
    }
  }

  if (new Set(indices).size !== 4) return null

  const sorted = [...indices].sort((a, b) => a - b) as [number, number, number, number]
  return { indices: sorted, corrections }
}

// ── Render / Generate / Key ────────────────────────────────────────────────

/** Render a canonical index tuple as a human-readable slug in the given language. */
export function renderGameId(indices: [number, number, number, number], lang: LangCode): string {
  return indices.map(i => WORD_LISTS[lang][i]!).join('-')
}

/** Render a canonical index tuple as a compact 4-letter string, e.g. "ahks". */
export function renderCompact(indices: [number, number, number, number]): string {
  return indices.map(i => String.fromCharCode(97 + i)).join('')
}

/** Generate a random canonical game ID (4 distinct sorted indices). */
export function generateGameId(): [number, number, number, number] {
  const pool = Array.from({ length: 26 }, (_, i) => i)
  const picked: number[] = []
  while (picked.length < 4) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!)
  }
  return picked.sort((a, b) => a - b) as [number, number, number, number]
}

/** Encode indices as DB key: "00-07-10-18". Language-independent, always sorted. */
export function indicesToKey(indices: [number, number, number, number]): string {
  return indices.map(i => String(i).padStart(2, '0')).join('-')
}

/** Decode a DB key back to indices. Returns null on invalid format. */
export function keyToIndices(key: string): [number, number, number, number] | null {
  const parts = key.split('-').map(Number)
  if (parts.length !== 4 || parts.some(isNaN) || parts.some(n => n < 0 || n > 25)) return null
  return parts as [number, number, number, number]
}
