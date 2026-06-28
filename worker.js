// World Cup 2026 Telegram alert bot — Cloudflare Workers edition.
// State stored in Cloudflare KV (not sent.json); secrets come from env, not process.env.
//
// Data source: openfootball/worldcup.json. Unlike a plain fixtures list, this feed
// carries live results and resolves the knockout bracket forward as matches are played
// (e.g. "W73" becomes the real winner's name within hours of that game), so team names
// fill themselves in all the way to the final with no manual upkeep.

const FIXTURES_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// Alert times, in minutes before kickoff.
const ALERTS = [
  { target: 75, label: "about 1 hour and 15 minutes" },
  { target: 60, label: "about 1 hour" },
];

// Convert an openfootball date + local time into an ISO instant.
// time looks like "16:30 UTC-4"; we turn the "UTC-4" offset into an ISO "-04:00"
// suffix so new Date() reads it as the correct UTC moment regardless of host.
// ponytail: assumes the "HH:MM UTC±N" shape the feed uses; returns null if it ever differs.
function kickoffUtc(date, time) {
  const m = (time || "").match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!m) return null;
  const [, hh, mm, off] = m;
  const sign = off[0];
  const hours = String(Math.abs(parseInt(off, 10))).padStart(2, "0");
  return `${date}T${hh.padStart(2, "0")}:${mm}:00${sign}${hours}:00`;
}

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

  // Fetch fixtures; on any failure fall back to the last good copy cached in KV.
  let matches = [];
  let usedFallback = false;
  try {
    const res = await fetch(FIXTURES_URL);
    if (!res.ok) throw new Error(`Fixtures fetch failed: ${res.status}`);
    const data = await res.json();
    matches = Array.isArray(data.matches) ? data.matches : [];
    await env.WORLDCUP_KV.put("fixtures_cache", JSON.stringify(matches));
  } catch (err) {
    console.error("Fixtures fetch failed, trying cache:", err.message);
    const cached = await env.WORLDCUP_KV.get("fixtures_cache");
    if (!cached) throw err; // no cache yet, nothing we can do
    matches = JSON.parse(cached);
    usedFallback = true;
  }

  // Normalize the openfootball shape into the fields the alert loop uses.
  // id keeps the knockout match number (so existing dedup keys still match); group
  // games have no num, so they get a stable synthetic id — harmless, they're all past.
  const fixtures = matches.map((m) => ({
    id: m.num ?? `${m.date}-${m.team1}-${m.team2}`,
    round: m.round,
    homeTeam: m.team1,
    awayTeam: m.team2,
    kickoffUtc: kickoffUtc(m.date, m.time),
  }));

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
      const key = `${f.id}-${alert.target}`;
      if (sent.has(key)) continue;

      if (minutesUntil > alert.lower && minutesUntil <= alert.target) {
        const home = f.homeTeam || "TBD";
        const away = f.awayTeam || "TBD";

        let text = `${f.round}\n${home} vs ${away}\n${formatIsrael(f.kickoffUtc)}`;
        if (usedFallback) {
          text += `\n\nNote: sent from locally stored fixtures, details may be out of date.`;
        }

        await sendMessage(TOKEN, CHAT_IDS, text);
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
