# Case study — Cesta

*[Leia em português](case-study.pt-BR.md)*

**Role:** product, UX and engineering, end to end · **Period:** Oct 2026 – today, 14 releases · **Users:** the person who
does the family's shopping, every month (two phones in sync)

## The problem

The family researched grocery prices in five stores every month in an Excel spreadsheet: one tab per month, three columns
per store (price, total, brand), formulas for the cheapest store and the month's total. It worked at a desk and nowhere
else — not in the store aisle, not on the phone, not with two people splitting the list. The receipt was never checked
against the plan, and price history lived in old tabs nobody reopened.

## Goals

- Research and shop on the phone, offline, one-handed.
- Keep every number the spreadsheet had — to the cent — and its format, so nothing is lost in the move.
- Turn the receipt into information: what was charged above the shelf price or the plan.
- No running cost, no accounts, no dependency to maintain.

## Key decisions

| Decision | Why | Trade-off |
|---|---|---|
| **Local-first records `{k, u, v}` with optional sync** | Works in any store without signal; sync is a convenience, not a requirement | Last-write-wins per key and tombstones; changing key formats needs a migration |
| **Read and write the original `.xlsx`** | The family keeps the spreadsheet as a backup and a bridge | A hand-written ZIP/XML layer instead of a library, guarded by tests against the real file |
| **Read the receipt from text the user copies** | The tax authority's page blocks automated access; scraping would be fragile and impolite | One extra step for the user (copy the page) — or a photo pasted into Claude with a ready prompt |
| **Rules and memory instead of an AI API** | Category suggestions and receipt linking must be instant, offline and free | Rules are conservative: when in doubt (a tie), the app asks |
| **Durable Object for sync** | One small SQLite per family on the free plan, strong consistency, no database to manage | A Worker build can't upload Durable Object migrations from branches → only `main` deploys |

## What came out

- The month's research happens in the aisle, with the cheapest store and the route always visible.
- Receipts are audited in a minute; the store's codes are learned so the next one links by itself.
- The month's total matches the old spreadsheet, and the spreadsheet can still be exported at any time.
- A household bridge: Cesta pulls the shopping list of the family's diet from the nutrition app (Mesa) and sends back the
  price per gram, so the diet's weekly cost shows up there.

## What I would do next

Price history across families (opt-in, anonymous) for a neighbourhood index, and a white-label build for purchasing co-ops.
