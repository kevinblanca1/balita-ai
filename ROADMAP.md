# Balita AI — Roadmap

Potential improvements to grow this from a simple RSS → summarize → Slack
pipeline into a portfolio-grade, AI-engineering project.

**Guiding principle:** keep the clean service architecture
(`RssService` → `OpenAiService` → `SlackService`). Add capabilities as new
services so the pipeline stays legible.

**The story to tell:** *a grounded, evaluated, multi-source news aggregation
pipeline* — not "I called an LLM on some RSS."

---

## Priority features (the standouts)

### 1. Semantic clustering — fixes duplicate coverage

**Problem:** With multiple sources, the same story eats several digest slots
(5 outlets cover one senate hearing → 5 of your 10 slots wasted).

**Design:**
- Pool articles from all feeds (`RssService.fetchAll()` already exists).
- New `EmbeddingService`: embed each article's `title + snippet` via
  `text-embedding-3-small` (cheap).
- Cluster by cosine similarity (greedy threshold / agglomerative pass — no heavy
  deps). Each cluster = one *story* with N source links.
- Summarize one representative (or synthesize across the cluster). Slack card
  shows *"Also covered by: Rappler, Inquirer."*

**Payoff:** demonstrates embeddings + vector similarity + a real product
decision (story-level vs article-level). Biggest "AI engineer" signal.

### 2. Faithfulness evaluation — fixes AI trust

**Problem:** Summaries can silently hallucinate; nothing checks them.

**Design:**
- New `EvalService.scoreFaithfulness(summary, sourceText)` → LLM-as-judge returns
  `{ grounded: 0–1, unsupported_claims: [] }`.
- Below threshold → one stricter regeneration attempt; if it still fails, fall
  back to the existing `_leadSentence` extractive summary (guaranteed grounded).
- Log every score to JSONL → material for an eval dashboard and a README stat
  ("98.2% of summaries scored ≥0.9 grounded over 30 days").

**Payoff:** the clearest differentiator. Very few news-digest projects have an
eval loop — it signals production maturity.

---

## Supporting engineering upgrades (do alongside)

- **Structured outputs:** replace `JSON.parse` + manual validation with Zod
  schemas via OpenAI structured outputs / function calling. Keep the index-based
  link reattachment (a genuinely good anti-hallucination pattern — call it out).
- **Resilience:** retry-with-backoff around OpenAI, RSS, embedding, and eval calls.
- **Cost / observability:** track tokens + $ per run, logged to the same JSONL.
- **Tests:** unit tests on clustering + the eval fallback logic. Any tests at all
  separate this from most portfolio repos.

---

## Later phases (breadth)

### Phase 3 — Personalization
Interest-profile relevance ranking. Reuse the embeddings already computed —
cosine similarity between a profile ("PH politics, tech, peso/economy") and each
story to rank/filter. Solves information overload.

### Phase 4 — Persistence + deltas
SQLite of past stories → "developing" / "new today" / "follow-up to yesterday's
X" tags. Adds the "what changed since yesterday" value that a stateless run lacks.

### Phase 5 — Interactive Slack
Small Express/serverless endpoint for buttons + threaded deep-dives: "explain
more", "🔇 mute this topic", on-demand deep dive. Moves from one-way blast to
interaction.

---

## Suggested build order

1. Structured outputs + retries — foundation, low risk.
2. Multi-source + semantic clustering — the visible win.
3. Faithfulness eval + fallback — the credibility win.
4. Observability / eval logging + README writeup with real numbers.
