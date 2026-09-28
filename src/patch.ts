import type { Page, Frame, Locator } from "playwright-core";
import type { AgentBridge } from "./bridge.js";
import type { ResolvedAgentOptions } from "./options.js";

interface AgentRuntime {
  bridge: AgentBridge;
  opts: ResolvedAgentOptions;
}

/** One runtime per page activated with showAgent(). */
const runtimeByPage = new WeakMap<Page, AgentRuntime>();
/** Prevents animating the same action twice if Locator internally calls Frame (or vice versa). */
const insideAnimatedCall = new WeakMap<Page, boolean>();
/** Prototypes are only patched once per process. */
let patched = false;

const ANIMATED_METHODS = [
  "click",
  "dblclick",
  "tap",
  "fill",
  "type",
  "press",
  "selectOption",
  "check",
  "uncheck",
  "setChecked",
  "hover",
] as const;

type AnimatedMethod = (typeof ANIMATED_METHODS)[number];
type PatchKind = "frame" | "locator";

const BOUNDING_BOX_TIMEOUT_MS = 2000;

function debugLog(debug: boolean, ...args: unknown[]) {
  if (debug) console.debug("[agent-cursor]", ...args);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}

/** Splits the selector (Frame only) off the rest of the arguments, and gives a uniform Locator. */
function getLocatorAndRest(
  target: Frame | Locator,
  kind: PatchKind,
  args: unknown[]
): { locator: Locator; rest: unknown[] } {
  if (kind === "frame") {
    const selector = args[0] as string;
    return { locator: (target as Frame).locator(selector), rest: args.slice(1) };
  }
  return { locator: target as Locator, rest: args };
}

async function isPasswordField(locator: Locator): Promise<boolean> {
  try {
    const type = await locator.evaluate((el) => (el as HTMLInputElement).type).catch(() => "");
    return type === "password";
  } catch {
    return false;
  }
}

function stringifySelectValues(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => stringifySelectValues(v)).join(", ");
  if (value && typeof value === "object" && "label" in (value as any)) return String((value as any).label);
  if (value && typeof value === "object" && "value" in (value as any)) return String((value as any).value);
  return String(value);
}

/** Computes the bubble label and, if applicable, the text to "type" letter by letter. */
async function describeAction(
  method: AnimatedMethod,
  locator: Locator,
  rest: unknown[]
): Promise<{ label?: string; typedText?: string }> {
  switch (method) {
    case "fill":
    case "type": {
      const raw = String(rest[0] ?? "");
      const masked = (await isPasswordField(locator)) ? "•".repeat(raw.length || 6) : raw;
      return { typedText: masked };
    }
    case "press":
      return { label: `Key: ${String(rest[0] ?? "")}` };
    case "selectOption":
      return { label: `Selecting: ${stringifySelectValues(rest[0])}` };
    case "check":
      return { label: "Checking box" };
    case "uncheck":
      return { label: "Unchecking box" };
    case "setChecked":
      return { label: rest[0] ? "Checking box" : "Unchecking box" };
    default:
      return {};
  }
}

async function animateAction(
  runtime: AgentRuntime,
  kind: PatchKind,
  target: Frame | Locator,
  method: AnimatedMethod,
  args: unknown[]
): Promise<void> {
  const { bridge, opts } = runtime;
  const { locator, rest } = getLocatorAndRest(target, kind, args);

  await withTimeout(locator.scrollIntoViewIfNeeded(), BOUNDING_BOX_TIMEOUT_MS);
  const box = await withTimeout(locator.boundingBox(), BOUNDING_BOX_TIMEOUT_MS);
  if (!box) {
    // Couldn't locate the element in time: skip the animation, the real action still runs.
    return;
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // The agent sits BESIDE the element (never on top of it), so it never covers
  // what's being typed or selected. The right side is preferred; if it doesn't
  // fit in the viewport, it falls back to the left. The highlight still marks
  // the real element.
  const gap = 14;
  let page: Page | undefined;
  try {
    page = locator.page();
  } catch {
    // no access to page(), fall back to a reasonable default viewport width
  }
  const viewportWidth = page?.viewportSize()?.width ?? 1280;
  const half = opts.size / 2;
  const rightAnchorX = box.x + box.width + gap + half;
  const fitsRight = rightAnchorX + half <= viewportWidth;
  const anchorX = fitsRight ? rightAnchorX : Math.max(box.x - gap - half, half);
  const anchorY = centerY;

  await bridge.highlightRect({ x: box.x, y: box.y, width: box.width, height: box.height });
  await bridge.startWorking();
  await bridge.moveTo(anchorX, anchorY, undefined, fitsRight ? "right" : "left");

  const { label, typedText } = await describeAction(method, locator, rest);

  if (method === "click" || method === "tap") {
    await bridge.clickEffect(centerX, centerY);
  } else if (method === "dblclick") {
    await bridge.clickEffect(centerX, centerY);
    await bridge.clickEffect(centerX, centerY);
  } else if (typedText !== undefined) {
    const duration = Math.min(Math.max(typedText.length * 40, 200), 1500) / Math.max(opts.speed, 0.01);
    await bridge.typeEffect(typedText, duration);
  } else if (label) {
    await bridge.labelEffect(label);
  }

  await bridge.stopWorking();
  await bridge.highlightRect(null);
}

function patchTarget(prototype: any, kind: PatchKind) {
  for (const method of ANIMATED_METHODS) {
    const original = prototype[method];
    if (typeof original !== "function") continue;

    prototype[method] = async function (this: Frame | Locator, ...args: unknown[]) {
      let page: Page | undefined;
      try {
        page = this.page();
      } catch {
        // some versions expose page() differently; if it fails, we just skip the animation
      }

      const runtime = page ? runtimeByPage.get(page) : undefined;
      if (!page || !runtime || insideAnimatedCall.get(page)) {
        return original.apply(this, args);
      }

      insideAnimatedCall.set(page, true);
      try {
        await animateAction(runtime, kind, this, method as AnimatedMethod, args);
      } catch (err) {
        debugLog(runtime.opts.debug, `animation for "${method}" failed, ignored:`, err);
      } finally {
        insideAnimatedCall.set(page, false);
      }

      return original.apply(this, args);
    };
  }
}

/** Patches Frame.prototype and Locator.prototype once per process. */
export function ensurePatched(page: Page): void {
  if (patched) return;
  patched = true;
  try {
    const framePrototype = Object.getPrototypeOf(page.mainFrame());
    patchTarget(framePrototype, "frame");
    const locatorPrototype = Object.getPrototypeOf(page.locator("body"));
    patchTarget(locatorPrototype, "locator");
  } catch (err) {
    // If the installed version changed its internals, we don't intercept anything,
    // but we also don't break the user's script.
    patched = false;
    console.warn(
      "[agent-cursor] could not hook into this Playwright version; the agent will not be shown.",
      err
    );
  }
}

export function registerPage(page: Page, bridge: AgentBridge, opts: ResolvedAgentOptions): void {
  runtimeByPage.set(page, { bridge, opts });
}

export function unregisterPage(page: Page): void {
  runtimeByPage.delete(page);
}
