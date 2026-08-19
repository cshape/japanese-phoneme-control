/**
 * Terminal walkthrough of the same pipeline the web UI shows.
 *
 *   node demo.js
 */

import { DICTIONARY, SAMPLES } from './dictionary.js';
import { analyze } from './tokenize.js';
import { CarryBuffer, maxKeyLength } from './stream.js';

const rule = (label) => console.log(`\n${'─'.repeat(74)}\n${label}\n`);

rule('DICTIONARY  (keyed on the word alone — particles are attached at match time)');
for (const [surface, e] of Object.entries(DICTIONARY)) {
  const flag = e.verified ? '' : '   ⚠ verify by ear';
  console.log(`  ${surface.padEnd(5)} ${e.yomi.padEnd(7)} アクセント型 ${e.accent}${flag}`);
  console.log(`        ${e.note}`);
}

rule('BATCH');
for (const text of SAMPLES) {
  const { segments, output } = await analyze(text, DICTIONARY);
  console.log(`  in   ${text}`);
  for (const s of segments.filter((x) => x.kind === 'tag')) {
    const particle = s.particle ? ` + ${s.particle}(${s.particleYomi})` : '';
    console.log(`       ${s.word}${particle}  ${s.yomi} 型${s.accent}  ->  ${s.phonemes}  ${s.contour}`);
  }
  console.log(`  out  ${output}\n`);
}

rule('THE TRAP — token boundaries make it structurally impossible');
{
  const text = '日本橋の近くです。';
  const withCompound = await analyze(text, DICTIONARY);
  const { '日本橋': _drop, ...withoutCompound } = DICTIONARY;
  const bare = await analyze(text, withoutCompound);

  console.log(`  ${text}`);
  console.log(`  tokens: ${withCompound.tokens.map((t) => t.surface).join(' | ')}`);
  console.log(`\n  with a 日本橋 entry:  ${withCompound.output}`);
  console.log(`  without one:         ${bare.output}`);
  console.log(`\n  Note the second line: 橋 is in the dictionary, but 日本橋 is a single`);
  console.log(`  token, so there is no boundary for 橋 to match on. It falls through to`);
  console.log(`  kuromoji's own reading (ニホンバシ) instead of being mangled.`);
}

rule('STREAMING — carry buffer over simulated LLM deltas');
{
  const text = SAMPLES.at(-1);
  const buffer = new CarryBuffer({ maxKeyLength: maxKeyLength(DICTIONARY), pressure: 24 });
  console.log(`  ${text}\n`);
  const chars = [...text];

  for (let i = 0; i < chars.length; ) {
    const n = 1 + ((i * 7 + 3) % 4);
    const delta = chars.slice(i, i + n).join('');
    i += n;
    for (const seg of buffer.push(delta)) {
      const { output } = await analyze(seg.text, DICTIONARY);
      console.log(`  release [${seg.reason}]  ${seg.text}`);
      console.log(`                    ${output}`);
    }
  }
  for (const seg of buffer.flush()) {
    const { output } = await analyze(seg.text, DICTIONARY);
    console.log(`  release [${seg.reason}]  ${seg.text}`);
    console.log(`                    ${output}`);
  }
}
console.log();
