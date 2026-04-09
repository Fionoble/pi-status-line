/**
 * Pi Status Line — Powerline-style footer
 *
 * A rich status line inspired by Claude Powerline, showing:
 * - Model name with provider icon
 * - Thinking level indicator
 * - Token usage (input/output)
 * - Session cost
 * - Git branch
 * - Turn count & agent state
 *
 * Powerline separators (chevrons) divide each segment with smooth transitions.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ── Powerline glyphs ─────────────────────────────────────────────
const SEP_RIGHT = "\ue0b0"; // 
const SEP_RIGHT_THIN = "\ue0b1"; // 

// ── ANSI helpers ─────────────────────────────────────────────────
function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function bgRgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[48;2;${r};${g};${b}m${text}`;
}

function fgRgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bgRgbCode(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

function reset(): string {
  return "\x1b[0m";
}

// ── Color palette ────────────────────────────────────────────────
interface SegmentColors {
  fg: [number, number, number];
  bg: [number, number, number];
}

const PALETTE = {
  // Left side segments
  model: { fg: [235, 235, 235] as [number, number, number], bg: [62, 68, 114] as [number, number, number] },
  thinking: { fg: [200, 200, 220] as [number, number, number], bg: [80, 60, 120] as [number, number, number] },
  tokens: { fg: [200, 210, 200] as [number, number, number], bg: [50, 80, 60] as [number, number, number] },
  cost: { fg: [220, 200, 170] as [number, number, number], bg: [90, 75, 40] as [number, number, number] },

  // Right side segments
  git: { fg: [220, 180, 140] as [number, number, number], bg: [80, 55, 35] as [number, number, number] },
  turns: { fg: [180, 200, 220] as [number, number, number], bg: [40, 65, 90] as [number, number, number] },
  state: { fg: [235, 235, 235] as [number, number, number], bg: [62, 68, 114] as [number, number, number] },
};

// ── Formatting helpers ───────────────────────────────────────────
function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function providerIcon(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "⬡ ";
    case "openai":
      return "◈ ";
    case "google":
      return "◆ ";
    case "openrouter":
      return "⊙ ";
    default:
      return "▸ ";
  }
}

function thinkingIcon(level: string): string {
  switch (level) {
    case "off":
      return "○";
    case "minimal":
      return "◔";
    case "low":
      return "◑";
    case "medium":
      return "◕";
    case "high":
      return "●";
    case "xhigh":
      return "⬤";
    default:
      return "○";
  }
}

// ── Segment builder ──────────────────────────────────────────────
interface Segment {
  text: string;
  colors: SegmentColors;
  visWidth: number;
}

function buildSegment(text: string, colors: SegmentColors): Segment {
  return { text, colors, visWidth: text.length };
}

/**
 * Renders left-aligned powerline segments.
 * Each segment flows into the next with a chevron separator.
 */
function renderLeftSegments(segments: Segment[]): string {
  if (segments.length === 0) return "";

  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const [fr, fg, fb] = seg.colors.fg;
    const [br, bg, bb] = seg.colors.bg;

    // Segment content
    result += bgRgbCode(br, bg, bb) + fgRgb(fr, fg, fb) + ` ${seg.text} `;

    // Separator
    if (i < segments.length - 1) {
      const next = segments[i + 1];
      const [nbr, nbg, nbb] = next.colors.bg;
      result += bgRgbCode(nbr, nbg, nbb) + fgRgb(br, bg, bb) + SEP_RIGHT;
    } else {
      // Last segment: separator into empty background
      result += reset() + fgRgb(br, bg, bb) + SEP_RIGHT + reset();
    }
  }
  return result;
}

/**
 * Renders right-aligned powerline segments.
 * Uses reverse separators flowing right-to-left.
 */
