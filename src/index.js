import 'dotenv/config';
import { RssService } from './rss.service.js';
import { OpenAiService } from './openai.service.js';
import { SlackService } from './slack.service.js';

const rss = new RssService();
const ai = new OpenAiService();
const slack = new SlackService();

async function main() {
  // --- Example 1: Summarize a specific section directly ---
//   console.log('Fetching business articles...\n');
//   const articles = await rss.fetchSection('business');
//   const digest = await ai.generateDigest('business', articles);
//   console.log('=== Business Digest ===');
//   console.log(digest);
//   console.log();

  // --- Example 2: Resolve user intent then fetch + summarize ---
//   const userQuery = "what's the latest in sports?";
//   console.log(`User asked: "${userQuery}"\n`);

//   const { section } = await ai.resolveIntent(userQuery, ['news', 'business', 'opinion', 'sports']);
//   console.log(`Resolved section: ${section}\n`);

//   if (section !== 'unknown') {
//     const sectionArticles = await rss.fetchSection(section);
//     const sectionDigest = await ai.generateDigest(section, sectionArticles);
//     console.log(`=== ${section.toUpperCase()} Digest ===`);
//     console.log(sectionDigest);
//   } else {
//     console.log('Could not determine which section to fetch.');
//   }

  console.log('Fetching news articles...\n');
  const newsArticles = await rss.fetchSection('news');
  console.log(`Fetched ${newsArticles.length} articles. Summarizing...\n`);

  const digest = await ai.generateDigest('news', newsArticles);
  console.log('=== News Digest ===');
  for (const item of digest) {
    console.log(`- ${item.title}: ${item.summary}\n  ${item.link}`);
  }

  if (slack.enabled) {
    await slack.postDigest('news', digest);
    console.log('\nPosted digest to Slack.');
  } else {
    console.log('\n(SLACK_WEBHOOK_URL not set — skipped Slack post.)');
  }
}

main().catch(console.error);