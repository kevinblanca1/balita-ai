# balita-ai

An AI news summarizer. It crawls RSS feeds, trims each article to keep token
usage low, and asks OpenAI to turn them into a short, scannable digest. Intended
to run on a cron (morning / noon / night).

> *balita* — Filipino for "news."

## How it works

```
RSS feed  ──▶  RssService  ──▶  OpenAiService  ──▶  digest
(Manila Times)   fetch + trim      summarize        (bulleted briefing)
```

1. `**RssService**` fetches a feed, normalizes each item, trims the body,
  drops empty items, sorts newest-first, and keeps the 10 newest.
2. `**OpenAiService**` summarizes those articles into a bulleted briefing, and
  can also map a free-form query (e.g. *"what's the latest in sports?"*) to a
   known section.

## Requirements

- Node `v22.19.0` (see `.nvmrc` — run `nvm use`)
- An OpenAI API key

## Setup

```bash
nvm use
pnpm install        # or: npm install
```

Create a `.env` file in the project root:

```bash
OPENAI_API_KEY=sk-...        # required
OPENAI_MODEL=gpt-4o-mini     # optional, defaults to gpt-4o-mini
```

## Usage

```bash
npm start           # fetch the "news" section and print a digest
npm run dev         # same, with --watch for local development
```

## Configuration

### Feeds

Sections are defined in `src/rss.service.js`:

```js
const FEEDS = [
  { section: 'news',   url: 'https://www.manilatimes.net/news/feed/' },
  { section: 'nation', url: 'https://www.manilatimes.net/national/feed/' },
  { section: 'world',  url: 'https://www.manilatimes.net/world/feed/' },
];
```

Add or remove entries as needed. If you use `resolveIntent`, pass it the same
section names you define here — otherwise a resolved section may not exist and
`fetchSection` will throw `Unknown section`.

### Model

Set `OPENAI_MODEL` in `.env` to override the default (`gpt-4o-mini`).

## Why we trim article bodies

Manila Times puts the **entire article body** into the RSS `<description>`, so
`rss-parser`'s `contentSnippet` is the full plain-text article — anywhere from
~~800 to ~6,000+ characters. Left untrimmed, one section (~~48 items) is roughly
18,000 input tokens; across 3 sections × 3 runs/day that adds up fast.

Philippine news is written "inverted pyramid" style — the who/what/when/where
is in the first sentence or two — so a short lead is enough for a good one-line
summary. We keep the first ~600 characters, cut on a sentence boundary.

### The `_clip` method

```js
_clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim() + '…';
}
```

Behavior:


| Input situation                         | Result                             |
| --------------------------------------- | ---------------------------------- |
| Text already ≤ `max`                    | returned unchanged (no `…`)        |
| Sentence end (`.` ) in the back half    | cut cleanly at that period + `…`   |
| Paragraph break (`\n`) in the back half | cut at the break + `…`             |
| No boundary in the back half            | hard cut at `max` + `…` (fallback) |


The `lastStop > max * 0.5` guard means we only honor a boundary if it's in the
**back half** of the window — otherwise a period near the very start would throw
away most of the content, so we fall back to a hard cut.

### Known limitation: abbreviations

`_clip` treats **any period-plus-space as a sentence end**, including
abbreviations (`Sen.`, `Gen.`, `a.m.`, `Jr.`). If one falls in the back half of
the window, the snippet can end a little early, e.g.:

> `"...the plunder case against Sen.…"`

**This is a deliberate trade-off, not a bug.** It's purely cosmetic — it only
affects where a snippet visually ends, never the lead facts the model receives,
so summary quality is unaffected. A "correct" fix (an abbreviation dictionary or
real sentence segmentation) is far more complexity than a news snippet warrants.

Decimals (`7.5`), prices (`P18,127`), and times without a trailing space are
**safe** — no space after the dot means `.`  doesn't match.

## How summaries are generated

`generateDigest(section, articles)` sends the articles (numbered) to the model
and asks for **structured JSON** — one item per article, each with a short
title, a one-sentence summary, and the `index` of its source article. The model
is also told to **order by news significance** and **include every article
exactly once**.

We deliberately do **not** send article links to the model. Instead, each
returned item carries the source `index`, and we reattach the real URL from our
own data by that index. This guarantees links are always correct — the model
can't hallucinate a URL.

### Completeness backstop

Asking the model to "include every article" is a request, not a guarantee. An
LLM can still drop or merge items, for three reasons:

1. **Merging near-duplicates** — two articles on the same event may be folded
   into one bullet.
2. **Editorial trimming** — the "digest" + "order by significance" framing can
   lead it to silently drop the least important story.
3. **No counting guarantee** — an LLM generating a list does not verify that
   output count matches input count, and can simply lose track.

So after the model responds, a code-level **backstop** runs — purely
post-processing, it never changes what is sent to the model:

```
1. Build the prompt from all N articles  ─┐
2. Send to the model                      │  the model call
3. Model returns JSON (maybe N-1 items)  ─┘

4. Parse JSON, dedupe items by index     ─┐
5. Track which article indices came back  │  BACKSTOP (runs in code,
6. Append any missing article, filling    │  after the response)
   its title + lead sentence from the RSS ─┘
   data — no extra model call
7. Return all N items
```

A backstop-filled item uses the article's **own** RSS title and the first
sentence of its snippet (via `_leadSentence`) rather than a model-written
summary. It reads slightly rawer and is appended at the end (these were the
items the model deemed least important), but nothing is ever lost and there is
zero hallucination risk — it's the publisher's own words.

| | Runs | Purpose | Guaranteed? |
| ---------------------- | -------------------- | -------------------------- | ----------- |
| Prompt instruction     | before (in the call) | nudges the model to not drop/merge | No |
| Backstop (code)        | after (on response)  | fills anything still missing | **Yes** |

> Trade-off: forcing completeness means genuine near-duplicate stories now
> appear as two similar bullets instead of one merged one. If that becomes
> noticeable, the cleaner fix is to dedupe articles in `RssService` before they
> ever reach the model, rather than letting the model decide.

## Project structure

```
src/
  index.js           entry point — fetch + summarize + post
  rss.service.js     RssService: fetch, normalize, trim, sort, top-10
  openai.service.js  OpenAiService: generateDigest, resolveIntent
  slack.service.js   SlackService: postDigest (hero image, no auto-unfurl)
```

## Roadmap

- [x] Combined `fetchAll` digest across all sections
- [ ] Cron scheduling (morning / noon / night)
- [ ] Delivery (email / chat / file)