function renderRightSegments(segments: Segment[]): string {
  if (segments.length === 0) return "";

  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const [fr, fg, fb] = seg.colors.fg;
    const [br, bg, bb] = seg.colors.bg;

    // Reverse separator (arrow pointing left)
    if (i === 0) {
      result += reset() + fgRgb(br, bg, bb) + SEP_RIGHT + reset();
    }

    // Segment content
    result += bgRgbCode(br, bg, bb) + fgRgb(fr, fg, fb) + ` ${seg.text} `;

    // Inter-segment thin separator
    if (i < segments.length - 1) {
      const next = segments[i + 1];
      const [nbr, nbg, nbb] = next.colors.bg;
      result += bgRgbCode(nbr, nbg, nbb) + fgRgb(br, bg, bb) + SEP_RIGHT;
    } else {
      result += reset();
    }
  }
  return result;
}

function totalVisibleWidth(segments: Segment[]): number {
  // Each segment: 1 padding + text + 1 padding + 1 separator = text.length + 3
  // Last segment has no next-separator but has closing chevron = text.length + 3
  return segments.reduce((sum, seg) => sum + seg.visWidth + 3, 0);
}

// ── Extension ────────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
  let turnCount = 0;
  let agentState: "idle" | "thinking" | "tool" = "idle";

  pi.on("session_start", async (_event, ctx) => {
    turnCount = 0;
    // Count existing turns from session history
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        turnCount++;
      }
    }
    agentState = "idle";
    updateFooter(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    turnCount++;
    agentState = "thinking";
    updateFooter(ctx);
  });

  pi.on("tool_execution_start", async (_event, ctx) => {
    agentState = "tool";
    updateFooter(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    agentState = "idle";
    updateFooter(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    agentState = "idle";
    updateFooter(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    updateFooter(ctx);
  });

  function updateFooter(ctx: { ui: any; sessionManager: any; model: any }) {
    ctx.ui.setFooter((tui: any, theme: Theme, footerData: any) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // ── Gather data ──────────────────────────────────
          let inputTokens = 0;
          let outputTokens = 0;
          let totalCost = 0;

          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              inputTokens += m.usage.input;
              outputTokens += m.usage.output;
              totalCost += m.usage.cost.total;
            }
          }

          const branch = footerData.getGitBranch();
          const modelId = ctx.model?.id || "no-model";
          const provider = ctx.model?.provider || "";
          const thinkingLevel = pi.getThinkingLevel();

          // ── Build left segments ────────────────────────────
          const leftSegs: Segment[] = [];

          // Model segment
          leftSegs.push(buildSegment(
            `${providerIcon(provider)}${modelId}`,
            PALETTE.model
          ));

          // Thinking level (skip if off)
          if (thinkingLevel !== "off") {
            leftSegs.push(buildSegment(
              `${thinkingIcon(thinkingLevel)} ${thinkingLevel}`,
              PALETTE.thinking
            ));
          }

          // Token usage
          leftSegs.push(buildSegment(
            `↑${formatTokens(inputTokens)} ↓${formatTokens(outputTokens)}`,
            PALETTE.tokens
          ));

          // Cost (skip if zero)
          if (totalCost > 0) {
            leftSegs.push(buildSegment(
              formatCost(totalCost),
              PALETTE.cost
            ));
          }

          // ── Build right segments ───────────────────────────
          const rightSegs: Segment[] = [];

          // Git branch
          if (branch) {
            rightSegs.push(buildSegment(
              ` ${branch}`,
              PALETTE.git
            ));
          }

          // Turn count
          rightSegs.push(buildSegment(
            `⟳ ${turnCount}`,
            PALETTE.turns
          ));

          // Agent state
          const stateIcon = agentState === "idle" ? "✓" : agentState === "thinking" ? "◉" : "⚙";
          const stateLabel = agentState === "idle" ? "ready" : agentState === "thinking" ? "thinking" : "tools";
          rightSegs.push(buildSegment(
            `${stateIcon} ${stateLabel}`,
            PALETTE.state
          ));

          // ── Compose line ───────────────────────────────────
          const leftStr = renderLeftSegments(leftSegs);
          const rightStr = renderRightSegments(rightSegs);

          const leftWidth = totalVisibleWidth(leftSegs);
          const rightWidth = totalVisibleWidth(rightSegs);

          const gap = Math.max(1, width - leftWidth - rightWidth);
          const padding = " ".repeat(gap);

          const line = leftStr + padding + rightStr;
          return [truncateToWidth(line, width)];
        },
      };
    });
  }
}
