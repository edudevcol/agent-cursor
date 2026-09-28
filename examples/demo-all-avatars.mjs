// Demo: cycles through EVERY bundled avatar, one at a time, with the window visible.
// Run with: node examples/demo-all-avatars.mjs  (requires an earlier: npm run build)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { showAgent } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoPageUrl = "file://" + join(__dirname, "demo-page.html");

const AVATARS = ["businessperson", "robot", "tester", "detective", "ninja", "ghost", "cat", "alien"];

const browser = await chromium.launch({ headless: false, slowMo: 120 });

for (const avatar of AVATARS) {
  console.log(`\n=== Avatar: ${avatar} ===`);
  const page = await browser.newPage();
  await showAgent(page, { avatar }); // each avatar brings its own ring color

  await page.goto(demoPageUrl);
  await page.locator("#name").fill("Ana Perez");
  await page.locator("#email").fill("ana@example.com");
  await page.locator("#country").selectOption("co");
  await page.locator("#terms").check();
  await page.locator("#submit").click();

  await page.waitForTimeout(1200); // time to look at it before moving to the next one
  await page.close();
}

await browser.close();
console.log(`\nDone, all ${AVATARS.length} avatars were shown.`);
