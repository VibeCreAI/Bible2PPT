import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import pptxgen from 'pptxgenjs';
import { Download, Settings, FileText, MonitorPlay, Type, Palette, LayoutTemplate, Image as ImageIcon, Plus, X, BookOpen, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BIBLE_BOOKS } from './data/bibleBooks';
import { getBibleVerses, BIBLE_VERSION_OPTIONS, type BibleVersionId } from './services/bibleService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface VerseData {
  verseNum: string;
  text: string;
}

interface SlideData {
  verses: VerseData[];
}

interface FlatSlide {
  verses: VerseData[];
  title: string;
  subtitle: string;
}

interface PassageEntry {
  id: string;
  version: BibleVersionId;
  bookCode: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  label: string;
  title: string;
  subtitle: string;
  rawText: string;
  isExpanded: boolean;
}

interface PPTSettings {
  ratio: '16:9' | '4:3';
  bgColor: string;
  textColor: string;
  titleColor: string;
  subtitleColor: string;
  verseNumColor: string;
  bodyFontFamily: string;
  titleFontFamily: string;
  subtitleFontFamily: string;
  verseNumFontFamily: string;
  verseNumBold: boolean;
  bodyBold: boolean;
  titleBold: boolean;
  subtitleBold: boolean;
  verseNumFontSize: number;
  verseLineSpacing: number;
  verseGapPt: number;
  fontSize: number;
  titleFontSize: number;
  subtitleFontSize: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  titleAlign: 'left' | 'center' | 'right' | 'justify';
  bgImage: string | null;
  titleY: number;
  subtitleY: number;
  bodyY: number;
  bodyBottomMargin: number;
  slideSplitMode: 'per_verse' | 'per_2_verses' | 'per_3_verses' | 'per_4_verses' | 'per_5_verses' | 'auto_page';
}

const DEFAULT_SETTINGS: PPTSettings = {
  ratio: '16:9',
  bgColor: '#F8FAFC',
  textColor: '#1E293B',
  titleColor: '#1D4ED8',
  subtitleColor: '#64748B',
  verseNumColor: '#3B82F6',
  bodyFontFamily: 'Malgun Gothic',
  titleFontFamily: 'Malgun Gothic',
  subtitleFontFamily: 'Malgun Gothic',
  verseNumFontFamily: 'Malgun Gothic',
  verseNumBold: false,
  bodyBold: false,
  titleBold: true,
  subtitleBold: false,
  verseNumFontSize: 36,
  verseLineSpacing: 1.4,
  verseGapPt: 12,
  fontSize: 36,
  titleFontSize: 26,
  subtitleFontSize: 16,
  textAlign: 'center',
  titleAlign: 'left',
  bgImage: null,
  titleY: 5,
  subtitleY: 13,
  bodyY: 25,
  bodyBottomMargin: 10,
  slideSplitMode: 'per_verse',
};

const DEFAULT_PASSAGES: PassageEntry[] = [
  {
    id: 'default-sample',
    version: 'krv',
    bookCode: 'John',
    chapter: 3,
    startVerse: 16,
    endVerse: 16,
    label: '요한복음 3:16',
    title: '요한복음 3:16',
    subtitle: '첫번째 주제',
    rawText: '16 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라',
    isExpanded: false,
  },
];

const FONT_OPTIONS = [
  { label: '맑은 고딕 (Malgun Gothic)', value: 'Malgun Gothic' },
  { label: '나눔고딕 (Nanum Gothic)', value: 'Nanum Gothic' },
  { label: '나눔명조 (Nanum Myeongjo)', value: 'Nanum Myeongjo' },
  { label: '바탕 (Batang)', value: 'Batang' },
  { label: '돋움 (Dotum)', value: 'Dotum' },
  { label: '굴림 (Gulim)', value: 'Gulim' },
];

const getAlignClasses = (align: PPTSettings['textAlign']) => {
  if (align === 'center') return 'items-center text-center';
  if (align === 'right') return 'items-end text-right';
  if (align === 'justify') return 'items-stretch text-justify';
  return 'items-start text-left';
};

const getTextAlignStyle = (align: PPTSettings['textAlign']): React.CSSProperties['textAlign'] => {
  if (align === 'justify') return 'justify';
  return align;
};

