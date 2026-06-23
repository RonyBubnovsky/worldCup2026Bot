# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file Cloudflare Worker (`worker.js`) that sends Telegram alerts before World Cup 2026 matches. No build step, no dependencies, no `package.json` — it runs on the Workers runtime's built-in `fetch`.

## Commands

- `wrangler deploy` — deploy the worker (also runs automatically on push to `main`, see `.github/workflows/deploy.yml`).
- `wrangler dev` — run locally. Note: the cron `scheduled` handler does not fire on a real schedule in dev; trigger it manually with `wrangler dev` then `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`, or test via `wrangler dev --test-scheduled`.
- `wrangler secret put TELEGRAM_TOKEN` / `wrangler secret put CHAT_ID` — set secrets (not in `wrangler.toml`).
- `wrangler kv key get sent --binding WORLDCUP_KV` — inspect dedup state.

There are no tests or linters configured.

## Architecture

Everything lives in `main(env)` in `worker.js`, invoked from the `scheduled` cron handler (every 5 minutes per `wrangler.toml`). The `fetch` handler only returns `200 OK` for health checks.

Each run:
1. Fetches fixtures JSON from `FIXTURES_URL` (TheStatsAPI). On success, caches it to the `fixtures_cache` KV key. On any fetch failure, falls back to that cached copy and appends a "may be out of date" note to each message; if no cache exists yet, it re-throws (no empty run).
2. Reads the `sent` key from KV (binding `WORLDCUP_KV`) — a JSON array of already-alerted keys.
3. For each fixture, computes minutes until kickoff and checks it against alert **windows**.
4. Sends Telegram messages for newly-matched windows and writes the updated `sent` set back to KV.

Two KV keys: `sent` (dedup state) and `fixtures_cache` (last-known-good fixtures for the offline fallback).

Key things to understand before editing:

- **Alert windows, not exact times.** `ALERTS` defines target minutes-before-kickoff. At runtime they're sorted descending and each gets a `lower` bound (the next target down, or 0), forming non-overlapping ranges. A fixture fires an alert when `lower < minutesUntil <= target`. This is why a 5-minute cron never double-fires or misses: each window is wider than the cron interval. Editing `ALERTS` is safe — windows are recomputed automatically.
- **Dedup key is `${matchNumber}-${target}`.** State persistence is KV, not a file. Changing the key format orphans existing KV state (everything re-alerts once).
- **`CHAT_ID` is comma-separated.** Multiple recipients; a failed send to one is logged and skipped, others still receive.
- **Times display in `Asia/Jerusalem`** via `Intl.DateTimeFormat`, regardless of where the worker runs.

The header comment references a `check.js` (a prior Node/`sent.json` version); that file is not in this repo — `worker.js` is the KV-backed port of it.

## Config IDs

`wrangler.toml` and the deploy workflow contain a hardcoded Cloudflare `account_id` and KV namespace `id`. These are environment-specific; preserve them unless intentionally retargeting.
