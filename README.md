# World Cup 2026 Telegram Alerts

A free Telegram bot that sends you a message about 2 hours, about 1 hour and 15
minutes, and about 1 hour before each World Cup 2026 match. It runs automatically on
Cloudflare Workers, needs no server, and uses a free public fixtures feed. Match times
are shown in Israel local time.

## Features

- Three alerts per match: about 2 hours, about 1 hour and 15 minutes, and about
  1 hour before kickoff.
- No duplicate messages. Sent alerts are tracked in Cloudflare KV.
- Supports one or many recipients.
- Fully free. Uses Telegram, Cloudflare Workers, and a free fixtures source.

## How it works

Cloudflare Workers runs the script every 5 minutes on a precise cron schedule.
Each run downloads the match fixtures, checks which matches are near one of the
alert times, and sends a Telegram message for those that have not been alerted yet.
The script then saves which alerts were sent to Cloudflare KV so nothing is repeated.

## Files

```
worker.js       The script that checks matches and sends alerts
wrangler.toml   Cloudflare Workers config (cron schedule, KV binding)
```

## Setup

### 1. Create the bot

In Telegram, open BotFather, send /newbot, follow the steps, and copy the bot token.

### 2. Get your chat ID

In Telegram, open userinfobot and press start. It replies with your numeric ID.
Save that number.

### 3. Start the bot

Open your new bot in Telegram and send it any message. A bot cannot message a user
who has not started it first.

### 4. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 5. Create the KV namespace

```bash
wrangler kv namespace create WORLDCUP_KV
```

Copy the `id` from the output and paste it into `wrangler.toml`.

### 6. Add secrets

```bash
wrangler secret put TELEGRAM_TOKEN
wrangler secret put CHAT_ID
```

### 7. Deploy

```bash
wrangler deploy
```

The worker is now live and runs every 5 minutes automatically.

Subsequent pushes to `main` are deployed automatically via GitHub Actions.
The workflow only needs a `CLOUDFLARE_API_TOKEN` repository secret.

## Adding more recipients

Put several IDs in the CHAT_ID secret separated by commas, for example:

```
111111,222222,333333
```

Each person must open the bot and press start first, and send you their ID from
userinfobot. If one person blocks the bot, the others still receive alerts.

## Notes

- No npm install is needed. The worker uses the built-in fetch in the Workers runtime.
- To change the alert times, edit the ALERTS list in worker.js. You can add, remove,
  or change entries freely, and the alerts will not overlap.
- After editing worker.js, redeploy with `wrangler deploy`.

## Data source

Match fixtures come from TheStatsAPI, free to use with attribution.
Source: https://www.thestatsapi.com/world-cup/data
