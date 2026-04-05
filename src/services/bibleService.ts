import { BIBLE_BOOKS } from '../data/bibleBooks';

export type BibleVersionId = 'krv' | 'nkrv' | 'korsms';

export const BIBLE_VERSION_OPTIONS: { id: BibleVersionId; label: string }[] = [
  { id: 'krv', label: '개역한글' },
  { id: 'korsms', label: '쉬운말성경' },
  { id: 'nkrv', label: '개역개정' },
];

type NormalizedBibleData = Record<string, Record<string, Record<string, string>>>;

const LOCAL_BIBLE_FILE_BY_VERSION: Record<BibleVersionId, string> = {
  krv: '/korean-bible.json',
  korsms: '/bible-korsms.json',
  nkrv: '/bible-nkrv.json',
};

const NKRV_BOOK_CODE_BY_ABBREVIATION: Record<string, string> = {
  '창': 'Gen', '출': 'Exod', '레': 'Lev', '민': 'Num', '신': 'Deut',
  '수': 'Josh', '삿': 'Judg', '룻': 'Ruth', '삼상': '1Sam', '삼하': '2Sam',
  '왕상': '1Kgs', '왕하': '2Kgs', '대상': '1Chr', '대하': '2Chr',
  '스': 'Ezra', '느': 'Neh', '에': 'Esth', '욥': 'Job', '시': 'Ps',
  '잠': 'Prov', '전': 'Eccl', '아': 'Song', '사': 'Isa', '렘': 'Jer',
  '애': 'Lam', '겔': 'Ezek', '단': 'Dan', '호': 'Hos', '욜': 'Joel',
  '암': 'Amos', '옵': 'Obad', '욘': 'Jonah', '미': 'Mic', '나': 'Nah',
  '합': 'Hab', '습': 'Zeph', '학': 'Hag', '슥': 'Zech', '말': 'Mal',
  '마': 'Matt', '막': 'Mark', '눅': 'Luke', '요': 'John', '행': 'Acts',
  '롬': 'Rom', '고전': '1Cor', '고후': '2Cor', '갈': 'Gal', '엡': 'Eph',
  '빌': 'Phil', '골': 'Col', '살전': '1Thess', '살후': '2Thess',
  '딤전': '1Tim', '딤후': '2Tim', '딛': 'Titus', '몬': 'Phlm',
  '히': 'Heb', '약': 'Jas', '벧전': '1Pet', '벧후': '2Pet',
  '요일': '1John', '요이': '2John', '요삼': '3John', '유': 'Jude', '계': 'Rev',
};

const localBibleDataCache = new Map<BibleVersionId, Promise<NormalizedBibleData>>();

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = parseInt(entity.slice(2), 16);
      return isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    if (entity.startsWith('#')) {
      const cp = parseInt(entity.slice(1), 10);
      return isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    return named[entity] ?? full;
  });
}

function hasLatinSupplement(value: string): boolean {
  return Array.from(value).some(c => { const n = c.charCodeAt(0); return n >= 0x00c0 && n <= 0x00ff; });
}

function hasHangul(value: string): boolean {
  return Array.from(value).some(c => { const n = c.charCodeAt(0); return n >= 0xac00 && n <= 0xd7a3; });
}

