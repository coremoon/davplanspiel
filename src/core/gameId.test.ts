/**
 * Tests for gameId.ts – word lists, token resolution, parsing pipeline, rendering.
 */

import { describe, expect, it } from 'vitest'
import {
  WORD_LISTS,
  normalizeWord,
  wordToIndex,
  levenshtein,
  fuzzyMatchWord,
  resolveToken,
  parseGameId,
  renderGameId,
  renderCompact,
  generateGameId,
  indicesToKey,
  keyToIndices,
} from './gameId'

// ── Word list integrity ────────────────────────────────────────────────────

describe('WORD_LISTS integrity', () => {
  const langs = ['de', 'en', 'fr', 'es'] as const

  langs.forEach(lang => {
    it(`${lang}: has exactly 26 words`, () => {
      expect(WORD_LISTS[lang]).toHaveLength(26)
    })

    it(`${lang}: word[i] starts with letter i`, () => {
      WORD_LISTS[lang].forEach((word, i) => {
        const expected = String.fromCharCode(97 + i)
        expect(word[0]).toBe(expected)
      })
    })

    it(`${lang}: no duplicates`, () => {
      expect(new Set(WORD_LISTS[lang]).size).toBe(26)
    })

    it(`${lang}: only [a-z] characters`, () => {
      WORD_LISTS[lang].forEach(word => {
        expect(word).toMatch(/^[a-z]+$/)
      })
    })
  })
})

// ── normalizeWord ──────────────────────────────────────────────────────────

describe('normalizeWord', () => {
  it('lowercases',         () => expect(normalizeWord('Apfel')).toBe('apfel'))
  it('strips accents',     () => expect(normalizeWord('étoile')).toBe('etoile'))
  it('strips circumflex',  () => expect(normalizeWord('forêt')).toBe('foret'))
  it('strips tilde',       () => expect(normalizeWord('jardín')).toBe('jardin'))
  it('strips hyphens',     () => expect(normalizeWord('x-y')).toBe('xy'))
  it('strips spaces',      () => expect(normalizeWord('a b')).toBe('ab'))
  it('empty string',       () => expect(normalizeWord('')).toBe(''))
})

// ── levenshtein ────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('identical → 0',       () => expect(levenshtein('apfel', 'apfel')).toBe(0))
  it('one substitution',    () => expect(levenshtein('apfel', 'apfal')).toBe(1))
  it('one deletion',        () => expect(levenshtein('hund', 'und')).toBe(1))
  it('one insertion',       () => expect(levenshtein('mond', 'monde')).toBe(1))
  it('both empty → 0',      () => expect(levenshtein('', '')).toBe(0))
  it('one vs empty → 1',    () => expect(levenshtein('a', '')).toBe(1))
  it('far apart → > 3',     () => expect(levenshtein('apfel', 'zzzzz')).toBeGreaterThan(3))
})

// ── fuzzyMatchWord ─────────────────────────────────────────────────────────

describe('fuzzyMatchWord', () => {
  it('exact match → distance 0', () => {
    const r = fuzzyMatchWord('apfel', 'de')
    expect(r?.distance).toBe(0)
    expect(r?.word).toBe('apfel')
  })
  it('one typo → matched',       () => expect(fuzzyMatchWord('apdel', 'de')?.word).toBe('apfel'))
  it('one typo EN',              () => expect(fuzzyMatchWord('hourse', 'en')?.word).toBe('horse'))
  it('too far → null',           () => expect(fuzzyMatchWord('xxxxxxxxxxx', 'de', 2)).toBeNull())
})

// ── resolveToken ───────────────────────────────────────────────────────────

describe('resolveToken – letter mode', () => {
  it('single lowercase letter', () => {
    const r = resolveToken('a', 'de')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(0); expect(r.mode).toBe('letter') }
  })
  it('single uppercase letter', () => {
    const r = resolveToken('H', 'de')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(7); expect(r.mode).toBe('letter') }
  })
  it('z → 25', () => {
    const r = resolveToken('z', 'de')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.index).toBe(25)
  })
  it('all 26 letters resolve', () => {
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(97 + i)
      const r  = resolveToken(ch, 'de')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.index).toBe(i)
    }
  })
})

