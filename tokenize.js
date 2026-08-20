/**
 * Token-boundary dictionary matching.
 *
 * Japanese has no spaces, so a plain substring match has no word boundary to
 * respect — a 橋 entry fires inside 日本橋. kuromoji segments the text first,
 * so matches can only land on whole words.
 *
 * kuromoji gives us word boundaries and a default reading. It does NOT give
 * pitch accent (IPADIC carries none), and its reading is sometimes wrong for
 * proper nouns. Both gaps are what the dictionary fills.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { compile, contour, tag, toMorae, toPhonemes } from './phonemes.js';

const require = createRequire(import.meta.url);
const DIC_PATH = path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict');

const MAX_SPAN = 6;        // longest dictionary key, in tokens
const PARTICLE_POS = '助詞';

let tokenizerPromise;

export function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    require('kuromoji')
      .builder({ dicPath: DIC_PATH })
      .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  });
  return tokenizerPromise;
}

/**
 * Analyze one segment of text.
 *
 * Returns the tokens (for display), the segments the text was split into, the
 * final string to send to TTS, and any dictionary errors.
 */
// Compiling converts every entry's reading to morae. For a handful of entries
// that is free; for a navigation gazetteer it is the dominant per-request cost,
// and they flagged TTFB. Cache on the dictionary object so a long-lived
// dictionary compiles once for the life of the process.
const compileCache = new WeakMap();

function compileCached(dictionary) {
  let hit = compileCache.get(dictionary);
  if (!hit) {
    hit = compile(dictionary);
    compileCache.set(dictionary, hit);
  }
  return hit;
}

export async function analyze(text, dictionary) {
  const tokenizer = await getTokenizer();
  const { entries, errors } = compileCached(dictionary);
  const tokens = text ? tokenizer.tokenize(text) : [];

  const segments = [];
  let i = 0;

  while (i < tokens.length) {
    // Longest token span first, so 日本橋 wins over 橋. Crucially, a span can
    // only start and end on a token boundary — which is what makes 橋 unable
    // to match inside 日本橋 at all.
    let hit = null;
    for (let len = Math.min(MAX_SPAN, tokens.length - i); len >= 1; len--) {
      const surface = tokens.slice(i, i + len).map((t) => t.surface_form).join('');
      if (entries[surface]) { hit = { entry: entries[surface], len, surface }; break; }
    }

    if (!hit) {
      const last = segments.at(-1);
      if (last?.kind === 'plain') last.text += tokens[i].surface_form;
      else segments.push({ kind: 'plain', text: tokens[i].surface_form });
      i += 1;
      continue;
    }

    // Attach a following particle if there is one. The accent of a word is not
    // fully expressed without it: 橋 (accent 2) and 端 (accent 0) are identical
    // in isolation and differ only in what they do to the particle.
    const next = tokens[i + hit.len];
    const particle = next?.pos === PARTICLE_POS ? next : null;

    const wordMorae = hit.entry.morae;
    // kuromoji's `pronunciation` is phonetic, not orthographic — topic-marker
    // は comes back as ワ, へ as エ. That is what we want to speak.
    const particleMorae = particle ? toMorae(particle.pronunciation ?? particle.reading) : [];
    const morae = [...wordMorae, ...particleMorae];
    const phonemes = toPhonemes(morae, hit.entry.accent);

    segments.push({
      kind: 'tag',
      text: hit.surface + (particle?.surface_form ?? ''),
      word: hit.surface,
      particle: particle?.surface_form ?? null,
      particleYomi: particle ? (particle.pronunciation ?? particle.reading) : null,
      yomi: hit.entry.yomi,
      accent: hit.entry.accent,
      verified: hit.entry.verified !== false,
      note: hit.entry.note,
      morae,
      phonemes,
      contour: contour(phonemes),
      tagged: tag(phonemes),
    });

    i += hit.len + (particle ? 1 : 0);
  }

  return {
    tokens: tokens.map((t) => ({
      surface: t.surface_form,
      pos: t.pos,
      detail: t.pos_detail_1,
      reading: t.reading ?? null,
      pronunciation: t.pronunciation ?? null,
    })),
    segments,
    output: segments.map((s) => (s.kind === 'tag' ? s.tagged : s.text)).join(''),
    errors,
  };
}
