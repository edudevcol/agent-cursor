# agent-cursor

Shows an on-screen agent avatar following along as your **Playwright** script clicks, types
and selects options. It does **not** automate anything — your automation stays exactly as it
is, this package only makes it visible.

## What it is NOT

- Not an automation framework, and not a replacement for Playwright.
- Doesn't change how you write your scripts (`page.click()`, `locator.fill()`, etc. work exactly
  the same).
- Doesn't change the outcome of your automation: if anything fails on the visual side, it's
  silently ignored and your script runs exactly as it would without the package.

## Install

```bash
npm install agent-cursor
```

Requires `playwright` or `playwright-core` already installed in your project (peer dependency).

## Usage

```js
import { chromium } from "playwright";
import { showAgent } from "agent-cursor";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await showAgent(page); // ← just one line

await page.goto("https://example.com/login");
await page.getByLabel("Email").fill("ana@example.com"); // the avatar moves beside the input and "types"
await page.getByRole("button", { name: "Sign in" }).click(); // the avatar moves to the button and clicks
```

## Options

```js
await showAgent(page, {
  name: "Agent A",        // accessible tooltip name. Default: "Agent"
  color: "#6c5ce7",       // accent color (ring, bubble, ripple). Default: the avatar's own color
  avatar: "detective",    // see Avatars section below. Default: "businessperson"
  size: 40,               // size in pixels. Default: 40
  speed: 1,               // 1 = normal, 2 = twice as fast. Default: 1
  moveDuration: 500,      // move duration in ms. Default: 500
  showLabels: true,       // text bubbles. Default: true
  highlight: true,        // highlight the active element. Default: true
  debug: false,           // logs when something visual silently fails. Default: false
});
```

## Avatars

Eight illustrated avatars are bundled inside the package (no internet or external files
required). Each one comes with its own ring color and pastel background; the
**businessperson** is the default.

| Name | Ring color |
|---|---|
| `businessperson` (default) | `#c2410c` orange |
| `robot` | `#6c5ce7` violet |
| `tester` | `#0d9488` teal |
| `detective` | `#b91c1c` red |
| `ninja` | `#374151` charcoal |
| `ghost` | `#64748b` slate |
| `cat` | `#d97706` amber |
| `alien` | `#65a30d` lime |

```js
await showAgent(page, { avatar: "detective" });
await showAgent(page, { avatar: "ghost", color: "#16a34a" }); // `color` overrides the ring color
```

Or bring your own:

```js
// Local file (PNG, JPG, SVG, WebP or GIF; max 5 MB)
await showAgent(page, { avatar: { src: "./my-avatar.png" } });

// URL
await showAgent(page, { avatar: { src: "https://myapp.com/icon.svg" } });

// Emoji
await showAgent(page, { avatar: { emoji: "🦊" } });
```

If the custom avatar can't be loaded (missing file, unsupported format, or over 5 MB), it
falls back to the default avatar without interrupting your script, and prints an
`[agent-cursor]` warning in the console explaining why.

## Disabling it without touching code

```bash
AGENT_VISUALIZER=off node my-script.js
```

## Actions covered

`click`, `dblclick`, `tap`, `fill`, `type`, `press`, `selectOption`, `check`, `uncheck`,
`setChecked`, `hover` — with both `page.click(selector)` and `page.locator(...).click()` /
`page.getByRole(...).click()`.

`type="password"` fields never show the real text in the bubble.

## Frames and framesets

The avatar is drawn inside the frame that holds the element, so pages built with `<iframe>`
or `<frameset>` work without any extra setup. When the next action happens in another frame,
the avatar hides in the previous one.

## Traces

Each animated action adds a single Playwright call, so traces (`trace: 'on'` or
`'retain-on-failure'`) stay small and closing the context stays fast.

## Known limitations

- In `headless: true` mode it's not visible live, but it does show up in Playwright
  screenshots, videos, and traces.
- Built for Playwright. Puppeteer, Selenium and WebdriverIO aren't supported yet.
- Only one agent per page in this version.

## Roadmap

- Puppeteer support.
- A fixture for `@playwright/test`.
- Multiple simultaneous agents on the same page.

## Development

```bash
npm install
npx playwright install chromium   # first time only
npm test               # type-checks, builds, then runs tests/visualizer.spec.ts
npm run demo           # builds, then opens examples/demo-page.html with the agent live
npm run demo:avatars   # builds, then cycles through all 8 bundled avatars
```

The bundled avatar PNGs live in `assets/avatars/` (128×128, transparent background). After
replacing or adding one, run `npm run embed-avatars` to regenerate
`src/overlay/avatar-images.ts`, then `npm run build`.

## Publishing

```bash
npm pack --dry-run   # check the package only contains dist/, README.md, LICENSE and package.json
npm publish          # runs the full test suite first (prepublishOnly)
```

## License

MIT
