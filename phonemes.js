/**
 * Katakana reading + accent type  ->  OpenJTalk romaji with pitch digits.
 *
 *   ハシ + ノ, accent 2  ->  ha0shi1no0   (L H L)
 *
 * Digits are the pitch level of each vowel-bearing mora: 0 low, 1 high.
 * https://docs.fish.audio/developer-guide/core-features/fine-grained-control/japanese
 */

export const PHONEME_START = '<|phoneme_start|>';
export const PHONEME_END = '<|phoneme_end|>';

const DIGRAPHS = {
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo', ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  シャ: 'sha', シュ: 'shu', ショ: 'sho', ジャ: 'ja',  ジュ: 'ju',  ジョ: 'jo',
  チャ: 'cha', チュ: 'chu', チョ: 'cho', ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo', ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
  ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo', ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
  リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
  // loanword syllables — needed for product and brand names
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo', ティ: 'ti', ディ: 'di',
  トゥ: 'tu', ドゥ: 'du', ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  シェ: 'she', ジェ: 'je', チェ: 'che', ツァ: 'tsa', ツェ: 'tse', ツォ: 'tso',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo',
};

const MONOGRAPHS = {
  ア: 'a',  イ: 'i',  ウ: 'u',  エ: 'e',  オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
  ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヲ: 'o',  ヴ: 'vu',
  ン: 'N',   // moraic nasal — its own mora
  ッ: 'cl',  // geminate — its own mora, carries no pitch
};

/**
 * Reading -> array of morae. Accepts katakana or hiragana.
 * One mora each: キョ (two characters), ー, ン, ッ. Accent is counted in these.
 */
export function toMorae(yomi) {
  const kana = [...yomi]
    .map((c) => (c >= 'ぁ' && c <= 'ゖ' ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c))
    .join('');

  const morae = [];
  for (let i = 0; i < kana.length; ) {
    const pair = kana.slice(i, i + 2);
    if (DIGRAPHS[pair]) { morae.push(DIGRAPHS[pair]); i += 2; continue; }

    const ch = kana[i];
    if (ch === 'ー') {
      const prev = morae.at(-1);
      if (!prev || prev === 'N' || prev === 'cl') throw new Error(`stray ー in ${yomi}`);
      morae.push(prev.at(-1));       // long vowel: own mora, repeating the previous vowel
      i += 1;
      continue;
    }
    if (!MONOGRAPHS[ch]) throw new Error(`unmapped kana "${ch}" in "${yomi}"`);

    // オ段 + ウ is a long o, not "ou": こうそく is ko-o-so-ku, もうすぐ is mo-o-su-gu.
    // Readings in a lexicon are written orthographically (こう), so mapping kana
    // to romaji literally would emit `ko u` and mispronounce the vowel.
    // Matches OpenJTalk, which converts おう but leaves えい as e-i.
    const prev = morae.at(-1);
    if (ch === 'ウ' && prev && prev.at(-1) === 'o') morae.push('o');
    else morae.push(MONOGRAPHS[ch]);
    i += 1;
  }
  return morae;
}

/**
 * Tokyo pitch accent has exactly two rules: mora 1 and mora 2 always differ,
 * and once the pitch drops it stays down. accent is アクセント型 —
 * 0 = 平板 (never drops), 1 = 頭高, n = drops after mora n.
 */
export function toPhonemes(morae, accent) {
  if (!Number.isInteger(accent) || accent < 0) throw new Error(`accent must be a non-negative integer`);
  return morae
    .map((mora, idx) => {
      const i = idx + 1;
      if (mora === 'cl') return mora;                     // geminate takes no digit
      if (accent === 0) return mora + (i === 1 ? 0 : 1);  // 平板  L H H H…
      if (accent === 1) return mora + (i === 1 ? 1 : 0);  // 頭高  H L L L…
      return mora + (i === 1 ? 0 : i <= accent ? 1 : 0);  // drop after mora n
    })
    .join('');
}

/** ha0shi1no0 -> "L H L" */
export function contour(phonemes) {
  return [...phonemes]
    .filter((c) => c === '0' || c === '1')
    .map((d) => (d === '1' ? 'H' : 'L'))
    .join(' ');
}

export function tag(phonemes) {
  return PHONEME_START + phonemes + PHONEME_END;
}

/**
 * Validate a dictionary and precompute each entry's morae.
 * Returns { entries: {surface -> {...}}, errors: [] }.
 */
export function compile(dictionary) {
  const entries = {};
  const errors = [];
  for (const [surface, entry] of Object.entries(dictionary)) {
    try {
      const morae = toMorae(entry.yomi);
      if (entry.accent > morae.length) {
        throw new Error(`accent ${entry.accent} exceeds ${morae.length} morae`);
      }
      entries[surface] = { surface, ...entry, morae, phonemes: toPhonemes(morae, entry.accent) };
    } catch (err) {
      errors.push(`${surface}: ${err.message}`);
    }
  }
  return { entries, errors };
}
