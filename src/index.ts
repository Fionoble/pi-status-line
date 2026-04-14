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

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ── Powerline glyphs ─────────────────────────────────────────────
const SEP_RIGHT = "\ue0b0"; // 
const SEP_RIGHT_THIN = "\ue0b1"; // 
const SEP_LEFT = "\ue0b2"; // 

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

  // Todo segment
  todoClean: { fg: [180, 210, 180] as [number, number, number], bg: [40, 65, 45] as [number, number, number] },
  todoWarn: { fg: [230, 200, 140] as [number, number, number], bg: [90, 75, 35] as [number, number, number] },
  todoAlert: { fg: [240, 180, 170] as [number, number, number], bg: [100, 40, 40] as [number, number, number] },

  // Right side segments
  cwd: { fg: [180, 190, 200] as [number, number, number], bg: [55, 60, 70] as [number, number, number] },
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

    // Left-pointing separator before each segment
    if (i === 0) {
      // First right segment: arrow from empty bg into segment bg
      result += reset() + fgRgb(br, bg, bb) + SEP_LEFT;
    } else {
      // Between right segments: arrow from previous bg into this bg
      const prev = segments[i - 1];
      const [pbr, pbg, pbb] = prev.colors.bg;
      result += bgRgbCode(pbr, pbg, pbb) + fgRgb(br, bg, bb) + SEP_LEFT;
    }

    // Segment content
    result += bgRgbCode(br, bg, bb) + fgRgb(fr, fg, fb) + ` ${seg.text} `;
  }
  result += reset();
  return result;
}

function totalVisibleWidth(segments: Segment[]): number {
  // Each segment: 1 padding + text + 1 padding + 1 separator = text.length + 3
  // Last segment has no next-separator but has closing chevron = text.length + 3
  return segments.reduce((sum, seg) => sum + seg.visWidth + 3, 0);
}

// ── Todo list counts ─────────────────────────────────────────────

const TODO_PATH = resolve(process.env.HOME || "~", ".pi", "agent", "todo.md");

interface TodoCounts {
  total: number;
  overdue: number;
  stale: number;
}

function getTodoCounts(): TodoCounts {
  try {
    const content = readFileSync(TODO_PATH, "utf8");
    let total = 0, overdue = 0, stale = 0;
    let inDone = false;
    for (const line of content.split("\n")) {
      if (line.startsWith("## Done")) { inDone = true; continue; }
      if (line.startsWith("## ") && inDone) { inDone = false; }
      if (inDone) continue;
      const match = line.match(/^- \[ \] (.+)$/);
      if (match) {
        total++;
        if (match[1].includes("🔴 OVERDUE")) overdue++;
        else if (match[1].includes("⚠️ STALE")) stale++;
      }
    }
    return { total, overdue, stale };
  } catch {
    return { total: 0, overdue: 0, stale: 0 };
  }
}

// ── Font detection ───────────────────────────────────────────────

/** Known Nerd Font / Powerline font name fragments (case-insensitive). */
const NERD_FONT_MARKERS = [
  "nerd font",
  "powerline",
  "nf-",
  "nerdfont",
];

/**
 * Check whether the system has at least one Nerd Font / Powerline font
 * installed. Returns true if found (or if detection is unsupported on
 * this platform), false if definitely missing.
 */
