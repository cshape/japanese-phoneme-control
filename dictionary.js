/**
 * The pronunciation dictionary.
 *
 * Because matching happens on kuromoji token boundaries, entries are keyed on
 * the WORD alone — no particles. The particle that follows is attached
 * automatically at match time, using kuromoji's own phonetic reading of it
 * (so topic-marker は correctly becomes ワ, へ becomes エ).
 *
 *   surface   橋          the word, as written
 *   yomi      ハシ         the reading: WHICH sounds, in katakana
 *   accent    2           アクセント型: WHERE the pitch drops, counted in morae
 *                           0 = 平板 (never drops; following particle stays high)
 *                           1 = 頭高 (drops after mora 1)
 *                           n = drops after mora n
 *   verified  true        has a human listened to it? unverified entries are
 *                           flagged in the UI as needing an ear check
 */

export const DICTIONARY = {
  // --- reading fixes: the front-end picks the wrong sounds entirely ---------
  '放出': {
    yomi: 'ハナテン', accent: 0, verified: false,
    note: 'Osaka place name. kuromoji reads it ホウシュツ ("release") — wrong here.',
  },
  '日本橋': {
    yomi: 'ニホンバシ', accent: 0, verified: false,
    note: 'Place name. 橋 voices to ばし in the compound.',
  },

  // --- accent fixes: sounds are right, pitch is wrong ----------------------
  '橋': { yomi: 'ハシ', accent: 2, verified: true, note: 'bridge — 尾高, the drop lands on the particle' },
  '箸': { yomi: 'ハシ', accent: 1, verified: true, note: 'chopsticks — 頭高' },
  '端': { yomi: 'ハシ', accent: 0, verified: true, note: 'edge — 平板. kuromoji also misreads this as ハジ.' },
  '雨': { yomi: 'アメ', accent: 1, verified: true, note: 'rain — 頭高' },
  '飴': { yomi: 'アメ', accent: 0, verified: true, note: 'candy — 平板. Same kana as 雨, opposite contour.' },
};

export const SAMPLES = [
  '雨の日に橋の上で箸を落としました。',
  '日本橋の近くで飴を買いました。',
  '放出まで歩くと、端が見えます。',
  // long enough that the stream demo hits a pressure release before punctuation
  '雨の日に日本橋の近くを歩いていたら橋の上で箸を落としてしまいました。',
];
