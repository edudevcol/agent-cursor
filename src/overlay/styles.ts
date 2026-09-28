/**
 * CSS injected inside the overlay's Shadow DOM. Isolated from the host site.
 * Ring-shaped avatar (colored circle with a white ring + shadow), a smaller
 * inner circle for the face, a pulse while "working", and a text bubble that
 * always sits beside the avatar (never covering what the agent is touching).
 */
export function buildStyles(color: string, size: number, faceBackground: string): string {
  const faceSize = Math.round(size * 0.8);

  return `
    :host {
      all: initial;
    }
    .agent-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .agent-avatar {
      position: absolute;
      top: 0;
      left: 0;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(0, 0, 0, 0.35);
      transform: translate(-9999px, -9999px);
      transition: transform 0ms linear;
      display: grid;
      place-items: center;
      opacity: 0;
    }
    .agent-avatar.agent-visible {
      opacity: 1;
    }
    .agent-avatar.agent-working {
      animation: agent-pulse 1s ease-in-out infinite;
    }
    @keyframes agent-pulse {
      0%, 100% { box-shadow: 0 0 0 3px #fff, 0 0 0 0 ${color}; }
      50% { box-shadow: 0 0 0 3px #fff, 0 0 0 10px transparent; }
    }
    .agent-face {
      position: relative;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      width: ${faceSize}px;
      height: ${faceSize}px;
      border-radius: 50%;
      border: 2px solid #fff;
      background: ${faceBackground};
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      transform: translateZ(0);
    }
    .agent-face img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .agent-face .agent-emoji {
      font: ${Math.round(faceSize * 0.75)}px/1 "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
      transform: translateY(1px);
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.13));
    }
    /* The bubble always sits beside the avatar, never above it covering the element. */
    .agent-bubble {
      position: absolute;
      top: 50%;
      left: 100%;
      transform: translateY(-50%);
      margin-left: 10px;
      background: #1d1f24;
      color: #fff;
      border-left: 4px solid ${color};
      border-radius: 8px;
      padding: 6px 9px;
      font-size: 12px;
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      transition: opacity 150ms ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .agent-bubble.agent-bubble-left {
      left: auto;
      right: 100%;
      margin-left: 0;
      margin-right: 10px;
    }
    /* No room on the far side: sit above the avatar, extending away from the element. */
    .agent-bubble.agent-bubble-above {
      top: auto;
      bottom: 100%;
      left: auto;
      right: 0;
      transform: none;
      margin: 0 0 8px 0;
    }
    .agent-bubble.agent-bubble-left.agent-bubble-above {
      right: auto;
      left: 0;
    }
    .agent-bubble.agent-visible {
      opacity: 1;
    }
    .agent-ripple {
      position: absolute;
      width: 16px;
      height: 16px;
      margin-left: -8px;
      margin-top: -8px;
      border-radius: 50%;
      border: 2px solid ${color};
      transform: scale(0);
      opacity: 0.9;
      pointer-events: none;
    }
    .agent-ripple.agent-animate {
      animation: agent-ripple-anim 450ms ease-out forwards;
    }
    @keyframes agent-ripple-anim {
      to {
        transform: scale(3.5);
        opacity: 0;
      }
    }
    .agent-highlight {
      position: absolute;
      border: 2px solid ${color};
      border-radius: 6px;
      opacity: 0;
      transition: opacity 150ms ease, top 150ms ease, left 150ms ease, width 150ms ease, height 150ms ease;
      box-shadow: 0 0 0 3px ${hexToRgba(color, 0.25)};
    }
    .agent-highlight.agent-visible {
      opacity: 1;
    }
  `;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
