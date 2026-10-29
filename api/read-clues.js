// Vercel serverless function: reads a Murdoku clue photo with Claude.
// Set ANTHROPIC_API_KEY in the Vercel project settings (optional: ANTHROPIC_MODEL).
// The prompt lives here, not in the browser, so the endpoint cannot be used as a general-purpose proxy.
// Keep the wording in sync with the prompt in page.html (readClues).

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

const MAX_IMAGE_CHARS = 4_000_000; // Vercel functions accept request bodies up to about 4.5 MB

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'not_configured' });

  // Only accept calls made from this site's own pages.
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch (e) { /* invalid origin */ }
    if (!sameHost) return res.status(403).json({ error: 'forbidden_origin' });
  }

  const image = req.body && req.body.image;
  const m = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m || image.length > MAX_IMAGE_CHARS) return res.status(400).json({ error: 'bad_image' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
    if (!r.ok) return res.status(502).json({ error: 'upstream_error', status: r.status });
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!text.trim()) return res.status(502).json({ error: 'empty_completion' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_error' });
  }
};
