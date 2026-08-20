/**
 * Reading a W3C PLS lexicon and emitting Fish Audio phoneme tags.
 *
 * Nothing about an existing PLS pipeline has to change except what gets
 * substituted into the text. Parsing and matching stay as they are.
 *
 *   <alias>  -> substitute the kana directly. Fixes the READING. No tag needed,
 *               nothing Fish-specific, works today.
 *
 *   <phoneme alphabet="x-fish-openjtalk">
 *            -> substitute a phoneme tag. Fixes the reading AND the pitch
 *               accent, which is the part no text substitution can reach.
 *
 * `alphabet` is a standard PLS attribute and the spec explicitly allows
 * vendor values of the form "x-organization", so this stays valid PLS.
 *
 *   node pls-to-fish.js sample_lexicon_ja-JP.pls
 */

import { readFileSync } from 'node:fs';
import { toMorae, toPhonemes, contour, tag } from './phonemes.js';

const FISH_ALPHABET = 'x-fish-openjtalk';

// --- 1. parse -------------------------------------------------------------
// Minimal reader for the subset of PLS in play. Use a real XML parser in
// production; this keeps the example dependency-free and readable.
export function parseLexicon(xml) {
  const entries = [];
  for (const [, body] of xml.matchAll(/<lexeme>([\s\S]*?)<\/lexeme>/g)) {
    const grapheme = body.match(/<grapheme>([\s\S]*?)<\/grapheme>/)?.[1]?.trim();
    if (!grapheme) continue;

    const fish = body.match(
      new RegExp(`<phoneme[^>]*alphabet=["']${FISH_ALPHABET}["'][^>]*>([\\s\\S]*?)</phoneme>`),
    )?.[1]?.trim();
    const alias = body.match(/<alias>([\s\S]*?)<\/alias>/)?.[1]?.trim();
    const otherPhoneme = body.match(/<phoneme(?![^>]*x-fish)[^>]*>([\s\S]*?)<\/phoneme>/)?.[1]?.trim();

    if (fish) entries.push({ grapheme, kind: 'phoneme', phonemes: fish });
    else if (alias) entries.push({ grapheme, kind: 'alias', alias });
    else if (otherPhoneme) entries.push({ grapheme, kind: 'unsupported', raw: otherPhoneme });
  }
  return entries;
}

// --- 2. substitute --------------------------------------------------------
export function apply(text, entries) {
  const hits = [];
  // Longest grapheme first: 我孫子市 must win over 我孫子.
  const ordered = [...entries].sort((a, b) => b.grapheme.length - a.grapheme.length);

  let out = text;
  for (const e of ordered) {
    if (!out.includes(e.grapheme)) continue;
    if (e.kind === 'alias') {
      out = out.split(e.grapheme).join(e.alias);
      hits.push({ ...e, replacement: e.alias });
    } else if (e.kind === 'phoneme') {
      const t = tag(e.phonemes);
      out = out.split(e.grapheme).join(t);
      hits.push({ ...e, replacement: t });
    } else {
      hits.push({ ...e, replacement: null }); // left alone
    }
  }
  return { text: out, hits };
}

// --- 3. the only conversion they need ------------------------------------
/**
 * 読み (katakana) + アクセント型  ->  the string that goes inside a Fish tag.
 * This is the whole notation: ハシ + 型2 -> ha0shi1
 */
export function fromYomiAndAccent(yomi, accentType) {
  const morae = toMorae(yomi);
  return toPhonemes(morae, accentType);
}

// --- demo -----------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? new URL('./sample_lexicon_ja-JP.pls', import.meta.url).pathname;
  const entries = parseLexicon(readFileSync(file, 'utf8'));

  console.log('LEXICON\n');
  for (const e of entries) {
    if (e.kind === 'alias') console.log(`  ${e.grapheme.padEnd(8)} alias    ${e.alias}   -> substitute kana`);
    if (e.kind === 'phoneme') console.log(`  ${e.grapheme.padEnd(8)} phoneme  ${e.phonemes}   ${contour(e.phonemes)}  -> substitute tag`);
    if (e.kind === 'unsupported') console.log(`  ${e.grapheme.padEnd(8)} phoneme  ${e.raw}   (not ${FISH_ALPHABET} — skipped)`);
  }

  const SENTENCES = [
    '我孫子市までは30分ほどですね。',
    '名神高速に乗ったほうが早いですよ。',
    'この先に夢庵がありますよ。',
    'KITTEの地下に入っているお店です。',
    'このお店、今すごく大人気なんです。',
    '内気循環に切り替えておきますね。',
    'もうすぐ到着しますよ。',
  ];

  console.log('\nSUBSTITUTION\n');
  for (const s of SENTENCES) {
    const { text, hits } = apply(s, entries);
    console.log(`  in   ${s}`);
    for (const h of hits) {
      console.log(`       ${h.grapheme} -> ${h.replacement ?? '(skipped — supply x-fish-openjtalk)'}`);
    }
    console.log(`  out  ${text}\n`);
  }

  console.log('NOTATION — 読み + アクセント型 -> tag contents\n');
  for (const [yomi, type, gloss] of [
    ['ハシ', 2, '橋 bridge'],
    ['ハシ', 1, '箸 chopsticks'],
    ['ハシ', 0, '端 edge'],
    ['モウスグ', 2, 'もうすぐ — the accent they asked for'],
    ['モウスグ', 3, 'もうすぐ — what OpenJTalk produces by default'],
  ]) {
    const p = fromYomiAndAccent(yomi, type);
    console.log(`  ${yomi.padEnd(8)} 型${type}  ->  ${p.padEnd(12)} ${contour(p)}   ${gloss}`);
  }
}
