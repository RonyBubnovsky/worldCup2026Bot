// World Cup 2026 Telegram alert bot.
// Runs on a schedule (GitHub Actions). Sends one alert ~2 hours and one ~1 hour
// before each match. Uses a small state file (sent.json) so nothing is sent twice.

const fs = require("fs");

const TOKEN = process.env.TELEGRAM_TOKEN;
// CHAT_ID can be one ID or several separated by commas, e.g. "111,222,333".
const CHAT_IDS = (process.env.CHAT_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

// Free fixtures data (no API key). License: free with attribution to TheStatsAPI.
const FIXTURES_URL = "https://www.thestatsapi.com/world-cup/data/fixtures.json";
const STATE_FILE = "sent.json";

// Alert windows, in minutes before kickoff.
// 2h alert fires while kickoff is between 60 and 120 minutes away.
// 1h alert fires while kickoff is between 0 and 60 minutes away.
const ALERTS = [
  { target: 120, label: "about 2 hours" },
  { target: 60, label: "about 1 hour" },
];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveState(arr) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(arr, null, 2));
}

// Format a UTC kickoff string as Israel local time (handles summer time automatically).
function formatIsrael(iso) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${time} Israel time, ${date}`;
}

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  for (const chatId of CHAT_IDS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Telegram error for ${chatId}: ${res.status} ${body}`);
      }
    } catch (err) {
      console.error(`Failed sending to ${chatId}:`, err.message);
    }
  }
}

async function main() {
  if (!TOKEN || CHAT_IDS.length === 0) {
    console.error("Missing TELEGRAM_TOKEN or CHAT_ID environment variables.");
    process.exit(1);
  }

  const res = await fetch(FIXTURES_URL);
  if (!res.ok) throw new Error(`Fixtures fetch failed: ${res.status}`);
  const data = await res.json();
  const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];

  const sent = new Set(loadState());
  const now = Date.now();
  let changed = false;

  for (const f of fixtures) {
    if (!f.kickoffUtc) continue;
    const kickoff = new Date(f.kickoffUtc).getTime();
    if (Number.isNaN(kickoff)) continue;

    const minutesUntil = (kickoff - now) / 60000;

    for (const alert of ALERTS) {
      const key = `${f.matchNumber}-${alert.target}`;
      if (sent.has(key)) continue;

      const upper = alert.target; // e.g. 120
      const lower = alert.target - 60; // e.g. 60  -> window is (lower, upper]
      if (minutesUntil > lower && minutesUntil <= upper) {
        const home = f.homeTeam || "TBD";
        const away = f.awayTeam || "TBD";
        const stage = f.group ? `Group ${f.group}` : f.stage || "";
        const where = [f.stadium, f.hostCity].filter(Boolean).join(", ");

        const lines = [
          "World Cup 2026",
          `Starting in ${alert.label}.`,
          "",
          `${home} vs ${away}`,
        ];
        if (stage) lines.push(stage);
        lines.push(`Kickoff: ${formatIsrael(f.kickoffUtc)}`);
        if (where) lines.push(where);

        await sendMessage(lines.join("\n"));
        sent.add(key);
        changed = true;
        console.log(`Sent ${key}: ${home} vs ${away}`);
      }
    }
  }

  if (changed) {
    saveState([...sent]);
    console.log("State updated.");
  } else {
    console.log("No alerts to send this run.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
