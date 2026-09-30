import type { Page, Frame, Locator } from "playwright-core";
import type { AgentBridge } from "./bridge.js";
import type { BrowserAction } from "./overlay/overlay.js";
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

function debugLog(debug: boolean, ...args: unknown[]) {
  if (debug) console.debug("[agent-cursor]", ...args);
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

function stringifySelectValues(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => stringifySelectValues(v)).join(", ");
  if (value && typeof value === "object" && "label" in (value as any)) return String((value as any).label);
  if (value && typeof value === "object" && "value" in (value as any)) return String((value as any).value);
  return String(value);
}

/** Builds what the page has to play; password masking happens in the page. */
function describeAction(method: AnimatedMethod, rest: unknown[], speed: number): BrowserAction {
  switch (method) {
    case "click":
    case "tap":
      return { clicks: 1 };
    case "dblclick":
      return { clicks: 2 };
    case "fill":
    case "type": {
      const text = String(rest[0] ?? "");
      const typeDurationMs = Math.min(Math.max(text.length * 40, 200), 1500) / Math.max(speed, 0.01);
      return { text, typeDurationMs };
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
  // Single Playwright call per action: every extra call is recorded in traces with a DOM
  // snapshot, and on heavy pages flushing hundreds of them stalls the context teardown.
  await bridge.animate(locator, describeAction(method, rest, opts.speed));
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

      // The guard stays on through the real action: Locator methods delegate to their Frame
      // counterparts, which would otherwise animate the same action a second time.
      insideAnimatedCall.set(page, true);
      try {
        try {
          await animateAction(runtime, kind, this, method as AnimatedMethod, args);
        } catch (err) {
          debugLog(runtime.opts.debug, `animation for "${method}" failed, ignored:`, err);
        }
        return await original.apply(this, args);
      } finally {
        insideAnimatedCall.set(page, false);
      }
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
