/** Names of the avatars bundled with the package. */
export type BuiltinAvatarName =
  | "businessperson"
  | "robot"
  | "tester"
  | "detective"
  | "ninja"
  | "ghost"
  | "cat"
  | "alien";

/** Avatar used when none is given, or when a custom one can't be loaded. */
export const DEFAULT_AVATAR: BuiltinAvatarName = "businessperson";

/** A custom avatar supplied by the user. */
export interface CustomAvatar {
  /** Local file path (read and inlined as base64), an http(s) URL, or a data: URI. */
  src?: string;
  /** A simple emoji, e.g. "🦊". Simpler alternative to src. */
  emoji?: string;
}

export type AvatarOption = BuiltinAvatarName | CustomAvatar;

export interface AgentOptions {
  /** Name used for the accessible tooltip. Default: "Agent". */
  name?: string;
  /**
   * Accent color (ring, bubble border, ripple, highlight). Default: each bundled
   * avatar's own color, or "#6c5ce7" for custom avatars.
   */
  color?: string;
  /** Agent icon: one of the bundled names, or a custom one. Default: "businessperson". */
  avatar?: AvatarOption;
  /** Avatar size in pixels. Default: 40. */
  size?: number;
  /** Speed multiplier. 1 = normal, 2 = twice as fast. Default: 1. */
  speed?: number;
  /** Base move duration in ms. Default: 500. */
  moveDuration?: number;
  /** Show text bubbles (what's being typed/selected). Default: true. */
  showLabels?: boolean;
  /** Highlight the target element while acting on it. Default: true. */
  highlight?: boolean;
  /** Debug logs in the console when something visual silently fails. Default: false. */
  debug?: boolean;
}

export interface ResolvedAgentOptions extends Required<Omit<AgentOptions, "avatar" | "color">> {
  avatar: AvatarOption;
  /** undefined means "use the avatar's own color". */
  color?: string;
}

export const DEFAULT_OPTIONS: ResolvedAgentOptions = {
  name: "Agent",
  avatar: DEFAULT_AVATAR,
  size: 40,
  speed: 1,
  moveDuration: 500,
  showLabels: true,
  highlight: true,
  debug: false,
};

export function resolveOptions(opts?: AgentOptions): ResolvedAgentOptions {
  return { ...DEFAULT_OPTIONS, ...opts };
}

/** true when the AGENT_VISUALIZER=off environment variable is set. */
export function isDisabledByEnv(): boolean {
  return process.env.AGENT_VISUALIZER === "off";
}
