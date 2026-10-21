// Optional generation step.
//
// Retrieval runs entirely in the browser and needs nothing external. If a
// visitor supplies their own API key, the retrieved passages are handed to a
// language model to be written up as prose with inline [1][2] citations.
// The key is sent straight from the visitor's browser to the provider and is
// never stored anywhere but their own tab.

import { formatCitation } from './retriever';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    model: 'claude-sonnet-5-5',
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4o-mini',
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
};

const SYSTEM_PROMPT = `You answer questions about bicycles and cycling.

You are given numbered excerpts retrieved from Wikipedia articles. Rules:
- Answer only from the excerpts. Never add facts from your own knowledge, however confident you are about bicycles.
- Cite with bracketed numbers matching the excerpts, e.g. [1] or [2][3]. Cite every claim.
- If the excerpts do not contain the answer, say so plainly and mention what they do cover. Do not guess.
- The excerpts are retrieved by similarity, so some may be irrelevant to the question. Ignore those rather than working them in.
- Be concise: two or three short paragraphs at most, no headings, no bullet lists.
- Write in plain prose for a technically literate reader.`;

// The locator comes from formatCitation rather than being rebuilt here, because
// building it twice is how the page ended up telling the model "page undefined"
// for every excerpt of a corpus that has no pages.
export function buildUserPrompt(question, passages) {
  const context = passages
    .map((chunk, i) => `[${i + 1}] ${formatCitation(chunk)}:\n${chunk.text}`)
    .join('\n\n');

  return `Excerpts:\n\n${context}\n\nQuestion: ${question}`;
}

async function callAnthropic(key, question, passages, signal) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Required for browser-originated calls; the key stays in the visitor's tab.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: PROVIDERS.anthropic.model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(question, passages) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(describeFailure(response.status, detail));
  }
  const payload = await response.json();
  return payload.content.map((block) => block.text || '').join('').trim();
}

async function callOpenAI(key, question, passages, signal) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: PROVIDERS.openai.model,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, passages) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(describeFailure(response.status, detail));
  }
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || '';
}

function describeFailure(status, detail) {
  if (status === 401 || status === 403) return 'That API key was rejected by the provider.';
  if (status === 429) return 'The provider rate-limited the request. Try again in a moment.';
  if (status >= 500) return 'The provider had a server error. Try again in a moment.';
  try {
    const parsed = JSON.parse(detail);
    if (parsed?.error?.message) return parsed.error.message;
  } catch (err) { /* fall through to the generic message */ }
  return `The request failed (HTTP ${status}).`;
}

export async function synthesizeAnswer({ provider, apiKey, question, passages, signal }) {
  if (provider === 'anthropic') return callAnthropic(apiKey, question, passages, signal);
  if (provider === 'openai') return callOpenAI(apiKey, question, passages, signal);
  throw new Error(`Unknown provider: ${provider}`);
}
