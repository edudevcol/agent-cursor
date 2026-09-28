import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { showAgent } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoPageUrl = "file://" + join(__dirname, "..", "examples", "demo-page.html");

test.describe("agent-cursor", () => {
  test("installs the overlay and survives a navigation", async ({ page }) => {
    await showAgent(page);
    await page.goto(demoPageUrl);

    const hasOverlayBeforeNav = await page.evaluate(
      () => !!document.querySelector("[data-agent-cursor-host]")
    );
    expect(hasOverlayBeforeNav).toBe(true);

    await page.goto(demoPageUrl); // reload / renavigate
    const hasOverlayAfterNav = await page.evaluate(
      () => !!document.querySelector("[data-agent-cursor-host]")
    );
    expect(hasOverlayAfterNav).toBe(true);
  });

  test("the real click still happens with the agent active", async ({ page }) => {
    await showAgent(page);
    await page.goto(demoPageUrl);

    await page.locator("#name").fill("Carlos Ruiz");
    await page.locator("#country").selectOption("mx");
    await page.locator("#terms").check();

    await expect(page.locator("#name")).toHaveValue("Carlos Ruiz");
    await expect(page.locator("#country")).toHaveValue("mx");
    await expect(page.locator("#terms")).toBeChecked();
  });

  test("with AGENT_VISUALIZER=off the overlay is never injected", async ({ page }) => {
    process.env.AGENT_VISUALIZER = "off";
    try {
      await showAgent(page);
      await page.goto(demoPageUrl);
      const hasOverlay = await page.evaluate(
        () => !!document.querySelector("[data-agent-cursor-host]")
      );
      expect(hasOverlay).toBe(false);
    } finally {
      delete process.env.AGENT_VISUALIZER;
    }
  });

  test("a missing selector fails the same way as without the package", async ({ page }) => {
    await showAgent(page);
    await page.goto(demoPageUrl);

    await expect(
      page.locator("#does-not-exist").click({ timeout: 1000 })
    ).rejects.toThrow();
  });

  for (const avatar of ["businessperson", "robot", "tester", "detective", "ninja", "ghost", "cat", "alien"] as const) {
    test(`bundled avatar "${avatar}" loads its image`, async ({ page }) => {
      await showAgent(page, { avatar });
      await page.goto(demoPageUrl);
      const loaded = await page.evaluate(async () => {
        const host = document.querySelector("[data-agent-cursor-host]");
        const img = host?.shadowRoot?.querySelector(".agent-face img") as HTMLImageElement | null;
        if (!img) return false;
        await img.decode().catch(() => {});
        return img.complete && img.naturalWidth > 0;
      });
      expect(loaded).toBe(true);
    });
  }

  test("a missing custom avatar file falls back to the default avatar", async ({ page }) => {
    await showAgent(page, { avatar: { src: "./does-not-exist.png" } });
    await page.goto(demoPageUrl);
    const alt = await page.evaluate(() => {
      const host = document.querySelector("[data-agent-cursor-host]");
      return host?.shadowRoot?.querySelector(".agent-face img")?.getAttribute("alt");
    });
    expect(alt).toBe("businessperson avatar");
  });

  test("a page without showAgent is unaffected", async ({ page }) => {
    await page.goto(demoPageUrl);
    await page.locator("#name").fill("No agent");
    await expect(page.locator("#name")).toHaveValue("No agent");

    const hasOverlay = await page.evaluate(
      () => !!document.querySelector("[data-agent-cursor-host]")
    );
    expect(hasOverlay).toBe(false);
  });
});
