const axios = require("axios");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = 5000;

app.use(cors({ origin: "*", methods: ["GET"] }));

// ================================
// CHANNEL IDS (RAW, BULLETPROOF)
// ================================
function loadChannelIDs() {
  try {
    const raw = fs.readFileSync("channelids.json", "utf8");

    // 🔥 Extract ANY UCxxxxxxxx anywhere in the file
    const matches = raw.match(/UC[a-zA-Z0-9_-]{20,}/g);

    if (!matches) return [];

    // remove duplicates
    return [...new Set(matches)];
  } catch (err) {
    console.error("❌ Failed to load channelids.json", err);
    return [];
  }
}

const channelIDs = loadChannelIDs();
console.log(`📥 Loaded ${channelIDs.length} channel IDs`);

// ================================
// JSON HELPERS
// ================================
function loadJSON(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================================
// MIXERNO → SUB COUNT
// ================================
async function getChannelInfo(channelID) {
  try {
    const res = await axios.get(
      `https://mixerno.space/api/youtube-channel-counter/user/${channelID}`,
      { timeout: 10000 }
    );

    const data = res.data;

    return {
      id: channelID,
      name: data.user.find(i => i.value === "name")?.count || "Unknown",
      subscribers: Number(
        data.counts.find(i => i.value === "subscribers")?.count || 0
      ),
      pfp: data.user.find(i => i.value === "pfp")?.count || "",
      goal: data.counts.find(i => i.value === "goal")?.count || null
    };
  } catch {
    return null;
  }
}

// ================================
// ESTS → GAINS
// ================================
async function getESTSGains(channelID) {
  try {
    const res = await axios.get(
      `https://ests.sctools.org/api/get/${channelID}`,
      { timeout: 10000 }
    );

    return {
      hourly: res.data?.averages?.hourly ?? null,
      daily: res.data?.averages?.daily ?? null
    };
  } catch {
    return { hourly: null, daily: null };
  }
}

// ================================
// UPDATE LOOP
// ================================
let isUpdating = false;

async function updateData() {
  if (isUpdating) return;
  isUpdating = true;

  const results = [];
  let totalSubscribers = 0;

  // fetch ESTS
  const estsMap = {};
  await Promise.all(
    channelIDs.map(async id => {
      estsMap[id] = await getESTSGains(id);
    })
  );

  // fetch Mixerno
  const infos = await Promise.all(
    channelIDs.map(id => getChannelInfo(id))
  );

  for (const info of infos) {
    if (!info) continue;

    totalSubscribers += info.subscribers;
    const gains = estsMap[info.id] || {};

    results.push({
      channel_id: info.id,
      name: info.name,
      subscribers: info.subscribers,
      subs_gained_24hrs: gains.hourly,
      subs_gained_per_1day: gains.daily,
      goal: info.goal,
      pfp: info.pfp,
      verified: true,
      last_update: new Date().toISOString()
    });
  }

  results.sort((a, b) => b.subscribers - a.subscribers);
  results.forEach((c, i) => (c.rank = i + 1));

  saveJSON("top50.json", results);
  saveJSON("stats.json", {
    tracked: results.length,
    totalSubscribers,
    last_update: new Date().toISOString()
  });

  console.log(
    `✅ Updated ${results.length} channels | Total subs: ${totalSubscribers.toLocaleString()}`
  );

  isUpdating = false;
}

// ================================
// ROUTES
// ================================
app.get("/", (req, res) =>
  res.send("🚀 StatsBright API running")
);

app.get("/top50", (req, res) =>
  res.json(loadJSON("top50.json", []))
);

app.get("/stats", (req, res) =>
  res.json(loadJSON("stats.json", {}))
);

// ================================
// START
// ================================
app.listen(PORT, () => {
  console.log(`🌐 Server running → http://localhost:${PORT}`);
  updateData();
  setInterval(updateData, UPDATE_INTERVAL);
});
