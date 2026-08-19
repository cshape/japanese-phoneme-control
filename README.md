# Japanese pronunciation dictionary → Fish Audio TTS

A client-side user dictionary for Japanese, expanded into Fish Audio's inline
`<|phoneme_start|>…<|phoneme_end|>` tags at request time.

Fish Audio's [documented](https://docs.fish.audio/developer-guide/core-features/fine-grained-control/japanese)
pronunciation control is the inline tag. This keeps a dictionary on your side
and expands it into tags just before the call, so content authors work with
words and readings rather than `ha0shi1no0`.

```bash
npm install
cp .env.example .env               # paste your FISH_API_KEY into it
npm start                          # web UI at http://localhost:8787
npm run demo                       # terminal walkthrough (no key needed)
```

`.env` is gitignored and loaded via Node's `--env-file-if-exists`, so the key
never lands in the source you hand to anyone. A one-off works too:
`FISH_API_KEY=... npm start`. Set `FISH_REFERENCE_ID` to speak with a specific
voice model instead of the default.

## How an entry works

```js
'橋': { yomi: 'ハシ', accent: 2, verified: true }
```

| field | 日本語 | what it is |
| --- | --- | --- |
| key | 表層形 | the word as written — what gets matched |
| `yomi` | 読み | the reading in katakana: *which* sounds |
| `accent` | アクセント型 | *where* the pitch drops, counted in **morae** |

`accent` is the standard Tokyo notation: `0` = 平板 (never drops, following
particle stays high), `1` = 頭高 (drops after mora 1), `n` = drops after mora
*n*. Morae, not characters — `キョ`, `ー`, `ン`, `ッ` are one mora each.

These compile to the OpenJTalk string Fish Audio wants, which is the real
analogue of an IPA entry — one self-contained string, dropped in by replacement:

```
ハシ + ノ, accent 2   ->   ha0shi1no0   (L H L)
```

The two fields are separate because they fail separately — a front-end
routinely gets the reading right and the pitch wrong — and because a Japanese
speaker can supply both from intuition, and review someone else's work. Nobody
can review `ha0shi1no0` by eye. It's also the same shape VOICEVOX's user
dictionary uses, so entries port to any OpenJTalk-based engine.

## Why kuromoji

Japanese has no spaces, so a substring match has no word boundary to respect —
a `橋` entry fires inside `日本橋` and you get *nihon-hashi*. kuromoji segments
the text first, so a match can only land on whole tokens and that failure
becomes structurally impossible.

It also supplies a default reading, and the phonetic reading of particles
(topic-marker は → ワ, へ → エ), which is how the particle gets attached to a
match automatically. That's why entries are keyed on the bare word: `橋` covers
橋が, 橋の, 橋を without duplicate entries.

What kuromoji does **not** give you:

- **Pitch accent.** IPADIC carries none. Every accent value comes from your
  dictionary.
- **Correct readings for proper nouns.** It reads 放出 as ホウシュツ (the common
  noun "release") rather than はなてん, and 端 as ハジ rather than ハシ. Those
  are exactly the entries worth having.

## Streaming from an LLM

A dictionary match can straddle a chunk boundary — if the model emits 「日本」
then 「橋の近く」, per-delta processing never sees 日本橋. `CarryBuffer` holds
deltas and releases on two conditions:

- **punctuation** — cut at the last 。、！？. Primary path, no accuracy cost,
  and it matches Fish's own guidance to tag short runs split on punctuation.
- **pressure** — past a length threshold with no punctuation, release all but a
  held-back tail sized to cover the longest dictionary key **plus** a following
  particle. Reserve only the key length and a word gets released without its
  particle, losing the particle's pitch with no error raised.

Related: don't have the LLM emit the phoneme tags itself. A streamed tag can
split mid-token, and a malformed tag has no fallback — the original word is
gone. Post-processing clean text keeps the pronunciation data in one reviewable
place.

## Files

| file | |
| --- | --- |
| `phonemes.js` | kana → morae → pitch digits. No dependencies. |
| `dictionary.js` | the dictionary and sample sentences |
| `tokenize.js` | kuromoji + token-boundary matching + particle attachment |
| `stream.js` | `CarryBuffer` for LLM token streams |
| `server.js` | demo server; holds `FISH_API_KEY` so it never reaches the browser |
| `public/index.html` | web UI |
| `demo.js` | terminal walkthrough |

## Accent values

Get them from [OJAD](https://www.gavo.t.u-tokyo.ac.jp/ojad/) (free, covers
conjugated forms), the NHK 日本語発音アクセント新辞典, or generate a first pass
with `pyopenjtalk` and correct it. Then listen — accent varies by dictionary,
reading and dialect.

Entries carry `verified: false` until someone has heard them. The UI badges
those, and `npm run demo` prints them as a to-check list. `放出` and `日本橋`
ship unverified.
