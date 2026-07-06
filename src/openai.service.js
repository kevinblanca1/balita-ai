import OpenAI from 'openai';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export class OpenAiService {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = DEFAULT_MODEL;
  }

  /**
   * Summarize a section's articles into a structured digest, ordered by
   * news significance. Each item references its source article by index so
   * the caller can attach the real link (no hallucinated URLs).
   *
   * @param {string} section - e.g. 'news'
   * @param {Array<{title: string, snippet: string, link: string}>} articles
   * @returns {Promise<Array<{title: string, summary: string, link: string}>>}
   */
  async generateDigest(section, articles) {
    if (!articles?.length) return [];

    // Send title + snippet, numbered so the model can reference each by index.
    // Links stay out of the prompt (saves tokens; we reattach them below).
    const items = articles
      .map((a, i) => `${i}. ${a.title}\n${a.snippet}`)
      .join('\n\n');

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a Philippine news editor writing a brief daily digest. ' +
            'Summarize each provided article into one concise, scannable sentence, ' +
            'leading with the key fact. Keep names, numbers, and places accurate. ' +
            'Do not invent details not present in the text. ' +
            'Include every article exactly once — do not merge, skip, or omit any. ' +
            'Order the results by news significance, most important first. ' +
            'Keep each summary under about 30 words. ' +
            'Respond ONLY with JSON of the form ' +
            '{"items": [{"index": <the number of the source article>, ' +
            '"title": "<short headline, 3-6 words>", "summary": "<one sentence>"}]}.',
        },
        {
          role: 'user',
          content: `Summarize these ${section} articles:\n\n${items}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    // Keep only items that map to a real article, deduped by index, and
    // reattach the true link.
    const seen = new Set();
    const digest = [];
    for (const it of parsed.items ?? []) {
      if (!Number.isInteger(it.index) || !articles[it.index]) continue;
      if (seen.has(it.index)) continue;
      seen.add(it.index);
      digest.push({
        title: it.title ?? articles[it.index].title,
        summary: it.summary ?? '',
        link: articles[it.index].link,
      });
    }

    // Backstop: guarantee every article appears, even if the model dropped or
    // merged some. Missing ones are appended (they were deemed least important)
    // using the article's own title and lead sentence.
    articles.forEach((article, i) => {
      if (seen.has(i)) return;
      digest.push({
        title: article.title,
        summary: this._leadSentence(article.snippet),
        link: article.link,
      });
    });

    return digest;
  }

  /** First sentence of a snippet, as a fallback summary. */
  _leadSentence(text) {
    const trimmed = (text ?? '').trim();
    const end = trimmed.indexOf('. ');
    return end > 0 ? trimmed.slice(0, end + 1) : trimmed;
  }

  /**
   * Resolve a free-form user query to one of the known sections.
   * @param {string} query - e.g. "what's the latest in sports?"
   * @param {string[]} sections - valid section names
   * @returns {Promise<{section: string}>} matched section, or 'unknown'
   */
  async resolveIntent(query, sections) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You map a user request to exactly one news section. ' +
            `Valid sections: ${sections.join(', ')}. ` +
            'Respond ONLY with JSON of the form {"section": "<one of the valid sections, or \'unknown\'>"}. ' +
            'Use "unknown" if none clearly apply.',
        },
        { role: 'user', content: query },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let section = 'unknown';
    try {
      const parsed = JSON.parse(raw);
      if (sections.includes(parsed.section)) section = parsed.section;
    } catch {
      section = 'unknown';
    }
    return { section };
  }
}
