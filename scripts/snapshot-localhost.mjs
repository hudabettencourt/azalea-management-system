import { chromium } from "playwright";
import { writeFileSync } from "fs";

const URL = process.env.SNAPSHOT_URL || "http://localhost:3000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

const title = await page.title();
const url = page.url();

let ariaSnapshot = "";
try {
  ariaSnapshot = await page.locator("body").ariaSnapshot();
} catch {
  ariaSnapshot = "(ariaSnapshot tidak tersedia di versi ini)";
}

const elements = await page.evaluate(() => {
  const sel = "a, button, input, select, textarea, h1, h2, h3, h4, nav, main, header, aside, label, [role], table, th, td";
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const key = `${el.tagName}|${el.getAttribute("role")}|${text}|${el.id}|${el.className}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || undefined,
      text: text || undefined,
      href: el.href || undefined,
      type: el.type || undefined,
      id: el.id || undefined,
      name: el.getAttribute("name") || undefined,
      placeholder: el.getAttribute("placeholder") || undefined,
      ariaLabel: el.getAttribute("aria-label") || undefined,
    });
  }
  return out;
});

const links = elements.filter((e) => e.tag === "a" && e.href);
const buttons = elements.filter((e) => e.tag === "button");
const inputs = elements.filter((e) => ["input", "select", "textarea"].includes(e.tag));
const headings = elements.filter((e) => /^h[1-4]$/.test(e.tag));

const report = {
  url,
  title,
  counts: {
    total: elements.length,
    links: links.length,
    buttons: buttons.length,
    inputs: inputs.length,
    headings: headings.length,
  },
  headings,
  links,
  buttons,
  inputs,
  allElements: elements,
  ariaSnapshot,
};

writeFileSync("scripts/snapshot-localhost-output.json", JSON.stringify(report, null, 2));
await page.screenshot({ path: "scripts/snapshot-localhost.png", fullPage: true });

console.log(JSON.stringify({
  url,
  title,
  counts: report.counts,
  headings,
  links: links.slice(0, 30),
  buttons: buttons.slice(0, 40),
  inputs,
}, null, 2));

await browser.close();
