/**
 * Demo server. Keeps the Fish Audio key server-side — never ship it to a browser.
 *
 *   FISH_API_KEY=... npm start   ->  http://localhost:8787
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DICTIONARY, SAMPLES } from './dictionary.js';
import { analyze } from './tokenize.js';
import { CarryBuffer, maxKeyLength } from './stream.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const FISH_URL = 'https://api.fish.audio/v1/tts';

/**
 * Read config at request time, not at boot: process.env is fixed once the
 * process starts, so a key added to .env afterwards would need a restart.
 * Reading on demand means you can drop the key in while the server is running
 * — handy when a tunnel is pointed at it and you don't want to cycle the port.
 */
function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.join(HERE, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${name}=`));
    return line ? line.slice(line.indexOf('=') + 1).trim() || null : null;
  } catch {
    return null;
  }
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // --- static ------------------------------------------------------------
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(path.join(HERE, 'public', 'index.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // --- defaults for the UI ------------------------------------------------
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
        dictionary: DICTIONARY,
        samples: SAMPLES,
        hasFishKey: Boolean(env('FISH_API_KEY')),
      });
    }

    // --- parse + replace ----------------------------------------------------
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const { text = '', dictionary = DICTIONARY } = await readBody(req);
      return json(res, 200, await analyze(text, dictionary));
    }

    // --- simulated LLM stream through the carry buffer (SSE) ----------------
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const text = url.searchParams.get('text') ?? '';
      const dictionary = url.searchParams.get('dictionary')
        ? JSON.parse(url.searchParams.get('dictionary'))
        : DICTIONARY;

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const buffer = new CarryBuffer({ maxKeyLength: maxKeyLength(dictionary), pressure: 24 });
      const chunks = chunkLikeAnLLM(text);

      for (const chunk of chunks) {
        const released = buffer.push(chunk);
        send('delta', { chunk, pending: buffer.pending });
        for (const seg of released) {
          send('release', { ...seg, ...(await analyze(seg.text, dictionary)) });
        }
        await sleep(70);
      }
      for (const seg of buffer.flush()) {
        send('release', { ...seg, ...(await analyze(seg.text, dictionary)) });
      }
      send('done', {});
      return res.end();
    }

    // --- synthesize ---------------------------------------------------------
    if (req.method === 'POST' && url.pathname === '/api/tts') {
      const apiKey = env('FISH_API_KEY');
      if (!apiKey) return json(res, 400, { error: 'FISH_API_KEY is not set on the server' });

      const body = await readBody(req);
      const { text, model = 's2.1-pro' } = body;
      const referenceId = body.referenceId ?? env('FISH_REFERENCE_ID');
      const upstream = await fetch(FISH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', model },
        body: JSON.stringify({ text, format: 'mp3', ...(referenceId ? { reference_id: referenceId } : {}) }),
      });

      if (!upstream.ok) {
        return json(res, upstream.status, { error: `fish.audio ${upstream.status}: ${await upstream.text()}` });
      }
      const audio = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': audio.length });
      return res.end(audio);
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

/** Chop text into uneven 1–4 character pieces, the way an LLM emits tokens. */
function chunkLikeAnLLM(text) {
  const chunks = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; ) {
    const n = 1 + ((i * 7 + 3) % 4);   // deterministic, so demos repeat identically
    chunks.push(chars.slice(i, i + n).join(''));
    i += n;
  }
  return chunks;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  if (!env('FISH_API_KEY')) console.log('FISH_API_KEY not set — add it to .env any time, no restart needed.');
});
