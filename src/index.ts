import type { Page } from "playwright-core";
import { resolveOptions, isDisabledByEnv, type AgentOptions } from "./options.js";
import { installAgentBridge } from "./bridge.js";
import { ensurePatched, registerPage, unregisterPage } from "./patch.js";

export type { AgentOptions, AvatarOption, BuiltinAvatarName, CustomAvatar } from "./options.js";

export interface AgentHandle {
  /** Hides the avatar without disabling action tracking. */
  hide(): Promise<void>;
  /** Shows the avatar again. */
  show(): Promise<void>;
  /** Removes the avatar and stops animating actions on this page. */
  dispose(): Promise<void>;
}

/**
 * Activates the visual agent on a Playwright page. From here on, every
 * click/fill/type/press/selectOption/check/uncheck/hover the script performs
 * on this page is animated first (the avatar moves in and acts) and then
 * runs normally.
 *
 * It never changes the result of the automation: if anything fails on the
 * visual side, it's silently ignored (see the `debug` option) and the real
 * action still happens.
 *
 * Can be disabled globally without touching code via the AGENT_VISUALIZER=off
 * environment variable.
 */
export async function showAgent(page: Page, options?: AgentOptions): Promise<AgentHandle> {
  const opts = resolveOptions(options);

  if (isDisabledByEnv()) {
    return {
      hide: async () => {},
      show: async () => {},
      dispose: async () => {},
    };
  }

  const bridge = await installAgentBridge(page, opts);
  registerPage(page, bridge, opts);
  ensurePatched(page);

  page.once("close", () => unregisterPage(page));

  return {
    hide: () => bridge.hide(),
    show: () => bridge.show(),
    dispose: async () => {
      unregisterPage(page);
      await bridge.dispose();
    },
  };
}
