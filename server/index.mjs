import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYSTEMS } from './prompts.mjs';
import { validateGeneration } from '../shared/generation.mjs';

const root = process.cwd();
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const port = Number(process.env.PORT || 3030);
const apiKey = process.env.DEEPSEEK_API_KEY || '';
const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
const requests = new Map();
const MAX_BODY = 64_000;

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function limited(request, response) {
  const address = request.socket.remoteAddress || 'local';
  const now = Date.now();
  const previous = requests.get(address) || { start: now, count: 0 };
  if (now - previous.start > 60_000) { previous.start = now; previous.count = 0; }
  previous.count += 1;
  requests.set(address, previous);
  if (previous.count > 30) { json(response, 429, { error: 'Local request limit reached. Wait a minute and try again.' }); return true; }
  return false;
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) { reject(new Error('Request is too large.')); request.destroy(); }
    });
    request.on('end', () => {
      try { resolveBody(JSON.parse(raw || '{}')); } catch { reject(new Error('Request body must be valid JSON.')); }
    });
    request.on('error', reject);
  });
}

function boundContext(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 15_000);
}

function parseModelJson(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('The DM returned an empty response.');
  return JSON.parse(content);
}

function validateOutput(mode, value) {
  if (mode === 'summarize') {
    if (!value || typeof value.recap !== 'string' || !value.recap.trim() || value.recap.length > 1800) throw new Error('Invalid story recap.');
    return { recap: value.recap.trim() };
  }
  if (mode === 'scene') {
    return {
      title: String(value.title || 'The Lower Gallery').slice(0, 48),
      description: String(value.description || '').slice(0, 650),
      objective: String(value.objective || 'Explore the passage ahead.').slice(0, 120),
    };
  }
  if (mode === 'intent') {
    const kinds = new Set(['move', 'attack', 'cast', 'interact', 'talk', 'examine', 'rest', 'unknown']);
    return {
      kind: kinds.has(value.kind) ? value.kind : 'unknown',
      targetName: String(value.targetName || '').slice(0, 64),
      abilityName: String(value.abilityName || '').slice(0, 64),
      reply: String(value.reply || '').slice(0, 180),
    };
  }
  return { text: String(value.text || '').slice(0, 500) };
}

async function handleDm(request, response) {
  if (limited(request, response)) return;
  if (!apiKey) { json(response, 503, { error: 'DeepSeek is not configured. Add your key to DND/.env; the local game still works without it.' }); return; }
  let body;
  try { body = await readBody(request); } catch (error) { json(response, 400, { error: error.message }); return; }
  const mode = body.mode;
  if (!Object.hasOwn(SYSTEMS, mode)) { json(response, 400, { error: 'Unsupported DM request.' }); return; }
  const authoring = ['class_sheet', 'level_skills', 'advanced_skills'].includes(mode);
  const context = boundContext(body.context);
  const input = boundContext(body.input);
  if (mode === 'summarize') {
    try {
      if (typeof body.input !== 'string' || body.input.length > 12000) throw new Error('Recap input must be JSON below 12,000 characters.');
      const data = JSON.parse(body.input);
      if (typeof data.previousRecap !== 'string' || data.previousRecap.length > 1800 || !Array.isArray(data.events) || data.events.length > 8 || data.events.some(event => typeof event.text !== 'string' || event.text.length > 420) || !Array.isArray(data.highlights) || data.highlights.length > 6) throw new Error('Invalid recap source.');
    } catch (error) { json(response, 400, { error: error.message }); return; }
  }
  let generationInput;
  if (authoring) {
    try {
      if (typeof body.input !== 'string' || body.input.length > 15_000) throw new Error('Authoring input must be JSON below 15,000 characters.');
      generationInput = JSON.parse(body.input);
      if (mode === 'class_sheet' && (typeof generationInput.concept !== 'string' || !generationInput.concept.trim() || generationInput.concept.length > 900)) throw new Error('Class concept must contain 1–900 characters.');
      if (mode === 'level_skills' && (!Number.isInteger(generationInput.level) || generationInput.level < 1 || generationInput.level > 10)) throw new Error('Request a level from 1 to 10.');
      if (mode === 'advanced_skills' && (!Array.isArray(generationInput.nodes) || generationInput.nodes.length < 1 || generationInput.nodes.length > 3 || generationInput.nodes.some(node => typeof node.id !== 'string' || ![3, 5, 8].includes(node.level)))) throw new Error('Request one to three advanced nodes at levels 3, 5 or 8.');
    } catch (error) { json(response, 400, { error: error.message }); return; }
  }
  const content = JSON.stringify({ context, input });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), authoring ? 90_000 : 28_000);
  let usage = null;
  try {
    const apiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: `${SYSTEMS[mode]} Output valid JSON only.` }, { role: 'user', content: `Return JSON. Context and input follow:\n${content}` }],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: authoring ? (mode === 'class_sheet' ? 6500 : 7500) : mode === 'summarize' ? 750 : mode === 'scene' ? 420 : mode === 'intent' ? 220 : 300,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!apiResponse.ok) {
      const status = apiResponse.status;
      json(response, status === 401 || status === 403 ? 502 : status === 429 ? 429 : 502,
        { error: status === 401 || status === 403 ? 'DeepSeek rejected the configured API key.' : status === 429 ? 'DeepSeek rate limit reached. Try again shortly.' : `DeepSeek request failed (${status}).` });
      return;
    }
    const payload = await apiResponse.json();
    usage = { inputTokens: payload.usage?.prompt_tokens || 0, outputTokens: payload.usage?.completion_tokens || 0, cachedInputTokens: payload.usage?.prompt_cache_hit_tokens || 0, model };
    if (payload.choices?.[0]?.finish_reason === 'length') throw new Error('The generated JSON was truncated. Retry this segment; completed segments are preserved.');
    const parsed = parseModelJson(payload.choices?.[0]?.message?.content);
    const result = authoring ? validateGeneration(mode, parsed, generationInput) : validateOutput(mode, parsed);
    json(response, 200, { result, usage });
  } catch (error) {
    json(response, 502, { error: error.name === 'AbortError' ? 'DeepSeek timed out. Accepted content is preserved; retry this segment.' : authoring ? `Content was not accepted: ${error.message}` : 'Could not get a valid response from DeepSeek.', usage });
  } finally {
    clearTimeout(timer);
  }
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/status') {
    json(response, 200, { configured: Boolean(apiKey), model: apiKey ? model : null });
    return;
  }
  if (request.method === 'POST' && request.url === '/api/dm') {
    void handleDm(request, response);
    return;
  }
  json(response, 404, { error: 'Not found.' });
});

server.listen(port, '127.0.0.1', () => console.log(`Local DM service listening at http://127.0.0.1:${port}`));
