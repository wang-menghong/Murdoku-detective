// Vercel serverless function: reads a Murdoku clue photo with an AI vision model.
//
// Pick one provider by setting its key in the Vercel project settings:
//   ANTHROPIC_API_KEY   Claude   (model: ANTHROPIC_MODEL, default claude-sonnet-5-5)
//   GEMINI_API_KEY      Gemini   (model: GEMINI_MODEL,    default gemini-3.8-flash)
//   DEEPSEEK_API_KEY    DeepSeek (model: DEEPSEEK_MODEL,  default deepseek-flash)
// If several keys are set, CLUE_PROVIDER (anthropic | gemini | deepseek) chooses;
// otherwise the first key found in the order above is used.
//
// Env GEMINI_THINKING (low | medium | high | off) sets Gemini's thinking level; default low.
// GET  returns {provider, label} (never a key) so the page knows whether to show the AI button.
// POST {image: "data:image/jpeg;base64,..."} returns {text} with the model's JSON reply.
//      Claude and Gemini take the image. DeepSeek takes {text: "<OCR text>"} instead (GET reports input: "text").
// The prompt lives here, not in the browser, so the endpoint cannot be used as a general-purpose proxy.

const PROMPT =
  'The attached photo shows the suspect clue cards of a Murdoku puzzle (a murder-mystery logic grid). ' +
  'Transcribe every card. Reply with only JSON in this shape: ' +
  '{"title": "puzzle title if visible, else empty string", "suspects": [{"name": "first name", ' +
  '"letter": "the single capital letter shown beside the name", "victim": true only for the victim card, ' +
  '"clue": "the clue text exactly as printed, with every word printed in bold wrapped in double asterisks", ' +
  '"face": [left, top, right, bottom of that card\'s small portrait picture as fractions from 0 to 1 of the whole photo width and height]}], ' +
  '"rules": ["each general rule or clue in the photo that does not belong to one suspect card, transcribed exactly, bold words in double asterisks"]}. ' +
  'Keep the order of the cards. If a card is partly hidden, include it with your best reading. ' +
  'Use an empty rules array when there are none.';

// DeepSeek's current model has no documented image input, so it works from OCR text instead:
// the page reads the photo offline in the browser and sends only the text.
const PROMPT_TEXT =
  'Below is raw OCR text from the suspect clue cards of a Murdoku puzzle (a murder-mystery logic grid). ' +
  'The text may contain recognition slips, and cards from two columns may be interleaved. ' +
  'Reply with only JSON in this shape: ' +
  '{"title": "puzzle title if present, else empty string", "suspects": [{"name": "first name", ' +
  '"letter": "the single capital letter beside the name", "victim": true only for the victim card, ' +
  '"clue": "the clue text, with obvious OCR slips corrected"}], ' +
  '"rules": ["each general rule that does not belong to one suspect card"]}. ' +
  'Keep the order of the cards. Use an empty rules array when there are none.';

const MAX_IMAGE_CHARS = 4_000_000; // Vercel functions accept request bodies up to about 4.5 MB
const MAX_TEXT_CHARS = 20_000;
const TIMEOUT_MS = 50_000; // answer before Vercel's 60 s function limit (vercel.json) cuts the request off silently

const PROVIDERS = {
  anthropic: {
    label: 'Claude',
    keyEnv: 'ANTHROPIC_API_KEY',
    async call(key, mime, b64, _t, signal) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        signal,
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
      return { r, text: j => (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') };
    },
  },
  gemini: {
    label: 'Gemini',
    keyEnv: 'GEMINI_API_KEY',
    async call(key, mime, b64, _t, signal) {
      const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const level = (process.env.GEMINI_THINKING || 'low').toLowerCase(); // low | medium | high | off
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      const send = withThinking => {
        const generationConfig = { response_mime_type: 'application/json' };
        if (withThinking) generationConfig.thinkingConfig = { thinkingLevel: level };
        return fetch(url, {
          signal,
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
            generationConfig,
          }),
        });
      };
      const useThinking = level !== 'off';
      let r = await send(useThinking);
      if (useThinking && r.status === 400) r = await send(false); // this model may not accept the thinking field
      return {
        r,
        text: j => {
          const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
          return parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n');
        },
      };
    },
  },
  deepseek: {
    label: 'DeepSeek',
    keyEnv: 'DEEPSEEK_API_KEY',
    input: 'text',
    async call(key, _mime, _b64, ocrText, signal) {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        signal,
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
          max_tokens: 4096,
          messages: [{ role: 'user', content: PROMPT_TEXT + '\n\nOCR text:\n' + ocrText }],
        }),
      });
      return { r, text: j => (((j.choices || [])[0] || {}).message || {}).content || '' };
    },
  },
};

function pickProvider() {
  const want = (process.env.CLUE_PROVIDER || '').toLowerCase();
  const order = want && PROVIDERS[want] ? [want] : Object.keys(PROVIDERS);
  for (const id of order) {
    const key = process.env[PROVIDERS[id].keyEnv];
    if (key) return { id, key, ...PROVIDERS[id] };
  }
  return null;
}

module.exports = async function handler(req, res) {
  const prov = pickProvider();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(prov ? { provider: prov.id, label: prov.label, input: prov.input || 'image' } : { provider: null });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!prov) return res.status(501).json({ error: 'not_configured' });

  // Only accept calls made from this site's own pages.
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch (e) { /* invalid origin */ }
    if (!sameHost) return res.status(403).json({ error: 'forbidden_origin' });
  }

  let mime = '', b64 = '', ocrText = '';
  if (prov.input === 'text') {
    const t = req.body && req.body.text;
    if (typeof t !== 'string' || !t.trim() || t.length > MAX_TEXT_CHARS) return res.status(400).json({ error: 'bad_text' });
    ocrText = t;
  } else {
    const image = req.body && req.body.image;
    const m = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!m || image.length > MAX_IMAGE_CHARS) return res.status(400).json({ error: 'bad_image' });
    mime = m[1]; b64 = m[2];
  }

  try {
    const { r, text } = await prov.call(prov.key, mime, b64, ocrText, AbortSignal.timeout(TIMEOUT_MS));
    if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 300); } catch (e) { /* no body */ }
      return res.status(502).json({ error: 'upstream_error', status: r.status, provider: prov.id, detail });
    }
    const out = text(await r.json());
    if (!out || !out.trim()) return res.status(502).json({ error: 'empty_completion' });
    return res.status(200).json({ text: out, provider: prov.id });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return res.status(504).json({ error: 'timeout', provider: prov.id });
    return res.status(502).json({ error: 'upstream_error', provider: prov.id, detail: String((e && e.message) || e).slice(0, 200) });
  }
};
