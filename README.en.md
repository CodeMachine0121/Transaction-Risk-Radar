# Trader Risk Radar

> A **risk-oriented analysis and ranking REST API** for on-chain perpetual-futures traders on Hyperliquid (and OKX).

**中文版 → [README.md](./README.md)**

`riskScore` measures **how dangerous a trader is to copy** — not how profitable they are. The system is built to surface **high-win-rate-but-deep-drawdown / averaging-down (martingale) traps**: traders who look great on leaderboards, but whom small-capital retail copiers can't follow into deeper add-ons — so they "die on the path the trader takes to profit."

Scope of v1: pure REST, scheduled polling (not streaming), **no trading, no order placement, no private keys.**

---

## Core Idea

Copy-trading platforms show returns and hide risk. This system inverts that — a higher score means **more dangerous to copy**:

- **MAE (Maximum Adverse Excursion)** — how deep a position quietly drew down before reverting.
- **averagingDownRatio** — share of positions where the trader added at adverse prices to drag the average (martingale behavior).
- **trapSignal** — `winRate × normalize(MAE)`; catches "looks-stable-but-holds-deep" traders.
- **returnDownsideDeviation** — how stable the losses are, i.e. risk of a sudden blow-up.

`riskScore` (0–100, higher = more dangerous) is a weighted composite of the above. Full formula in PRD §4.

---

## Tech Stack

| Layer | Choice |
| :--- | :--- |
| Language / Runtime | TypeScript · Node.js (package mgmt & run via **Bun**) |
| Web framework | Fastify |
| ORM / Database | Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL + TimescaleDB |
| Cache / Queue | Redis · BullMQ (background scheduling) |
| Numerics | `bigint` + `decimal.js` (**no JS float**) |
| Testing / Quality | Vitest · ESLint · Prettier · Husky (pre-commit lint + typecheck) |
| Deployment | Single VPS + Docker Compose |
| Data sources | Hyperliquid official REST API · OKX copytrading public API |

---

## Architecture (Clean / Onion)

Dependencies always point toward the **Domain (core)**; the Domain depends on nothing.

```
Controller ───▶ Application ───▶ Domain ◀─── Infrastructure
(HTTP/Fastify)   (use cases)     (core)     (Repository/Client/Proxy impls)
```

- **`src/domain/`** — rich entities (`entity/`), value objects (`vo/`), return DTOs (`dto/`), Domain Services (`service/`), and outbound interfaces (`interface/`, one per file). Computation lives on entity methods.
- **`src/application/`** — use-case orchestration; calls domain services, returns DTOs.
- **`src/controller/`** — Fastify routes + HTTP translation.
- **`src/infrastructure/`** — `persistence/` (Prisma repositories), `hyperliquid/` & `okx/` (proxies + wire types), `scheduler/` (BullMQ).
- Concrete implementations are wired in the composition roots `src/main.ts` (API) and `src/worker.ts` (background jobs).

See [`CLAUDE.md`](./CLAUDE.md) and the authoritative docs under `.sdd/` for full conventions.

---

## Quick Start

### Option 1: Full Docker (recommended, one command)

```bash
bun run compose:up            # Postgres + Redis + migrate + api + worker
curl localhost:3000/health    # → {"status":"ok"}
bun run compose:logs          # follow logs
bun run compose:down          # stop (add -v to drop volumes too)
```

### Option 2: Local dev (app on host, watch mode)

```bash
docker compose up -d postgres redis   # external deps only
cp .env.example .env                   # configure environment
bun install                            # postinstall runs prisma generate
bunx prisma migrate deploy             # apply migrations
bun run worker                         # background sync / poll / recompute
bun run dev                            # REST API (watch)
```

> Optional: convert `position_snapshots` into a TimescaleDB hypertable:
> `SELECT create_hypertable('position_snapshots', 'captured_at', migrate_data => true);`

---

## REST API Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check, returns `{"status":"ok"}` |
| `GET` | `/rankings` | Risk-oriented ranking (sorted by `riskScore`, safest first by default) |
| `GET` | `/traders` | List of tracked traders |
| `GET` | `/traders/:address` | Full risk metrics for one trader; 404 if not found |
| `GET` | `/consensus` | Position consensus of the safe cohort (low-risk traders) |
| `GET` | `/consensus/:coin` | Consensus for a given coin; 404 if none qualifies |
| `GET` | `/signals` | Entry signals derived from safe-cohort consensus (experimental, **not order instructions**) |

**Common query parameters**

- `/rankings`: `provider`, `direction` (`ascending` / `descending`), `offset`, `limit`
- `/consensus`, `/signals`: `provider`, `weighting` (`equal` / `conviction`), `maxRiskScore` (0–100), `minParticipants` (≥1), `offset`, `limit`

> Traders with too few closed positions are flagged `insufficientData` and given no `riskScore`.
> A Postman collection is available under [`postman/`](./postman/).

---

## Background Worker

`bun run worker` starts the BullMQ scheduler, which **runs one round immediately on startup**, then on each configured interval:

```
synchronizeLeaderboard → pollTrader → recomputeTraderMetrics → snapshotConsensus
   (sync leaderboard)    (tiered poll)   (recompute riskScore)    (persist consensus series)
```

Metrics use **closed positions from the last 90 days only**, deduplicated by fill id. Both Hyperliquid and OKX providers run, with per-IP weight rate limiting and 429 backoff (see `.env.example`).

---

## Common Commands

| Command | Description |
| :--- | :--- |
| `bun run dev` / `bun run start` | Dev (watch) / start API |
| `bun run worker` / `bun run worker:dev` | Background scheduler |
| `bun run test` / `bun run test:watch` | Vitest unit tests |
| `bun run lint` / `bun run lint:fix` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run format` / `bun run format:check` | Prettier |
| `bun run db:generate` / `bun run db:migrate` | Prisma generate / migrate |

---

## Engineering Conventions (highlights)

- **Always full names, no abbreviations** (`maxAdverseExcursionPercentile90`, never `mae`).
- **No `any` / `unknown`**; no JS float for monetary / on-chain values.
- Fixed role suffixes per layer: `Service` (domain), `Application`, `Controller`, `Repository` / `Client` / `Proxy` (infra).
- Entities are `class` (rich, with behavior); DTOs / Requests / behaviorless VOs are `type`.
- Interfaces centralized in `src/domain/interface/`, `I`-prefixed, one per file.
- All data access goes through the ORM (code-first); no hand-written SQL.

See [`CLAUDE.md`](./CLAUDE.md) for the full ruleset and testing strategy.

---

## Documentation

This project follows **Spec-Driven Development (SDD)**. Read these before starting work:

- `.sdd/2026-06-19-trader-risk-radar/PRD.md` — requirements and the **metric formulas (§4)**, the single source of truth.
- `.sdd/UL-MAP.md` — ubiquitous language map (naming authority).
- `.sdd/2026-06-19-trader-risk-radar/BRIEF.md` — requirements consensus.
- `DISCUSSION.md` — full background and root-cause analysis.
