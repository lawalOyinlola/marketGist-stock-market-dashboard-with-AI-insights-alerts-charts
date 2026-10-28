export const PERSONALIZED_WELCOME_EMAIL_PROMPT = `Write the opening paragraph of a welcome email for a new Marketgist user. Marketgist is a stock market dashboard with watchlists, hourly price alerts and a daily AI news brief.

User profile:
{{userProfile}}

The email already opens with the heading "Welcome to Marketgist, <first name>", so do not start with "Welcome". Open with something like "Thanks for joining", "Good to have you here" or "You're all set".

Write two sentences, 35 to 50 words in total, addressed to the reader as "you":
- The first sentence names their actual goal, risk tolerance or preferred industry from the profile, in plain words.
- The second says how Marketgist helps with that, using only the features above: watchlists, price alerts and the daily brief. Do not invent features, numbers or promises.
- Wrap the one or two profile details you mention in <strong>.
- Write like a person, not a brochure: no exclamation marks, no em dashes, no hype words such as "supercharge" or "unlock".
- Never tell the reader what to buy or sell.

Output format: exactly one <p> element and nothing else. No attributes, no classes, no inline styles, no markdown, no code fences. The email applies its own styling.

Example:
<p>Thanks for joining Marketgist. Since you're building a <strong>long-term retirement portfolio</strong> with a <strong>conservative</strong> approach, your watchlist and daily brief will keep the steady movers in view without the day-to-day noise.</p>`;

export const NEWS_SUMMARY_EMAIL_PROMPT = `Write the body of today's Marketgist market brief from the news articles below. Readers are everyday investors, many of them new to it, reading on a phone.

News articles (JSON):
{{newsData}}

Content rules:
- Use only facts that appear in the articles. Do not add numbers, prices, dates or causes that the articles don't state. If an article is thin, say less.
- Group the articles into two to four sections, such as Market overview, Companies on your watchlist, Earnings, or Economy. Use each section name once. Skip sections with no articles.
- For each article: its headline rewritten in plain English, two or three short bullet points that explain what happened and why it matters, one "Bottom line" sentence, and a link to the article's url.
- Explain any finance term the first time you use it, in a few words.
- Write plainly and calmly: no hype, no exclamation marks, no em dashes, no emoji.
- Never tell the reader to buy, sell or hold anything. Describe what happened and what it could mean.

Output format: HTML using only these tags, with no attributes except href on links. No classes, no inline styles, no divs, no markdown, no code fences. The email applies its own styling.
- <h3> for a section name
- <h4> for an article headline
- <ul> and <li> for the bullet points
- <blockquote><strong>Bottom line:</strong> one sentence.</blockquote>
- <p><a href="ARTICLE_URL">Read the full story</a></p>
- <hr> between articles, but not after the last one

Example of one section with one article:
<h3>Companies on your watchlist</h3>
<h4>Apple's quarterly sales beat forecasts</h4>
<ul>
<li>Apple reported higher iPhone and services sales than analysts expected for the quarter.</li>
<li>Services, which include the App Store and iCloud, grew faster than hardware.</li>
</ul>
<blockquote><strong>Bottom line:</strong> More of Apple's income now comes from subscriptions, which tends to be steadier than device sales.</blockquote>
<p><a href="https://example.com/article">Read the full story</a></p>`;

export const TRADINGVIEW_SYMBOL_MAPPING_PROMPT = `You are an expert in financial markets and trading platforms. Your task is to find the correct TradingView symbol that corresponds to a given Finnhub stock symbol.

Stock information from Finnhub:
Symbol: {{symbol}}
Company: {{company}}
Exchange: {{exchange}}
Currency: {{currency}}
Country: {{country}}

IMPORTANT RULES:
1. TradingView uses specific symbol formats that may differ from Finnhub
2. Always include the exchange prefix: EXCHANGE:SYMBOL
3. Examples: NASDAQ:AAPL (Apple), NYSE:MSFT (Microsoft), LSE:BARC (Barclays)
4. Some symbols may have suffixes for different share classes
5. ADRs and foreign stocks may have different symbol formats

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
  "tradingViewSymbol": "EXCHANGE:SYMBOL",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of why this mapping is correct"
}

EXAMPLES:
- Apple Inc. (AAPL) from Finnhub → {"tradingViewSymbol": "NASDAQ:AAPL", "confidence": "high", "reasoning": "Apple trades on NASDAQ as AAPL"}
- Microsoft Corp (MSFT) from Finnhub → {"tradingViewSymbol": "NASDAQ:MSFT", "confidence": "high", "reasoning": "Microsoft trades on NASDAQ as MSFT"}
- Barclays PLC (BARC.L) from Finnhub → {"tradingViewSymbol": "LSE:BARC", "confidence": "high", "reasoning": "Barclays trades on London Stock Exchange as BARC"}

Your response must be valid JSON only. Do not include any other text.`;