const SLIDE_WIDTH_IN = 10;
const SLIDE_HEIGHT_BY_RATIO: Record<PPTSettings['ratio'], number> = {
  '16:9': 5.625,
  '4:3': 7.5,
};
const BODY_WIDTH_PERCENT = 90;
const MIN_BODY_HEIGHT_PERCENT = 5;
const AUTO_PAGE_HEIGHT_SAFETY_IN = 0.12;
const CJK_CHAR_WIDTH_RATIO = 0.9;
const CJK_CHAR_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3040-\u30FF\u3400-\u9FFF]/;
const PUNCTUATION_REGEX = /[.,;:!?'"()[\]{}<>/\\|`~@#$%^&*_+=-]/;

const getBodyHeightPercent = (settings: Pick<PPTSettings, 'bodyY' | 'bodyBottomMargin'>) => (
  Math.max(MIN_BODY_HEIGHT_PERCENT, 100 - settings.bodyY - settings.bodyBottomMargin)
);

const getTextWidthUnits = (text: string) => {
  let units = 0;
  for (const char of Array.from(text)) {
    if (/\s/.test(char)) units += 0.35;
    else if (/[A-Za-z0-9]/.test(char)) units += 0.58;
    else if (PUNCTUATION_REGEX.test(char)) units += 0.45;
    else if (CJK_CHAR_REGEX.test(char)) units += 1;
    else units += 0.85;
  }
  return units;
};

function parseVerses(rawText: string): VerseData[] {
  const lines = rawText.split('\n');
  const parsedVerses: VerseData[] = [];
  let currentVerseNum = '';
  let currentText = '';
  const verseRegex = /^\[?(\d+)\]?\.?(?:절)?\s*(.*)/;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const match = trimmed.match(verseRegex);
    if (match) {
      if (currentText) parsedVerses.push({ verseNum: currentVerseNum, text: currentText.trim() });
      currentVerseNum = match[1];
      currentText = match[2];
    } else {
      currentText = currentText ? currentText + ' ' + trimmed : trimmed;
    }
  });
  if (currentText) parsedVerses.push({ verseNum: currentVerseNum, text: currentText.trim() });
  return parsedVerses;
}