function decodeMojibake(value: string): string {
  if (!hasLatinSupplement(value)) return value;
  try {
    const bytes = Uint8Array.from(value, ch => ch.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return hasHangul(decoded) ? decoded : value;
  } catch { return value; }
}

function getBookCodeFromName(bookName: string): string | null {
  const normalized = decodeMojibake(bookName);
  return BIBLE_BOOKS.find(b => b.name === normalized)?.code ?? null;
}

function parseNkrvKey(key: string): { bookCode: string; chapter: number; startVerse: number; endVerse: number } | null {
  const decoded = decodeMojibake(key).trim();
  const match = decoded.match(/^([^\d]+)(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const [, abbr, ch, sv, ev] = match;
  const bookCode = NKRV_BOOK_CODE_BY_ABBREVIATION[abbr.trim()];
  const chapter = Number(ch), startVerse = Number(sv), endVerse = ev ? Number(ev) : Number(sv);
  if (!bookCode || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(startVerse) || startVerse < 1) return null;
  return { bookCode, chapter, startVerse, endVerse };
}

function upsertVerse(result: NormalizedBibleData, bookCode: string, chapter: number, verse: number, text: unknown): void {
  const trimmed = typeof text === 'string' ? decodeHtmlEntities(text).trim() : '';
  if (!trimmed) return;
  if (!result[bookCode]) result[bookCode] = {};
  if (!result[bookCode][String(chapter)]) result[bookCode][String(chapter)] = {};
  result[bookCode][String(chapter)][String(verse)] = trimmed;
}

function normalizeBibleData(raw: unknown): NormalizedBibleData {
  const result: NormalizedBibleData = {};
  if (!raw || typeof raw !== 'object') return result;

  // Array formats (KORSMS or flat row array)
  if (Array.isArray(raw)) {
    const looksLikeKorsms = raw.length > 0 && raw.every(
      r => r && typeof r === 'object' && 'korean' in (r as Record<string, unknown>) && 'chapters' in (r as Record<string, unknown>)
    );
    if (looksLikeKorsms) {
      for (const row of raw) {
        const obj = row as Record<string, unknown>;
        const bookCode = getBookCodeFromName(typeof obj.korean === 'string' ? decodeMojibake(obj.korean) : '');
        if (!bookCode) continue;
        const chapters = Array.isArray(obj.chapters) ? obj.chapters : [];
        for (const chItem of chapters) {
          if (!chItem || typeof chItem !== 'object') continue;
          const chObj = chItem as Record<string, unknown>;
          const chapter = Number(chObj.chapterNum);
          if (!Number.isInteger(chapter) || chapter < 1) continue;
          const verses = Array.isArray(chObj.verses) ? chObj.verses : [];
          for (const vItem of verses) {
            if (!vItem || typeof vItem !== 'object') continue;
            const vObj = vItem as Record<string, unknown>;
            upsertVerse(result, bookCode, chapter, Number(vObj.verseNum), typeof vObj.verse === 'string' ? decodeMojibake(vObj.verse) : '');
          }
        }
      }
      return result;
    }
    // Generic flat row array
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const obj = row as Record<string, unknown>;
      const bookCode = (typeof obj.bookCode === 'string' && BIBLE_BOOKS.some(b => b.code === obj.bookCode))
        ? (obj.bookCode as string)
        : (typeof obj.book === 'string' ? getBookCodeFromName(decodeMojibake(obj.book)) : null);
      const chapter = Number(obj.chapter), verse = Number(obj.verse);
      if (!bookCode || !Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || verse < 1) continue;
      upsertVerse(result, bookCode, chapter, verse, obj.text);
    }
    return result;
  }

  const rawObj = raw as Record<string, unknown>;
  const entries = Object.entries(rawObj);

  // Detect NKRV flat map (창1:1 → text)
  const nkrvEntries = entries.filter(([k, v]) => typeof v === 'string' && parseNkrvKey(k) !== null);
  if (entries.length > 0 && nkrvEntries.length / entries.length > 0.99) {
    for (const [key, value] of nkrvEntries) {
      const parsed = parseNkrvKey(key);
      if (!parsed) continue;
      const text = decodeMojibake(value as string);
      for (let v = parsed.startVerse; v <= parsed.endVerse; v++) {
        upsertVerse(result, parsed.bookCode, parsed.chapter, v, text);
      }
    }
    return result;
  }

  // Nested object format (bookName → chapter → verse → text)
  for (const [bookKey, chapters] of entries) {
    if (!chapters || typeof chapters !== 'object') continue;
    const normalizedKey = decodeMojibake(bookKey);
    const bookCode = BIBLE_BOOKS.some(b => b.code === normalizedKey) ? normalizedKey : getBookCodeFromName(normalizedKey);
    if (!bookCode) continue;
    for (const [chKey, verses] of Object.entries(chapters as Record<string, unknown>)) {
      if (!verses || typeof verses !== 'object') continue;
      const chapter = Number(chKey);
      if (!Number.isInteger(chapter) || chapter < 1) continue;
      for (const [vKey, vText] of Object.entries(verses as Record<string, unknown>)) {
        const verse = Number(vKey);
        if (!Number.isInteger(verse) || verse < 1) continue;
        upsertVerse(result, bookCode, chapter, verse, vText);
      }
    }
  }

  return result;
}

function loadLocalBibleData(version: BibleVersionId): Promise<NormalizedBibleData> {
  if (!localBibleDataCache.has(version)) {
    localBibleDataCache.set(version, (async () => {
      const res = await fetch(LOCAL_BIBLE_FILE_BY_VERSION[version]);
      if (!res.ok) throw new Error(`Failed to load bible data for ${version}: ${res.status}`);
      const raw = await res.json();
      return normalizeBibleData(raw);
    })());
  }
  return localBibleDataCache.get(version)!;
}

export interface BibleVerseData {
  verseNum: number;
  text: string;
}

export async function getBibleVerses(
  bookCode: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
  version: BibleVersionId = 'krv',
): Promise<BibleVerseData[]> {
  const data = await loadLocalBibleData(version);
  const chapterData = data[bookCode]?.[String(chapter)];
  if (!chapterData) return [];
  const result: BibleVerseData[] = [];
  for (let v = startVerse; v <= endVerse; v++) {
    const text = chapterData[String(v)];
    if (text) result.push({ verseNum: v, text });
  }
  return result;
}
