# Stock market overview

Status: proposal only. No application code or database changes are included.
Provider documentation reviewed November 24, 2026; prices, coverage and terms must
be checked again before implementation. No authenticated provider API was tested.

## Is it possible and worthwhile?

Yes. A separate **Markets** page could answer “How are markets doing today?” in a
few seconds without turning the dashboard into a trading platform. It would be
particularly useful for following Canadian and US markets alongside the existing
personal finance module.

My recommendation is a modest first version: major indexes, five notable gainers
and five losers, and one or two market news headlines. Avoid an enormous ticker
wall, trading recommendations or a portfolio system. Keep market information
separate from recorded personal income, expenses and account balances.

A free version is plausible, particularly using embedded widgets or end-of-day
data. A completely custom interface with live Canadian and US indexes and broad
market movers cannot be promised for free. Data coverage and display rights are
more important constraints than hosting or implementation complexity.

## What the page would show

### Major indexes

Start with the S&P/TSX Composite, S&P 500, Nasdaq Composite and Dow Jones Industrial
Average. Optionally add Nikkei 225 and a European index later. Each card would show:

- Full index name and current or latest available level, expressed in points.
- Signed change and percentage change against the previous trading close.
- Market date, source and whether the value is live, delayed or end-of-day.

Coverage is subject to the selected provider. Do not label an ETF, futures contract
or CFD as the underlying cash index. If an index is unavailable, show that clearly;
offer a separately labelled proxy only if deliberately selected. Nasdaq Composite
and Nasdaq-100 are also different indexes.

### Stocks with large changes

Use separate Gainers and Losers sections showing company, ticker, exchange,
percentage change, price/currency, volume if available, and timestamp. Include
signed numbers and arrows so meaning does not depend on red and green alone.

Define the universe: for example, “US market movers” or “Canadian watchlist
movers.” A list calculated from 20 followed companies must not be called the
biggest movers across the whole market. Prefer ordinary shares and meaningful
trading volume where supported, so tiny illiquid stocks do not dominate the view.
Keep regular-session and extended-hours changes distinct. Unadjusted price jumps
can reflect stock splits rather than genuine gains, so use provider-corrected
data where available.

### One or two daily news items

Show a headline, publisher, publication time, and an Open article button. A short
publisher-provided excerpt is optional when permitted. Link to the original;
do not copy full articles or bypass subscriptions. Some linked articles may be
paywalled even when their headlines are accessible.

Prefer a broad market recap and a separate economy/company story. Select from a
bounded market-news feed using freshness and topic rules; deduplicate URLs and
near-identical headlines. Do not claim these are objectively the day's two most
important stories or that a particular story caused a price move.

If no suitable articles were published today, show recent articles with their
actual dates or an empty state. Never manufacture a daily headline. No AI is
needed: an API/feed and deterministic selection are enough.

## Data sources and cost

### Option A: free embedded market widgets