const STORAGE_KEY = 'bible2ppt_state';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${key}`, JSON.stringify(value));
  } catch {}
}

export default function App() {
  const [settings, setSettings] = useState<PPTSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage<Partial<PPTSettings>>('settings', {}),
  }));
  const [activeTab, setActiveTab] = useState<'input' | 'settings'>('input');
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  // Passages: each has its own title, subtitle, rawText, expanded state
  const [passages, setPassages] = useState<PassageEntry[]>(() => loadFromStorage('passages', DEFAULT_PASSAGES));
  const [defaultSubtitle, setDefaultSubtitle] = useState<string>(() => loadFromStorage('defaultSubtitle', '첫번째 주제'));

  // Bible lookup controls
  const [bibleVersion, setBibleVersion] = useState<BibleVersionId>(() => loadFromStorage('bibleVersion', 'krv'));
  const [selectedBook, setSelectedBook] = useState<string>(() => loadFromStorage('selectedBook', 'John'));
  const [selectedChapter, setSelectedChapter] = useState<number>(() => loadFromStorage('selectedChapter', 3));
  const [startVerse, setStartVerse] = useState<number>(() => loadFromStorage('startVerse', 16));
  const [endVerse, setEndVerse] = useState<number>(() => loadFromStorage('endVerse', 16));
  const [isLoadingVerses, setIsLoadingVerses] = useState(false);

  // Measure preview container width to compute accurate font scale
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(576);
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setPreviewWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // PPT slide is 10 inches = 720pt wide; scale preview px to match proportionally
  const previewFontScale = previewWidth / 720;

  // Persist to localStorage on change
  useEffect(() => { saveToStorage('settings', settings); }, [settings]);
  useEffect(() => { saveToStorage('passages', passages); }, [passages]);
  useEffect(() => { saveToStorage('defaultSubtitle', defaultSubtitle); }, [defaultSubtitle]);
  useEffect(() => { saveToStorage('bibleVersion', bibleVersion); }, [bibleVersion]);
  useEffect(() => { saveToStorage('selectedBook', selectedBook); }, [selectedBook]);
  useEffect(() => { saveToStorage('selectedChapter', selectedChapter); }, [selectedChapter]);
  useEffect(() => { saveToStorage('startVerse', startVerse); }, [startVerse]);
  useEffect(() => { saveToStorage('endVerse', endVerse); }, [endVerse]);

  // Paginate parsed verses into SlideData groups
  const paginateVerses = useCallback((parsedVerses: VerseData[], mode: PPTSettings['slideSplitMode']): SlideData[] => {
    if (parsedVerses.length === 0) return [{ verses: [{ verseNum: '', text: '구절을 입력해주세요.' }] }];
    const fixedChunkSizeByMode: Partial<Record<PPTSettings['slideSplitMode'], number>> = {
      per_verse: 1,
      per_2_verses: 2,
      per_3_verses: 3,
      per_4_verses: 4,
      per_5_verses: 5,
    };
    const fixedChunkSize = fixedChunkSizeByMode[mode];
    if (fixedChunkSize) {
      const groups: SlideData[] = [];
      for (let i = 0; i < parsedVerses.length; i += fixedChunkSize) {
        groups.push({ verses: parsedVerses.slice(i, i + fixedChunkSize) });
      }
      return groups;
    }

    const slideHeightIn = SLIDE_HEIGHT_BY_RATIO[settings.ratio];
    const bodyHeightIn = slideHeightIn * getBodyHeightPercent(settings) / 100;
    const usableBodyHeightIn = Math.max(0.1, bodyHeightIn - AUTO_PAGE_HEIGHT_SAFETY_IN);
    const bodyWidthIn = SLIDE_WIDTH_IN * BODY_WIDTH_PERCENT / 100;
    const cjkCharWidthIn = (settings.fontSize * CJK_CHAR_WIDTH_RATIO) / 72;
    const maxUnitsPerLine = Math.max(1, bodyWidthIn / cjkCharWidthIn);
    const bodyLineHeightIn = (settings.fontSize * settings.verseLineSpacing) / 72;
    const verseGapIn = (settings.verseGapPt * Math.max(1, settings.verseLineSpacing)) / 72;

    const estimateVerseHeightIn = (verse: VerseData) => {
      const text = `${verse.verseNum ? `${verse.verseNum} ` : ''}${verse.text}`;
      const lineCount = Math.max(1, Math.ceil(getTextWidthUnits(text) / maxUnitsPerLine));
      const firstLineHeightIn = verse.verseNum
        ? Math.max(bodyLineHeightIn, settings.verseNumFontSize / 72)
        : bodyLineHeightIn;
      return firstLineHeightIn + Math.max(0, lineCount - 1) * bodyLineHeightIn;
    };

    const groups: SlideData[] = [];
    let currentGroup: VerseData[] = [];
    let usedHeightIn = 0;

    for (const verse of parsedVerses) {
      const verseHeightIn = estimateVerseHeightIn(verse);
      const nextHeightIn = verseHeightIn + (currentGroup.length > 0 ? verseGapIn : 0);
      if (usedHeightIn + nextHeightIn > usableBodyHeightIn && currentGroup.length > 0) {
        groups.push({ verses: currentGroup });
        currentGroup = [verse];
        usedHeightIn = verseHeightIn;
      } else {
        currentGroup.push(verse);
        usedHeightIn += nextHeightIn;
      }
    }
    if (currentGroup.length > 0) groups.push({ verses: currentGroup });
    return groups;
  }, [
    settings.ratio,
    settings.bodyY,
    settings.bodyBottomMargin,
    settings.fontSize,
    settings.verseNumFontSize,
    settings.verseLineSpacing,
    settings.verseGapPt,
  ]);

  // All slides across all passages for preview
  const allSlides = useMemo((): FlatSlide[] => {
    if (passages.length === 0) {
      return [{ verses: [{ verseNum: '', text: '위에서 성경 구절을 추가해주세요.' }], title: '', subtitle: '' }];
    }
    const result: FlatSlide[] = [];
    for (const p of passages) {
      const verses = parseVerses(p.rawText);
      if (verses.length === 0) continue;
      const groups = paginateVerses(verses, settings.slideSplitMode);
      for (const g of groups) {
        result.push({ verses: g.verses, title: p.title, subtitle: p.subtitle });
      }
    }
    return result.length > 0 ? result : [{ verses: [{ verseNum: '', text: '구절을 입력해주세요.' }], title: '', subtitle: '' }];
  }, [passages, settings.slideSplitMode, paginateVerses]);

  useEffect(() => {
    if (previewSlideIndex >= allSlides.length) {
      setPreviewSlideIndex(Math.max(0, allSlides.length - 1));
    }
  }, [allSlides.length, previewSlideIndex]);

  // Derived bible book info
  const currentBook = BIBLE_BOOKS.find(b => b.code === selectedBook) ?? BIBLE_BOOKS[0];
  const maxChapter = currentBook.chapters;
  const maxVerse = currentBook.verseCounts[selectedChapter - 1] ?? 1;

  const handleBookChange = useCallback((code: string) => {
    setSelectedBook(code);
    setSelectedChapter(1);
    setStartVerse(1);
    setEndVerse(1);
  }, []);

  const handleChapterChange = useCallback((ch: number) => {
    setSelectedChapter(ch);
    setStartVerse(1);
    setEndVerse(1);
  }, []);

  const handleStartVerseChange = useCallback((v: number) => {
    setStartVerse(v);
    if (endVerse < v) setEndVerse(v);
  }, [endVerse]);

  const handleAddPassage = useCallback(async () => {
    const bookName = currentBook.name;
    const rangeLabel = startVerse === endVerse
      ? `${selectedChapter}:${startVerse}`
      : `${selectedChapter}:${startVerse}-${endVerse}`;
    const label = `${bookName} ${rangeLabel}`;

    setIsLoadingVerses(true);
    try {
      const bibleVerses = await getBibleVerses(selectedBook, selectedChapter, startVerse, endVerse, bibleVersion);
      const rawText = bibleVerses.map(v => `${v.verseNum} ${v.text}`).join('\n');

      const newPassage: PassageEntry = {
        id: `${Date.now()}-${Math.random()}`,
        version: bibleVersion,
        bookCode: selectedBook,
        chapter: selectedChapter,
        startVerse,
        endVerse,
        label,
        title: label,
        subtitle: defaultSubtitle,
        rawText,
        isExpanded: true,
      };

      setPassages(prev => [...prev, newPassage]);
    } finally {
      setIsLoadingVerses(false);
    }
  }, [bibleVersion, currentBook, selectedBook, selectedChapter, startVerse, endVerse, defaultSubtitle]);

  const handleAddManualPassage = useCallback(() => {
    const newPassage: PassageEntry = {
      id: `${Date.now()}-${Math.random()}`,
      version: 'krv',
      bookCode: '',
      chapter: 0,
      startVerse: 0,
      endVerse: 0,
      label: '직접 입력',
      title: '',
      subtitle: defaultSubtitle,
      rawText: '',
      isExpanded: true,
    };
    setPassages(prev => [...prev, newPassage]);
  }, [defaultSubtitle]);

  const handleRemovePassage = useCallback((id: string) => {
    setPassages(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleClearPassages = useCallback(() => setPassages([]), []);

  const handleUpdatePassage = useCallback((id: string, updates: Partial<PassageEntry>) => {
    setPassages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const handleTogglePassage = useCallback((id: string) => {
    setPassages(prev => prev.map(p => p.id === id ? { ...p, isExpanded: !p.isExpanded } : p));
  }, []);

  const handleGeneratePPT = async () => {
    if (passages.length === 0) return;
    const pptx = new pptxgen();
    pptx.layout = settings.ratio === '16:9' ? 'LAYOUT_16x9' : 'LAYOUT_4x3';

    // Title/subtitle box height based on font size
    const titleH = Math.max(0.4, (settings.titleFontSize / 72) * 1.8);
    const subtitleH = Math.max(0.35, (settings.subtitleFontSize / 72) * 1.8);

    const addSlideContent = (slide: ReturnType<typeof pptx.addSlide>, pTitle: string, pSubtitle: string, slideVerses: VerseData[], valign: 'middle' | 'top') => {
      if (settings.bgImage) {
        slide.background = { data: settings.bgImage };
      } else {
        slide.background = { color: settings.bgColor.replace('#', '') };
      }
      // Use '5%' / '90%' to exactly match the web preview layout
      if (pTitle) {
        slide.addText(pTitle, {
          x: '5%', y: `${settings.titleY}%`, w: '90%', h: titleH,
          fontSize: settings.titleFontSize, color: settings.titleColor.replace('#', ''),
          fontFace: settings.titleFontFamily, bold: settings.titleBold, align: settings.titleAlign, valign: 'top',
        });
      }
      if (pSubtitle) {
        slide.addText(pSubtitle, {
          x: '5%', y: `${settings.subtitleY}%`, w: '90%', h: subtitleH,
          fontSize: settings.subtitleFontSize, color: settings.subtitleColor.replace('#', ''),
          fontFace: settings.subtitleFontFamily, bold: settings.subtitleBold, align: 'right', valign: 'top',
        });
      }
      const textElements: any[] = [];
      slideVerses.forEach((verse, index) => {
        const isLastVerse = index === slideVerses.length - 1;
        if (verse.verseNum) {
          // Keep verse number inline so larger verse sizes do not shift the first line upward
          textElements.push({
            text: `${verse.verseNum} `,
            options: {
              fontSize: settings.verseNumFontSize,
              color: settings.verseNumColor.replace('#', ''),
              fontFace: settings.verseNumFontFamily,
              bold: settings.verseNumBold,
            },
          });
        }
        textElements.push({
          text: verse.text,
          options: {
            fontSize: settings.fontSize,
            color: settings.textColor.replace('#', ''),
            fontFace: settings.bodyFontFamily,
            bold: settings.bodyBold,
            breakLine: true, // always break after verse text
          },
        });
        // Adjustable spacer between verses (independent from within-verse line spacing)
        if (!isLastVerse && settings.verseGapPt > 0) {
          textElements.push({
            text: ' ',
            options: {
              fontSize: settings.verseGapPt,
              fontFace: settings.bodyFontFamily,
              bold: settings.bodyBold,
              breakLine: true,
            },
          });
        }
      });
      const bodyTextOptions: any = {
        x: '5%', y: `${settings.bodyY}%`, w: '90%', h: `${getBodyHeightPercent(settings)}%`,
        fontFace: settings.bodyFontFamily, bold: settings.bodyBold, align: settings.textAlign, valign,
        lineSpacingMultiple: settings.verseLineSpacing,
      };
      slide.addText(textElements, bodyTextOptions);
    };

    for (const passage of passages) {
      const verses = parseVerses(passage.rawText);
      if (verses.length === 0) continue;
      const groups = paginateVerses(verses, settings.slideSplitMode);
      const isAutoPage = settings.slideSplitMode === 'auto_page';
      groups.forEach(group => {
        const pptSlide = pptx.addSlide();
        addSlideContent(pptSlide, passage.title, passage.subtitle, group.verses, isAutoPage ? 'top' : 'middle');
      });
    }

    const firstName = passages[0]?.title || 'Bible_Verses';
    await pptx.writeFile({ fileName: `${firstName}.pptx` });
  };

  const updateSetting = <K extends keyof PPTSettings>(key: K, value: PPTSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { updateSetting('bgImage', reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const currentPreviewSlide = allSlides[previewSlideIndex];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <MonitorPlay className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Bible to PPT Web</h1>
        </div>
        <button
          onClick={handleGeneratePPT}
          disabled={passages.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>PPT 다운로드</span>
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-200/50 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('input')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all",
                activeTab === 'input' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
              )}
            >
              <FileText className="w-4 h-4" />
              구절 입력
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all",
                activeTab === 'settings' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
              )}
            >
              <Settings className="w-4 h-4" />
              PPT 디자인 설정
            </button>
          </div>

          {/* Input Tab */}
          {activeTab === 'input' && (
            <div className="space-y-4">

              {/* Bible Lookup Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  성경 검색
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">번역본</label>
                    <select
                      value={bibleVersion}
                      onChange={(e) => setBibleVersion(e.target.value as BibleVersionId)}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {BIBLE_VERSION_OPTIONS.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">책</label>
                    <select
                      value={selectedBook}
                      onChange={(e) => handleBookChange(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {BIBLE_BOOKS.map(b => (
                        <option key={b.code} value={b.code}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">장</label>
                    <select
                      value={selectedChapter}
                      onChange={(e) => handleChapterChange(parseInt(e.target.value))}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {Array.from({ length: maxChapter }, (_, i) => i + 1).map(ch => (
                        <option key={ch} value={ch}>{ch}장</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">시작절</label>
                    <select
                      value={startVerse}
                      onChange={(e) => handleStartVerseChange(parseInt(e.target.value))}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {Array.from({ length: maxVerse }, (_, i) => i + 1).map(v => (
                        <option key={v} value={v}>{v}절</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">끝절</label>
                    <select
                      value={endVerse}
                      onChange={(e) => setEndVerse(parseInt(e.target.value))}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {Array.from({ length: maxVerse - startVerse + 1 }, (_, i) => startVerse + i).map(v => (
                        <option key={v} value={v}>{v}절</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleAddPassage}
                  disabled={isLoadingVerses}
                  className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {isLoadingVerses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  구절 추가
                </button>

                {/* Default subtitle (applied to new passages) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">기본 소제목 (새 구절에 적용)</label>
                  <input
                    type="text"
                    value={defaultSubtitle}
                    onChange={(e) => setDefaultSubtitle(e.target.value)}
                    placeholder="예: 첫번째 주제"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddManualPassage}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    직접 입력
                  </button>
                  {passages.length > 0 && (
                    <button onClick={handleClearPassages} className="text-xs text-red-500 hover:text-red-700 ml-auto">
                      모두 지우기
                    </button>
                  )}
                </div>
              </div>

              {/* Passage Accordion List */}
              {passages.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl">
                  위에서 성경 구절을 검색해서 추가하세요.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 px-1">
                    추가된 구절 ({passages.length}) — 클릭하여 제목/본문 편집
                  </div>
                  {passages.map((p, index) => {
                    const vLabel = BIBLE_VERSION_OPTIONS.find(o => o.id === p.version)?.label ?? p.version;
                    return (
                      <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Accordion Header */}
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => handleTogglePassage(p.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{p.label}</p>
                              <p className="text-xs text-gray-400">{vLabel}{p.title && p.title !== p.label ? ` · ${p.title}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemovePassage(p.id); }}
                              className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            {p.isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Accordion Body */}
                        {p.isExpanded && (
                          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  슬라이드 제목
                                </label>
                                <input
                                  type="text"
                                  value={p.title}
                                  onChange={(e) => handleUpdatePassage(p.id, { title: e.target.value })}
                                  placeholder="예: 요한복음 3:16-21"
                                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  슬라이드 소제목
                                </label>
                                <input
                                  type="text"
                                  value={p.subtitle}
                                  onChange={(e) => handleUpdatePassage(p.id, { subtitle: e.target.value })}
                                  placeholder="예: 첫번째 주제"
                                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-gray-600">본문</label>
                                <span className="text-xs text-gray-400">숫자로 시작하면 절이 나뉩니다</span>
                              </div>
                              <textarea
                                value={p.rawText}
                                onChange={(e) => handleUpdatePassage(p.id, { rawText: e.target.value })}
                                placeholder="구절 텍스트..."
                                rows={5}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                  <LayoutTemplate className="w-4 h-4 text-gray-500" />
                  레이아웃
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">화면 비율</label>
                    <select value={settings.ratio} onChange={(e) => updateSetting('ratio', e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="16:9">16:9 (와이드)</option>
                      <option value="4:3">4:3 (일반)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">슬라이드 분할</label>
                    <select value={settings.slideSplitMode} onChange={(e) => updateSetting('slideSplitMode', e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="per_verse">1절씩 나누기</option>
                      <option value="per_2_verses">2절씩 나누기</option>
                      <option value="per_3_verses">3절씩 나누기</option>
                      <option value="per_4_verses">4절씩 나누기</option>
                      <option value="per_5_verses">5절씩 나누기</option>
                      <option value="auto_page">최대한 채우고 넘기기</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">제목 정렬</label>
                    <select value={settings.titleAlign} onChange={(e) => updateSetting('titleAlign', e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="left">왼쪽 정렬</option>
                      <option value="center">가운데 정렬</option>
                      <option value="right">오른쪽 정렬</option>
                      <option value="justify">좌우 정렬</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">본문 정렬</label>
                    <select value={settings.textAlign} onChange={(e) => updateSetting('textAlign', e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="center">가운데 정렬</option>
                      <option value="left">왼쪽 정렬</option>
                      <option value="right">오른쪽 정렬</option>
                      <option value="justify">좌우 정렬</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                  <LayoutTemplate className="w-4 h-4 text-gray-500" />
                  위치 조정
                </h3>
                <div className="space-y-3">
                  {([['제목 위쪽 여백', 'titleY', 0, 50], ['소제목 위쪽 여백', 'subtitleY', 0, 50], ['본문 위쪽 여백', 'bodyY', 5, 80], ['본문 아래쪽 여백', 'bodyBottomMargin', 5, 35]] as const).map(([label, key, min, max]) => (
                    <div key={key}>
                      <div className="flex justify-between mb-1">
                        <label className="text-xs font-medium text-gray-600">{label}</label>
                        <span className="text-xs text-gray-500">{settings[key]}%</span>
                      </div>
                      <input type="range" min={min} max={max} value={settings[key]}
                        onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                        className="w-full accent-blue-600" />
                    </div>
                  ))}
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">절 내부 줄간격</label>
                      <span className="text-xs text-gray-500">{settings.verseLineSpacing.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={2.2}
                      step={0.05}
                      value={settings.verseLineSpacing}
                      onChange={(e) => updateSetting('verseLineSpacing', parseFloat(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">절 간 간격</label>
                      <span className="text-xs text-gray-500">{settings.verseGapPt}pt</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={settings.verseGapPt}
                      onChange={(e) => updateSetting('verseGapPt', parseInt(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                  배경 이미지
                </h3>
                <div>
                  <input type="file" accept="image/*" onChange={handleImageUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer" />
                  {settings.bgImage && (
                    <button onClick={() => updateSetting('bgImage', null)} className="mt-3 text-xs text-red-600 hover:text-red-700 font-medium">
                      배경 이미지 제거
                    </button>
                  )}
                  <p className="text-[11px] text-gray-500 mt-2">* JPG, PNG 등의 이미지 파일을 업로드하여 배경으로 사용할 수 있습니다.</p>
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                  <Type className="w-4 h-4 text-gray-500" />
                  글꼴 및 크기
                </h3>
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {([['제목 글꼴', 'titleFontFamily'], ['소제목 글꼴', 'subtitleFontFamily'], ['본문 글꼴', 'bodyFontFamily'], ['절 번호 글꼴', 'verseNumFontFamily']] as const).map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                        <select value={settings[key]} onChange={(e) => updateSetting(key, e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                          {FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                    {([['제목 볼드', 'titleBold'], ['소제목 볼드', 'subtitleBold'], ['본문 볼드', 'bodyBold'], ['절 번호 볼드', 'verseNumBold']] as const).map(([label, key]) => (
                      <label key={key} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={settings[key]}
                          onChange={(e) => updateSetting(key, e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">* PPT를 열 PC에 설치된 폰트여야 정상적으로 보입니다.</p>
                </div>
                <div className="space-y-3">
                  {([['본문 크기', 'fontSize', 20, 80], ['절 번호 크기', 'verseNumFontSize', 10, 60], ['제목 크기', 'titleFontSize', 16, 60], ['소제목 크기', 'subtitleFontSize', 12, 40]] as const).map(([label, key, min, max]) => (
                    <div key={key}>
                      <div className="flex justify-between mb-1">
                        <label className="text-xs font-medium text-gray-600">{label}</label>
                        <span className="text-xs text-gray-500">{settings[key]}pt</span>
                      </div>
                      <input type="range" min={min} max={max} value={settings[key]}
                        onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                        className="w-full accent-blue-600" />
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                  <Palette className="w-4 h-4 text-gray-500" />
                  색상
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ['배경색', 'bgColor'], ['본문 색상', 'textColor'],
                    ['제목 색상', 'titleColor'], ['소제목 색상', 'subtitleColor'],
                    ['절 번호 색상', 'verseNumColor'],
                  ] as const).map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settings[key]} onChange={(e) => updateSetting(key, e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                        <input type="text" value={settings[key]} onChange={(e) => updateSetting(key, e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-300 rounded text-sm uppercase font-mono" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">미리보기</h2>
            <div className="text-sm text-gray-500 font-medium">
              슬라이드 {previewSlideIndex + 1} / {allSlides.length}
            </div>
          </div>

          {/* Preview Slide */}
          <div className="bg-gray-200 rounded-2xl p-4 flex items-center justify-center overflow-hidden border border-gray-300 shadow-inner">
            <div
              ref={previewContainerRef}
              className="relative shadow-2xl transition-all duration-300 bg-cover bg-center"
              style={{
                width: '100%',
                aspectRatio: settings.ratio === '16:9' ? '16/9' : '4/3',
                backgroundColor: settings.bgColor,
                backgroundImage: settings.bgImage ? `url(${settings.bgImage})` : 'none',
              }}
            >
              {/* Title */}
              {currentPreviewSlide?.title && (
                <div
                  className={cn(
                    "absolute w-[90%] left-[5%] flex flex-col",
                    getAlignClasses(settings.titleAlign)
                  )}
                  style={{ top: `${settings.titleY}%`, color: settings.titleColor, fontFamily: `"${settings.titleFontFamily}", sans-serif`, textAlign: getTextAlignStyle(settings.titleAlign) }}
                >
                  <span className="leading-tight" style={{ fontSize: `${settings.titleFontSize * previewFontScale}px`, fontWeight: settings.titleBold ? 700 : 400 }}>
                    {currentPreviewSlide.title}
                  </span>
                </div>
              )}

              {/* Subtitle */}
              {currentPreviewSlide?.subtitle && (
                <div
                  className="absolute w-[90%] left-[5%] flex flex-col items-end text-right"
                  style={{ top: `${settings.subtitleY}%`, color: settings.subtitleColor, fontFamily: `"${settings.subtitleFontFamily}", sans-serif` }}
                >
                  <span className="leading-tight" style={{ fontSize: `${settings.subtitleFontSize * previewFontScale}px`, fontWeight: settings.subtitleBold ? 700 : 400 }}>
                    {currentPreviewSlide.subtitle}
                  </span>
                </div>
              )}

              {/* Body */}
              <div
                className={cn(
                  "absolute w-[90%] left-[5%] flex flex-col",
                  getAlignClasses(settings.textAlign),
                  settings.slideSplitMode === 'auto_page' ? 'justify-start' : 'justify-center'
                )}
                style={{
                  top: `${settings.bodyY}%`,
                  height: `${getBodyHeightPercent(settings)}%`,
                  color: settings.textColor,
                  fontFamily: `"${settings.bodyFontFamily}", sans-serif`,
                  textAlign: getTextAlignStyle(settings.textAlign),
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${settings.verseGapPt * previewFontScale}px` }}>
                  {currentPreviewSlide?.verses.map((verse, idx) => (
                    <p key={idx} className="break-keep" style={{ fontSize: `${settings.fontSize * previewFontScale}px`, lineHeight: settings.verseLineSpacing, margin: 0, fontWeight: settings.bodyBold ? 700 : 400 }}>
                      {verse.verseNum && (
                        <span className="mr-1 inline-block" style={{ color: settings.verseNumColor, fontSize: `${settings.verseNumFontSize * previewFontScale}px`, fontWeight: settings.verseNumBold ? 700 : 400, lineHeight: 1, fontFamily: `"${settings.verseNumFontFamily}", sans-serif` }}>
                          {verse.verseNum}
                        </span>
                      )}
                      {verse.text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-center gap-2">
            <button onClick={() => setPreviewSlideIndex(prev => Math.max(0, prev - 1))}
              disabled={previewSlideIndex === 0}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
              이전 슬라이드
            </button>
            <button onClick={() => setPreviewSlideIndex(prev => Math.min(allSlides.length - 1, prev + 1))}
              disabled={previewSlideIndex === allSlides.length - 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
              다음 슬라이드
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h4 className="text-sm font-bold text-blue-900 mb-2">💡 사용 팁</h4>
            <ul className="text-sm text-blue-800 space-y-1.5 list-disc list-inside">
              <li>성경 구절을 추가하면 각 구절마다 제목·소제목을 따로 설정할 수 있습니다.</li>
              <li>구절 항목을 클릭하면 제목·소제목·본문을 편집할 수 있습니다.</li>
              <li>미리보기 슬라이드 이동 시 제목이 해당 구절로 자동으로 바뀝니다.</li>
              <li>글꼴은 PPT를 띄울 컴퓨터에 설치된 폰트를 선택해야 깨지지 않습니다.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
