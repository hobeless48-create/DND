// Direct DeepSeek API rates checked against the official pricing page, 2026-10-27.
export const FLASH_PRICING = { checkedAt: '2026-10-27', model: 'deepseek-flash', version: 'DeepSeek-V4.1-Flash-1017', source: 'https://api-docs.deepseek.com/quick_start/pricing/', tokenSource: 'https://api-docs.deepseek.com/quick_start/token_usage/', englishTokensPerCharacter: .3,
  offPeak: { input: .15, cachedInput: .003, output: .6 }, peak: { input: .30, cachedInput: .006, output: 1.2 } };
export function estimateStoryCost({ replies = 100, charactersPerReply = 300, inputTokensPerReply = 1000, cacheHitPercent = 0, fullHistory = false, userCharactersPerReply = 300, systemTokens = 1000, period = 'offPeak' } = {}) {
  for (const value of [replies, charactersPerReply, inputTokensPerReply, cacheHitPercent, userCharactersPerReply, systemTokens]) if (!Number.isFinite(value) || value < 0) throw new Error('Cost inputs must be finite, nonnegative values.');
  if (!Number.isInteger(replies) || replies > 10000 || cacheHitPercent > 100) throw new Error('Use a whole reply count up to 10,000 and a cache share from 0–100%.');
  if (!['offPeak', 'peak'].includes(period)) throw new Error('Choose peak or offPeak rates.');
  const outputPerReply = charactersPerReply * FLASH_PRICING.englishTokensPerCharacter;
  const outputTokens = replies * outputPerReply;
  const userPerReply = userCharactersPerReply * FLASH_PRICING.englishTokensPerCharacter;
  const inputTokens = fullHistory ? replies * (systemTokens + userPerReply) + (outputPerReply + userPerReply) * replies * (replies - 1) / 2 : replies * inputTokensPerReply;
  const cachedInputTokens = inputTokens * cacheHitPercent / 100;
  const rate = FLASH_PRICING[period];
  const inputCost = (inputTokens - cachedInputTokens) / 1e6 * rate.input + cachedInputTokens / 1e6 * rate.cachedInput;
  const outputCost = outputTokens / 1e6 * rate.output;
  return { inputTokens, outputTokens, cachedInputTokens, inputCost, outputCost, total: inputCost + outputCost, period };
}

// Reserve the full recap/highlight allowance on every call: conservative during
// the opening turns. The recent conversation window ramps up then stays bounded.
export function estimateRollingStoryCost({ replies = 100, charactersPerReply = 300, userCharactersPerReply = 300, systemTokens = 1000, recapTokens = 500, highlightTokens = 200, recentPairs = 4, cacheHitPercent = 0, period = 'offPeak', summaryEvery = 0, summaryInputTokens = 3500, summaryOutputTokens = 500 } = {}) {
  const story = estimateStoryCost({ replies, charactersPerReply, userCharactersPerReply, systemTokens, cacheHitPercent, period });
  for (const value of [recapTokens, highlightTokens, recentPairs, summaryEvery, summaryInputTokens, summaryOutputTokens]) if (!Number.isFinite(value) || value < 0) throw new Error('Memory budgets must be finite nonnegative values.');
  if (!Number.isInteger(recentPairs) || recentPairs > 100 || !Number.isInteger(summaryEvery)) throw new Error('Use whole recent-pair and summary-interval counts.');
  const pairTokens = (charactersPerReply + userCharactersPerReply) * FLASH_PRICING.englishTokensPerCharacter;
  const ramp = Math.min(replies, recentPairs + 1);
  const recentInput = pairTokens * (ramp * (ramp - 1) / 2 + Math.max(0, replies - ramp) * recentPairs);
  const inputTokens = replies * (systemTokens + recapTokens + highlightTokens + userCharactersPerReply * FLASH_PRICING.englishTokensPerCharacter) + recentInput;
  // No refresh after the final reply: that cannot help the modeled session.
  const summaryCalls = summaryEvery ? Math.floor(Math.max(0, replies - 1) / summaryEvery) : 0;
  const cachedInputTokens = inputTokens * cacheHitPercent / 100, rate = FLASH_PRICING[period];
  const inputCost = ((inputTokens - cachedInputTokens) * rate.input + cachedInputTokens * rate.cachedInput) / 1e6;
  // Summary overhead assumes uncached input even when narration has a cache hit.
  const summaryCost = summaryCalls * (summaryInputTokens * rate.input + summaryOutputTokens * rate.output) / 1e6;
  return { ...story, inputTokens, cachedInputTokens, inputCost, total: inputCost + story.outputCost + summaryCost, summaryCalls, summaryCost, summaryInputTokens: summaryCalls * summaryInputTokens, summaryOutputTokens: summaryCalls * summaryOutputTokens, maxStoryInputTokens: replies ? systemTokens + recapTokens + highlightTokens + userCharactersPerReply * FLASH_PRICING.englishTokensPerCharacter + Math.min(replies - 1, recentPairs) * pairTokens : 0 };
}
