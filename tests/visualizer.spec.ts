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

  test("inside an iframe the avatar is drawn in that frame", async ({ page }) => {
    await showAgent(page);
    await page.setContent(`<iframe srcdoc="<input id='x'>" style="width:400px;height:200px"></iframe>`);
    const frame = page.frameLocator("iframe");
    await frame.locator("#x").fill("hola");
    await expect(frame.locator("#x")).toHaveValue("hola");

    const avatarVisible = await page.frames()[1].evaluate(() => {
      const host = document.querySelector("[data-agent-cursor-host]");
      return !!host?.shadowRoot?.querySelector(".agent-avatar.agent-visible");
    });
    expect(avatarVisible).toBe(true);
  });

  test("in a frameset the avatar moves to the frame of each element", async ({ page }) => {
    await page.route("http://agent.test/**", (route) => {
      const url = route.request().url();
      const body = url.endsWith("/")
        ? `<frameset cols="50%,50%"><frame name="menu" src="/menu"><frame name="main" src="/main"></frameset>`
        : url.endsWith("/menu")
          ? `<body><a id="go" href="#">Go</a></body>`
          : `<body><input id="x"></body>`;
      return route.fulfill({ contentType: "text/html", body });
    });
    await showAgent(page);
    await page.goto("http://agent.test/");

    const avatarVisibleIn = (name: string) =>
      page.frame(name)!.evaluate(() => {
        const host = document.querySelector("[data-agent-cursor-host]");
        return !!host?.shadowRoot?.querySelector(".agent-avatar.agent-visible");
      });

    await page.frame("menu")!.locator("#go").click();
    expect(await avatarVisibleIn("menu")).toBe(true);

    await page.frame("main")!.locator("#x").fill("hola");
    await expect(page.frame("main")!.locator("#x")).toHaveValue("hola");
    expect(await avatarVisibleIn("main")).toBe(true);
    await expect.poll(() => avatarVisibleIn("menu"), { message: "the previous frame hides its avatar" }).toBe(false);
  });

  test("with tracing on, closing the context stays fast", async ({ page, context }, testInfo) => {
    await context.tracing.start({ screenshots: true, snapshots: true });
    await showAgent(page, { speed: 10 });
    await page.goto(demoPageUrl);
    for (let i = 0; i < 20; i++) {
      await page.locator("#name").fill(`Intento ${i}`);
      await page.locator("#terms").check();
      await page.locator("#terms").uncheck();
    }
    const start = Date.now();
    await context.tracing.stop({ path: testInfo.outputPath("trace.zip") });
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  test("each action adds a single extra Playwright call", async ({ page }) => {
    await showAgent(page);
    await page.goto(demoPageUrl);
    const calls: string[] = [];
    const original = page.locator("body").evaluate;
    const proto = Object.getPrototypeOf(page.locator("body"));
    proto.evaluate = function (...args: unknown[]) {
      calls.push("evaluate");
      return original.apply(this, args as any);
    };
    try {
      await page.locator("#name").fill("Carlos");
    } finally {
      proto.evaluate = original;
    }
    expect(calls).toHaveLength(1);
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
