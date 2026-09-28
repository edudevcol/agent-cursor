import { DEFAULT_AVATAR, type BuiltinAvatarName } from "../options.js";
import { AVATAR_IMAGES } from "./avatar-images.js";

export interface AvatarTheme {
  /** Ring / accent color used when the user doesn't pass `color`. */
  ring: string;
  /** Pastel background behind the face. */
  background: string;
}

/** Fallback theme for custom avatars (src / emoji). */
export const DEFAULT_THEME: AvatarTheme = { ring: "#6c5ce7", background: "#ede9fe" };

/** Each bundled avatar comes with its own ring color and pastel background. */
export const AVATAR_THEMES: Record<BuiltinAvatarName, AvatarTheme> = {
  businessperson: { ring: "#c2410c", background: "#ffedd5" },
  robot: { ring: "#6c5ce7", background: "#ede9fe" },
  tester: { ring: "#0d9488", background: "#ccfbf1" },
  detective: { ring: "#b91c1c", background: "#fee2e2" },
  ninja: { ring: "#374151", background: "#e5e7eb" },
  ghost: { ring: "#64748b", background: "#f1f5f9" },
  cat: { ring: "#d97706", background: "#fef3c7" },
  alien: { ring: "#65a30d", background: "#ecfccb" },
};

export function isBuiltinAvatar(name: unknown): name is BuiltinAvatarName {
  return typeof name === "string" && name in AVATAR_IMAGES;
}

/** HTML for a bundled avatar. Unknown names fall back to the default avatar. */
export function getBuiltinAvatarHtml(name: string): string {
  const key = isBuiltinAvatar(name) ? name : DEFAULT_AVATAR;
  return `<img src="${AVATAR_IMAGES[key]}" alt="${key} avatar" />`;
}
