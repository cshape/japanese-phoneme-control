/**
 * Carry buffer for LLM token streams.
 *
 * The problem: a dictionary match can straddle a chunk boundary. If the model
 * emits 「日本」 then 「橋の近く」, processing each delta on its own never sees
 * 日本橋 — you get the wrong reading, silently.
 *
 * So deltas accumulate, and the buffer only releases text it is sure is safe:
 *
 *   1. PUNCTUATION release — cut at the last 。、！？. This is the primary path
 *      and the accurate one: it lines up with Fish Audio's guidance to tag
 *      short runs split on punctuation, and it gives kuromoji a complete
 *      clause to tokenize.
 *
 *   2. PRESSURE release — if the buffer grows past `pressure` with no
 *      punctuation in sight, release everything except a held-back tail.
 *
 * Sizing that tail is the subtle part. It must cover the longest dictionary
 * key PLUS the particle that follows it, because a match consumes the particle
 * too. Reserve only the key length and you get this, observed live:
 *
 *      …橋の上で箸          ->  …<|phoneme_start|>ha1shi0<|phoneme_end|>
 *      を落としてしまいました。  ->  を落としてしまいました。
 *
 * 箸 was released without its を, so it lost the particle's pitch and the を
 * was then spoken as a separate fragment. Right sounds, wrong prosody, and no
 * error raised anywhere.
 *
 * Even sized correctly, pressure release trades a little accuracy: the
 * released segment is tokenized without the text that follows it, so kuromoji
 * may segment the final word differently than it would have. Punctuation
 * release has no such cost. Set `pressure` high enough that ordinary Japanese
 * prose almost always hits punctuation first.
 */

const BOUNDARY = /[。、！？!?…\n]/g;

export class CarryBuffer {
  /**
   * @param {object}  opts
   * @param {number}  opts.maxKeyLength     longest dictionary key, in characters
   * @param {number}  opts.particleReserve  longest particle to keep attachable (まで, から, ばかり…)
   * @param {number}  opts.pressure         release without punctuation past this length
   */
  constructor({ maxKeyLength = 8, particleReserve = 3, pressure = 60 } = {}) {
    this.holdback = Math.max(maxKeyLength + particleReserve - 1, 1);
    this.pressure = Math.max(pressure, this.holdback + 1);
    this.buffer = '';
  }

  /** Feed one LLM delta. Returns segments ready to send, possibly empty. */
  push(delta) {
    this.buffer += delta;
    const out = [];

    // 1. punctuation release
    let lastBoundary = -1;
    BOUNDARY.lastIndex = 0;
    for (const m of this.buffer.matchAll(BOUNDARY)) lastBoundary = m.index;
    if (lastBoundary >= 0) {
      out.push({ reason: 'punctuation', text: this.buffer.slice(0, lastBoundary + 1) });
      this.buffer = this.buffer.slice(lastBoundary + 1);
    }

    // 2. pressure release
    if (this.buffer.length >= this.pressure) {
      const cut = this.buffer.length - this.holdback;
      if (cut > 0) {
        out.push({ reason: 'pressure', text: this.buffer.slice(0, cut) });
        this.buffer = this.buffer.slice(cut);
      }
    }

    return out;
  }

  /** Characters currently held back, waiting for more input. */
  get pending() {
    return this.buffer;
  }

  /** Call when the LLM stream ends. Releases whatever is left. */
  flush() {
    const text = this.buffer;
    this.buffer = '';
    return text ? [{ reason: 'end', text }] : [];
  }
}

/** Longest dictionary key length, in characters. */
export function maxKeyLength(dictionary) {
  return Object.keys(dictionary).reduce((n, k) => Math.max(n, [...k].length), 1);
}
