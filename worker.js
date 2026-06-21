// World Cup 2026 Telegram alert bot — Cloudflare Workers edition.
// Same logic as check.js, with two adaptations:
//   1. State stored in Cloudflare KV instead of sent.json
//   2. Secrets come from env object, not process.env

const FIXTURES_URL = "https://www.thestatsapi.com/world-cup/data/fixtures.json";

// Alert times, in minutes before kickoff.
const ALERTS = [
  { target: 120, label: "about 2 hours" },
  { target: 75,  label: "about 1 hour and 15 minutes" },
  { target: 60,  label: "about 1 hour" },
];

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

async function sendMessage(token, chatIds, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  for (const chatId of chatIds) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
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

async function main(env) {
  const TOKEN = env.TELEGRAM_TOKEN;
  const CHAT_IDS = (env.CHAT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!TOKEN || CHAT_IDS.length === 0) {
    console.error("Missing TELEGRAM_TOKEN or CHAT_ID");
    return;
  }

  const res = await fetch(FIXTURES_URL);
  if (!res.ok) throw new Error(`Fixtures fetch failed: ${res.status}`);
  const data = await res.json();
  const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];

  // Load state from KV (replaces fs.readFileSync on sent.json)
  const sentRaw = await env.WORLDCUP_KV.get("sent");
  const sent = new Set(sentRaw ? JSON.parse(sentRaw) : []);
  let changed = false;

  const now = Date.now();

  // Build non-overlapping windows, same logic as check.js
  const windows = [...ALERTS]
    .sort((a, b) => b.target - a.target)
    .map((alert, i, arr) => ({
      ...alert,
      lower: i < arr.length - 1 ? arr[i + 1].target : 0,
    }));

  for (const f of fixtures) {
    if (!f.kickoffUtc) continue;
    const kickoff = new Date(f.kickoffUtc).getTime();
    if (Number.isNaN(kickoff)) continue;

    const minutesUntil = (kickoff - now) / 60000;

    for (const alert of windows) {
      const key = `${f.matchNumber}-${alert.target}`;
      if (sent.has(key)) continue;

      if (minutesUntil > alert.lower && minutesUntil <= alert.target) {
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

        await sendMessage(TOKEN, CHAT_IDS, lines.join("\n"));
        sent.add(key);
        changed = true;
        console.log(`Sent ${key}: ${home} vs ${away}`);
      }
    }
  }

  if (changed) {
    // Save state to KV (replaces fs.writeFileSync + git commit/push)
    await env.WORLDCUP_KV.put("sent", JSON.stringify([...sent]));
    console.log("State updated.");
  } else {
    console.log("No alerts to send this run.");
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(main(env));
  },
  async fetch(request, env, ctx) {
    return new Response("OK", { status: 200 });
  },
};
