const puppeteer = require("puppeteer");
const fs = require("fs-extra");

const TARGET = 500;
const OUTPUT = "channelids.json";

// ⏱ 3 DAYS INTERVAL
const THREE_DAYS = 1000 * 60 * 60 * 24 * 3;

async function scrapeVidiq500() {
  console.log("🚀 Starting scrape job...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  const results = new Map();

  console.log("🌐 Opening vidIQ...");
  await page.goto("https://vidiq.com/youtube-stats/top/500/", {
    waitUntil: "networkidle2",
    timeout: 0
  });

  while (results.size < TARGET) {
    const batch = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll("a[data-testid='channel-card-link']")
      )
        .map(card => {
          const href = card.getAttribute("href") || "";
          const idMatch = href.match(/channel\/(UC[\w-]+)/);

          const name =
            card.querySelector("[data-testid='channel-card-title']")
              ?.innerText.trim() || null;

          return idMatch && name
            ? { id: idMatch[1], name }
            : null;
        })
        .filter(Boolean);
    });

    batch.forEach(ch => results.set(ch.id, ch.name));

    console.log(`📦 Loaded: ${results.size}/${TARGET}`);

    if (results.size >= TARGET) break;

    await page.evaluate(() => {
      document
        .querySelector("svg.lucide-chevron-right")
        ?.closest("button")
        ?.click();
    });

    await new Promise(r => setTimeout(r, 1200));
  }

  await browser.close();

  // 🔥 YOUR FORMAT (ID ONLY)
  const output = [...results.entries()]
    .map(([id, name]) => `${id}, `) // keep clean, comments optional
    .join("\n");

  await fs.writeFile(OUTPUT, output);

  console.log("=================================");
  console.log("✅ SCRAPE COMPLETE");
  console.log(`🎯 Channels saved: ${results.size}`);
  console.log("📄 File:", OUTPUT);
  console.log("🕒 Next update in 3 days");
  console.log("=================================");
}

// ▶️ RUN IMMEDIATELY ON START
scrapeVidiq500();

// 🔁 AUTO-UPDATE EVERY 3 DAYS
setInterval(() => {
  scrapeVidiq500().catch(err => {
    console.error("❌ Scrape failed:", err);
  });
}, THREE_DAYS);