describe('resolveToken – exact word mode', () => {
  it('DE word', () => {
    const r = resolveToken('apfel', 'de')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(0); expect(r.mode).toBe('exact') }
  })
  it('EN word', () => {
    const r = resolveToken('horse', 'en')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(7); expect(r.mode).toBe('exact') }
  })
  it('accented input normalized to exact match', () => {
    const r = resolveToken('jardín', 'es')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(9); expect(r.mode).toBe('exact') }
  })
})

describe('resolveToken – fuzzy mode', () => {
  it('typo → fuzzy', () => {
    const r = resolveToken('hunt', 'de')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.index).toBe(7); expect(r.mode).toBe('fuzzy') }
  })
  it('nonsense → fail', () => {
    expect(resolveToken('xxxxxxxx', 'de').ok).toBe(false)
  })
})

// ── parseGameId – all input forms ─────────────────────────────────────────

describe('parseGameId – full words', () => {
  it('hyphen-separated', () => {
    expect(parseGameId('apfel-hund-katze-stern', 'de')?.indices).toEqual([0, 7, 10, 18])
  })
  it('space-separated', () => {
    expect(parseGameId('apfel hund katze stern', 'de')?.indices).toEqual([0, 7, 10, 18])
  })
  it('any order → same indices', () => {
    const a = parseGameId('apfel-hund-katze-stern', 'de')
    const b = parseGameId('stern-katze-apfel-hund', 'de')
    const c = parseGameId('hund-stern-apfel-katze', 'de')
    expect(a?.indices).toEqual(b?.indices)
    expect(a?.indices).toEqual(c?.indices)
  })
})

describe('parseGameId – letter input', () => {
  it('single letters, hyphen',  () => expect(parseGameId('a-h-k-s', 'de')?.indices).toEqual([0, 7, 10, 18]))
  it('single letters, space',   () => expect(parseGameId('a h k s', 'de')?.indices).toEqual([0, 7, 10, 18]))
  it('uppercase letters',       () => expect(parseGameId('A H K S', 'de')?.indices).toEqual([0, 7, 10, 18]))
  it('mixed case',              () => expect(parseGameId('A h K s', 'de')?.indices).toEqual([0, 7, 10, 18]))
})

describe('parseGameId – compact 4-letter', () => {
  it('"ahks" → [0,7,10,18]',              () => expect(parseGameId('ahks', 'de')?.indices).toEqual([0, 7, 10, 18]))
  it('"AHKS" → same',                     () => expect(parseGameId('AHKS', 'de')?.indices).toEqual([0, 7, 10, 18]))
  it('any order compact → same indices',  () => expect(parseGameId('skha', 'de')?.indices).toEqual([0, 7, 10, 18]))
})

describe('parseGameId – typo correction', () => {
  it('typos corrected, indices still correct', () => {
    const r = parseGameId('apdel hunt katse shtern', 'de')
    expect(r).not.toBeNull()
    expect(r!.indices).toEqual([0, 7, 10, 18])
    expect(r!.corrections.length).toBeGreaterThan(0)
  })
  it('corrections populated with input and matched word', () => {
    const r = parseGameId('apdel hund katze stern', 'de')
    expect(r).not.toBeNull()
    expect(r!.corrections.some(c => c.input === 'apdel' && c.matched === 'apfel')).toBe(true)
  })
  it('fuzzy match causing duplicate → null', () => {
    // 'hunt' fuzzy-matches 'hund' (index 7), but 'hund' is also in the input → duplicate
    expect(parseGameId('hunt hund katze stern', 'de')).toBeNull()
  })
})