[TradingView's official widgets](https://www.tradingview.com/widget/) are free
with its branding. Its catalog includes market overviews and stock movers.
The [Market Overview documentation](https://www.tradingview.com/widget-docs/widgets/watchlists/market-overview)
provides integration examples, and its
[widget updates](https://my.tradingview.com/widget-docs/whats-new/) describe a news
feed option.

This is the easiest route to an initial free page. The tradeoffs are provider
branding, external scripts, limited control over layout/headline count, and
symbol-dependent availability or delays. A paid personal TradingView subscription
does not automatically upgrade website-widget data. Widgets do not provide an API
we can extract data from to build our own cards. Test the exact Canadian/US symbols,
phone layout and PWA behavior before committing to this approach.

### Option B: custom cards with market-data APIs

| Candidate | Verified offering | Implication |
| --- | --- | --- |
| [Alpha Vantage](https://www.alphavantage.co/support/) | Standard free allowance is 25 requests/day | Suitable for a small daily snapshot, rather than frequent per-symbol refreshes |
| [Alpha Vantage movers](https://www.alphavantage.co/documentation/#gainer-loser) | US gainers/losers default to end-of-day updates; live/delayed access requires premium | A potential free daily movers source, subject to actual account access |
| [Twelve Data](https://twelvedata.com/pricing) | Basic lists 8 credits/minute and 800/day; market movers are on Pro; Basic is labelled internal non-display use | Free request allowance alone does not establish permission for our visible dashboard |

Twelve Data lists paid Grow plans starting at USD 29/month with monthly billing,
but that does not mean the cheapest plan includes every requested index or movers.
Endpoint weights, exact symbols and display entitlement must be checked. Do not
start a subscription or assume paid access is necessary before testing options.

An API approach would blend better with the existing design and permit exactly
two headlines. However, broad index coverage, especially Canada, must be verified
individually. Never substitute undocumented scraping of a financial website as
the production data source.

### Where the news could come from

- **TradingView news widget:** lowest integration effort if its available layout
  and attribution suit the page; it may not support exactly two chosen items.
- **Finnhub market-news API:** a candidate for custom headline cards. Its
  [official endpoint](https://finnhub.io/docs/api/market-news) and
  [pricing](https://finnhub.io/pricing) need account-level verification. Those pages
  did not expose readable details during this review, so free news access and
  quotas are not confirmed here.
- **Publisher RSS:** CNBC's [RSS directory](https://www.cnbc.com/rss-feeds/) is a
  candidate for market headlines. Automated access to that directory was blocked
  during this review; verify a functioning official feed and reuse terms before
  selecting it. An RSS URL's existence alone does not establish unrestricted reuse.

For a custom first version, test one permitted news source rather than integrating
several. Show source attribution and the original link. Alpha Vantage also lists
news/sentiment functionality, but do not assume it has the same free availability
as end-of-day movers.

## Recommended implementation in this repository

Create a protected `/markets` page with a Markets sidebar entry, separate from
the finance tabs. Reuse the existing Tailwind styles, Heroicons, owner-only page
and API guards, and dashboard timezone. Recharts is already installed if licensed
historical data later makes a small trend chart useful.

No additional container or brokerage connection is needed. Widgets run in the
page; custom integrations run through server-only Next.js services. API keys belong
in server environment variables, never client code or `NEXT_PUBLIC_` variables.
Do not send private financial records to a market-data provider.

For an API implementation, normalize provider responses into index quotes, stock
movers and news items. Keep instrument identifiers, exchange/session, currency,
market timestamp, retrieval timestamp, source and freshness information explicit.
Daily changes must refer to the exchange's trading session, not reset at midnight
in the dashboard's timezone.

Use a shared server cache and reuse it across devices. Refresh according to source
freshness and quota, not on every render. A daily source needs roughly daily
refreshing; intraday polling is only useful when the selected entitlement supports
it. For illustration, four one-credit symbols refreshed every 15 minutes over a
6.5-hour session consume about 104 credits, before other requests. This would
already exceed a 25-request daily allowance if each symbol requires its own call.

Start with a bounded cache; add a small persistent cache table only if needed for
last-known values across restarts or a hard daily quota. Do not build a historical
market-data warehouse. Any retention must follow provider terms. Coalesce concurrent
refreshes, respect 429/retry delays, and keep manual refresh within the same budget.

On failure, retain a labelled last-known snapshot when available and show an error
for the affected section. Never replace missing prices with zero or label cached
values as live. Show exchange-closed states on weekends and holidays. Offline PWA
data, if offered, must likewise be marked stale.

Render external headlines as plain text, validate article links, and restrict
server fetches to configured provider hosts. Do not accept arbitrary feed URLs.
If using widgets, mount and clean them up in their own component so external DOM
changes do not interfere with React navigation. Keep attribution intact and review
any required content-security-policy changes narrowly.

## Visual arrangement

On desktop, use four compact index tiles at the top, a wider movers panel and a
smaller two-story news panel below. On phones, use a two-column index grid followed
by concise movers and news cards, without horizontal page scrolling. Show freshness
and market coverage where the user can see them, not buried in settings.

## Suggested delivery order

1. Verify exact index symbols, Canadian/US coverage, attribution, display rights,
   endpoint access and cost using the intended personal account. This is the main
   decision gate, not a completed verification in this proposal.
2. Build a free widget prototype first, or choose a custom daily-snapshot approach
   if its source permissions are confirmed and visual consistency matters more.
3. Add the news source and deterministic one/two-story selection where supported.
4. Verify mobile/PWA layout, navigation cleanup, stale/closed-market states, quota
   exhaustion, provider failure, duplicate headlines and missing symbols.

My preference is to start free, accept clearly labelled delays or daily data, and
only consider paying after using the page reveals a specific coverage or freshness
gap. Do not add trading, holdings, AI summaries, push alerts or forecasting as part
of this initial idea.
