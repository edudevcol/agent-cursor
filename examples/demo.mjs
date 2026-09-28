// Demo: opens the sample form and walks through it with the agent visible.
// Run with: npm run demo  (requires an earlier: npm run build)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { showAgent } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoPageUrl = "file://" + join(__dirname, "demo-page.html");

const browser = await chromium.launch({ headless: false, slowMo: 150 });
const page = await browser.newPage();

await showAgent(page, { name: "Demo Agent" }); // default avatar: businessperson
// Other ways to set the avatar:
// await showAgent(page, { avatar: "detective" });
// await showAgent(page, { avatar: { emoji: "🦊" } });
// await showAgent(page, { avatar: { src: "./my-avatar.png" } });

await page.goto(demoPageUrl);

await page.locator("#name").fill("Ana Perez");
await page.locator("#email").fill("ana@example.com");
await page.locator("#password").fill("secret123");
await page.locator("#country").selectOption("co");
await page.locator("#terms").check();
await page.locator("#submit").click();

await page.waitForTimeout(1500);
await browser.close();
