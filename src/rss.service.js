import Parser from 'rss-parser';

const parser = new Parser();

// Add or remove sections as needed — verify exact URLs from Manila Times RSS page
const FEEDS = [
  { section: 'news', url: 'https://www.manilatimes.net/news/feed/' },
  { section: 'nation', url: 'https://www.manilatimes.net/national/feed/' },
  { section: 'world', url: 'https://www.manilatimes.net/world/feed/' },
  // Business Related
  { section: 'business', url: 'https://www.manilatimes.net/business/feed/' },
  { section: 'agribusiness', url: 'https://www.manilatimes.net/business/agribusiness/feed/' },
  { section: 'foreign-business', url: 'https://www.manilatimes.net/business/foreign-business/feed/' },
  { section: 'top-business', url: 'https://www.manilatimes.net/business/top-business/feed/' },
  // Entertainment & Lifestyle
  { section: 'entertainment', url: 'https://www.manilatimes.net/entertainment-lifestyle/show-times/feed/' },
  { section: 'lifestyle', url: 'https://www.manilatimes.net/entertainment-lifestyle/life-times/feed/' },
];

export class RssService {
  /**
   * Fetch a single feed by section name.
   * Returns an array of normalized article objects.
   */
  async fetchSection(section) {
    const feed = FEEDS.find((f) => f.section === section);
    if (!feed) throw new Error(`Unknown section: ${section}`);
    return this._parseFeed(feed);
  }

  /**
   * Fetch all configured feeds.
   * Returns a map of { section -> articles[] }
   */
  async fetchAll() {
    const results = {};
    for (const feed of FEEDS) {
      results[feed.section] = await this._parseFeed(feed);
    }
    return results;
  }

  async _parseFeed({ section, url }) {
    const feed = await parser.parseURL(url);
    return feed.items
      .map((item) => ({
        section,
        title: item.title ?? '',
        link: item.link ?? '',
        pubDate: item.pubDate ?? '',
        snippet: this._clip(item.contentSnippet ?? '', 600), // trim to keep tokens low
        isoDate: item.isoDate ?? '',
      }))
      .filter((article) => article.snippet.trim().length > 0) // drop empty items
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate)) // newest first (defensive)
      .slice(0, 10); // keep only the 10 newest
  }

  /**
   * Trim text to `max` chars, cutting on the nearest sentence/paragraph
   * boundary so the model never receives a half-word or half-sentence.
   */
  _clip(text, max) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
    return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim() + '…';
  }
}