function hasNerdFont(): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      // Check user and system font directories for Nerd Font files
      const fontDirs = [
        join(process.env.HOME || "~", "Library/Fonts"),
        "/Library/Fonts",
        "/System/Library/Fonts",
      ];

      for (const dir of fontDirs) {
        try {
          const files = readdirSync(dir);
          const hasNF = files.some((f) => {
            const lower = f.toLowerCase();
            return NERD_FONT_MARKERS.some((m) => lower.includes(m.replace(/ /g, "")));
          });
          if (hasNF) return true;
        } catch {
          // Directory doesn't exist or isn't readable
        }
      }

      // Fallback: ask the system font registry
      try {
        const out = execSync(
          "system_profiler SPFontsDataType 2>/dev/null | grep -i 'nerd\\|powerline' | head -1",
          { timeout: 3000, encoding: "utf8" },
        );
        if (out.trim().length > 0) return true;
      } catch {
        // system_profiler failed or timed out
      }

      return false;
    }

    if (os === "linux") {
      try {
        const out = execSync("fc-list : family 2>/dev/null", {
          timeout: 3000,
          encoding: "utf8",
        });
        const lower = out.toLowerCase();
        return NERD_FONT_MARKERS.some((m) => lower.includes(m));
      } catch {
        // fc-list not available
      }
      return true; // Can't detect — assume OK
    }

    // Windows or unknown: skip detection
    return true;
  } catch {
    return true; // On any error, don't annoy the user
  }
}

function fontInstallHint(): string {
  const os = platform();
  if (os === "darwin") {
    return [
      "Install a Nerd Font for powerline glyphs:",
      "  brew install --cask font-fira-code-nerd-font",
      "",
      "Then set it in your terminal (e.g. for Ghostty):",
      '  echo \'font-family = FiraCode Nerd Font\' >> ~/Library/Application\\ Support/com.mitchellh.ghostty/config.ghostty',
      "",
      "Other popular choices: font-jetbrains-mono-nerd-font, font-hack-nerd-font, font-meslo-lg-nerd-font",
    ].join("\n");
  }
  if (os === "linux") {
    return [
      "Install a Nerd Font for powerline glyphs:",
      "  # Ubuntu/Debian:",
      "  sudo apt install fonts-firacode",
      "  # Or download from https://www.nerdfonts.com/font-downloads",
      "",
      "Then configure your terminal emulator to use it.",
    ].join("\n");
  }
  return "Install a Nerd Font from https://www.nerdfonts.com/ for powerline glyphs.";
}

// ── Extension ────────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
  let turnCount = 0;
  let agentState: "idle" | "thinking" | "tool" = "idle";
  let fontWarningShown = false;

  pi.on("session_start", async (_event, ctx) => {
    turnCount = 0;
    // Count existing turns from session history
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        turnCount++;
      }
    }
    agentState = "idle";

    // One-time font check
    if (!fontWarningShown && ctx.hasUI && !hasNerdFont()) {
      fontWarningShown = true;
      ctx.ui.notify(
        "pi-status-line: No Nerd Font detected. Powerline glyphs may render as boxes.\n\n" + fontInstallHint(),
        "warning",
      );
    }

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

          // Todo segment
          const todoCounts = getTodoCounts();
          if (todoCounts.total > 0) {
            let todoText: string;
            let todoColor: SegmentColors;
            if (todoCounts.overdue > 0) {
              todoText = `🔴 ${todoCounts.overdue} overdue · ${todoCounts.total} todo`;
              todoColor = PALETTE.todoAlert;
            } else if (todoCounts.stale > 0) {
              todoText = `⚠ ${todoCounts.stale} stale · ${todoCounts.total} todo`;
              todoColor = PALETTE.todoWarn;
            } else {
              todoText = `📋 ${todoCounts.total} todo`;
              todoColor = PALETTE.todoClean;
            }
            leftSegs.push(buildSegment(todoText, todoColor));
          }

          // ── Build right segments ───────────────────────────
          const rightSegs: Segment[] = [];

          // Current directory (show basename, or ~ for home)
          const home = process.env.HOME || "";
          let cwdLabel = ctx.cwd || process.cwd();
          if (home && cwdLabel === home) {
            cwdLabel = "~";
          } else if (home && cwdLabel.startsWith(home + "/")) {
            cwdLabel = "~/" + cwdLabel.slice(home.length + 1);
          }
          // Show last two path components to keep it compact
          const parts = cwdLabel.split("/");
          if (parts.length > 3 && cwdLabel !== "~") {
            cwdLabel = "…/" + parts.slice(-2).join("/");
          }
          rightSegs.push(buildSegment(
            `📂 ${cwdLabel}`,
            PALETTE.cwd
          ));

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
