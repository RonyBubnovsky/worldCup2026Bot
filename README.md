# World Cup 2026 Telegram Alerts

A free Telegram bot that sends you a message about 2 hours and about 1 hour before
each World Cup 2026 match. It runs automatically on GitHub Actions, needs no server,
and uses a free public fixtures feed. Match times are shown in Israel local time.

## Features

- One alert about 2 hours before kickoff and one about 1 hour before, for every match.
- No duplicate messages. Sent alerts are tracked in sent.json.
- Supports one or many recipients.
- Fully free. Uses Telegram, GitHub Actions, and a free fixtures source.

## How it works

GitHub Actions runs the script every 5 minutes. Each run downloads the match
fixtures, checks which matches are about 2 hours or about 1 hour away, and sends a
Telegram message for those that have not been alerted yet. The script then saves
which alerts were sent so nothing is repeated.

## Files

```
check.js                     The script that checks matches and sends alerts
package.json                 Basic project info (no dependencies to install)
sent.json                    Tracks which alerts were already sent
.github/workflows/alert.yml  The schedule that runs the script
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

### 4. Add the secrets
In the repository, go to Settings, then Secrets and variables, then Actions.
Add two secrets:

- TELEGRAM_TOKEN: your bot token from step 1
- CHAT_ID: your numeric ID from step 2

### 5. Run it
Go to the Actions tab, enable workflows if asked, open "World Cup Alerts" and click
"Run workflow" to test. After that it runs every 5 minutes on its own.

## Adding more recipients

Put several IDs in the CHAT_ID secret separated by commas, for example:

```
111111,222222,333333
```

Each person must open the bot and press start first, and send you their ID from
userinfobot. If one person blocks the bot, the others still receive alerts.

## Notes

- The repository should be public so GitHub Actions minutes are free and unlimited.
- No npm install is needed. The script uses the built-in fetch in Node 18 or newer.
- GitHub may delay scheduled runs by a few minutes. The time windows handle this.
- To change the alert timing, edit the ALERTS values in check.js.

## Data source

Match fixtures come from TheStatsAPI, free to use with attribution.
Source: https://www.thestatsapi.com/world-cup/data