describe('parseGameId – equivalence across input forms', () => {
  const expected: [number, number, number, number] = [0, 7, 10, 18]
  const forms = [
    'apfel-hund-katze-stern',
    'apfel hund katze stern',
    'stern katze hund apfel',
    'a-h-k-s',
    'a h k s',
    'A H K S',
    'ahks',
    'AHKS',
    'skha',
  ]
  forms.forEach(form => {
    it(`"${form}" → [0,7,10,18]`, () => {
      expect(parseGameId(form, 'de')?.indices).toEqual(expected)
    })
  })
})

describe('parseGameId – cross-language equivalence', () => {
  it('DE and EN same concepts → same indices', () => {
    const de = parseGameId('apfel-hund-katze-stern', 'de')
    const en = parseGameId('apple-horse-kite-star',  'en')
    expect(de?.indices).toEqual(en?.indices)
  })
})

describe('parseGameId – error cases', () => {
  it('too few tokens → null',       () => expect(parseGameId('apfel-hund-katze', 'de')).toBeNull())
  it('too many tokens → null',      () => expect(parseGameId('apfel-hund-katze-stern-mond', 'de')).toBeNull())
  it('duplicate letters → null',    () => expect(parseGameId('a a k s', 'de')).toBeNull())
  it('duplicate compact → null',    () => expect(parseGameId('aabc', 'de')).toBeNull())
  it('duplicate words → null',      () => expect(parseGameId('apfel apfel katze stern', 'de')).toBeNull())
  it('unresolvable token → null',   () => expect(parseGameId('apfel hund katze xxxxxxxxxxx', 'de')).toBeNull())
})

// ── renderGameId / renderCompact ───────────────────────────────────────────

describe('renderGameId', () => {
  it('DE', () => expect(renderGameId([0, 7, 10, 18], 'de')).toBe('apfel-hund-katze-stern'))
  it('EN', () => expect(renderGameId([0, 7, 10, 18], 'en')).toBe('apple-horse-kite-star'))
  it('FR only [a-z-]', () => expect(renderGameId([0, 7, 10, 18], 'fr')).toMatch(/^[a-z-]+$/))
  it('ES only [a-z-]', () => expect(renderGameId([0, 7, 10, 18], 'es')).toMatch(/^[a-z-]+$/))
})

describe('renderCompact', () => {
  it('[0,7,10,18] → "ahks"',   () => expect(renderCompact([0, 7, 10, 18])).toBe('ahks'))
  it('[0,1,2,3]  → "abcd"',   () => expect(renderCompact([0, 1, 2, 3])).toBe('abcd'))
  it('[22,23,24,25] → "wxyz"', () => expect(renderCompact([22, 23, 24, 25])).toBe('wxyz'))
})

// ── generateGameId ─────────────────────────────────────────────────────────

describe('generateGameId', () => {
  it('returns 4 distinct sorted indices in 0–25', () => {
    for (let i = 0; i < 30; i++) {
      const id = generateGameId()
      expect(id).toHaveLength(4)
      expect(new Set(id).size).toBe(4)
      id.forEach(n => { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(26) })
      expect([...id]).toEqual([...id].sort((a, b) => a - b))
    }
  })
  it('compact roundtrip: generateGameId → renderCompact → parseGameId', () => {
    const id     = generateGameId()
    const parsed = parseGameId(renderCompact(id), 'de')
    expect(parsed?.indices).toEqual(id)
  })
})

// ── indicesToKey / keyToIndices ────────────────────────────────────────────

describe('key roundtrip', () => {
  it('indices → key → indices',  () => {
    const orig: [number,number,number,number] = [0,7,10,18]
    expect(keyToIndices(indicesToKey(orig))).toEqual(orig)
  })
  it('key is zero-padded',       () => expect(indicesToKey([0,7,10,18])).toBe('00-07-10-18'))
  it('invalid string → null',    () => expect(keyToIndices('not-valid')).toBeNull())
  it('3 parts → null',           () => expect(keyToIndices('00-07-10')).toBeNull())
  it('out of range → null',      () => expect(keyToIndices('00-07-10-99')).toBeNull())
})
