const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Slack "mrkdwn" section blocks cap at 3000 chars; stay under to be safe.
const BLOCK_LIMIT = 2900;

export class SlackService {
  constructor() {
    this.webhookUrl = WEBHOOK_URL;
  }

  /** Whether a webhook is configured. Lets callers skip posting locally. */
  get enabled() {
    return Boolean(this.webhookUrl);
  }

  /**
   * Post a digest to the configured Slack channel.
   * @param {string} section - e.g. 'news'
   * @param {Array<{title: string, summary: string, link: string}>} items
   */
  async postDigest(section, items) {
    const heading = `📰 ${this._titleCase(section)} Digest — ${this._today()}`;

    const body = items?.length
      ? items
          .map(
            (it) =>
              `• *${this._escape(it.title)}*: ${this._escape(it.summary)}` +
              (it.link ? ` <${it.link}|Read more>` : ''),
          )
          .join('\n')
      : `No ${section} articles to summarize right now.`;

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: heading, emoji: true } },
    ];

    // Hero image: the top (most significant) story's photo, if we can find one.
    const top = items?.[0];
    const heroImage = top?.link ? await this._fetchOgImage(top.link) : null;
    if (heroImage) {
      blocks.push({
        type: 'image',
        image_url: heroImage,
        alt_text: top.title ?? 'Top story',
      });
    }

    blocks.push(
      ...this._chunk(body, BLOCK_LIMIT).map((text) => ({
        type: 'section',
        text: { type: 'mrkdwn', text },
      })),
    );

    // `text` is the notification/fallback shown in push notifications.
    // unfurl_* off: we render our own hero image, so suppress Slack's automatic
    // (and inconsistent) link previews.
    await this._post({
      text: heading,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  /**
   * Fetch a page's Open Graph image URL. Returns null on any failure so a
   * missing image never breaks the digest.
   */
  async _fetchOgImage(url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (balita-ai digest bot)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async _post(payload) {
    if (!this.enabled) {
      throw new Error('SLACK_WEBHOOK_URL is not set');
    }

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Slack webhooks return 200 + "ok", or a non-200 with an error string.
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Slack post failed: ${res.status} ${detail}`);
    }
  }

  /** Escape the characters Slack mrkdwn treats as special. */
  _escape(text) {
    return (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Split text into <= size chunks on line boundaries. */
  _chunk(text, size) {
    if (text.length <= size) return [text];
    const chunks = [];
    let current = '';
    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > size && current) {
        chunks.push(current);
        current = '';
      }
      current += (current ? '\n' : '') + line;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  _titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _today() {
    return new Date().toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
