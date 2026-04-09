# ⚡ pi-status-line

A **powerline-style status line** for the [pi coding agent](https://github.com/badlogic/pi-mono) — replacing the default footer with a rich, information-dense bar inspired by vim-airline and Claude Powerline.

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042           main  ⟳ 5  ✓ ready 
```

> Works with any terminal that supports true color (24-bit RGB) and powerline fonts.

---

## ✨ Features

### Left Side — Model & Usage

| Segment | Icon | Description |
|---------|------|-------------|
| **Model** | `⬡` `◈` `◆` `⊙` `▸` | Active model name with provider-specific icon (Anthropic, OpenAI, Google, OpenRouter, or generic) |
| **Thinking** | `○` `◔` `◑` `◕` `●` `⬤` | Current thinking/reasoning level — hidden when `off`, progressively filled circle for minimal → xhigh |
| **Tokens** | `↑` `↓` | Cumulative input/output token counts for the session, auto-formatted (`1234` → `1.2k` → `1.23M`) |
| **Cost** | `$` | Running session cost — hidden when zero, precision adjusts to magnitude |

### Right Side — Context & State

| Segment | Icon | Description |
|---------|------|-------------|
| **Git branch** | `` | Current git branch — hidden when not in a git repo |
| **Turns** | `⟳` | Total turn count for the session, restored from history on resume |
| **Agent state** | `✓` `◉` `⚙` | Real-time indicator: `ready` (idle), `thinking` (LLM streaming), `tools` (tool execution) |

### Design

- **Powerline separators** — Smooth chevron transitions (``) between segments with true-color RGB backgrounds
- **Smart visibility** — Segments hide themselves when irrelevant (no cost yet, thinking off, no git repo)
- **Live updates** — Footer re-renders on every turn start/end, tool execution, model change, and git branch switch
- **Session-aware** — Reconstructs turn count from session history when resuming a session

---

## 📦 Installation

### From Git (recommended)

```bash
pi install git:github.com/Fionoble/pi-status-line
```

### From a local clone

```bash
git clone https://github.com/Fionoble/pi-status-line.git
pi install /path/to/pi-status-line
```

### Quick test (no install)

```bash
pi -e /path/to/pi-status-line/src/index.ts
```

### Uninstall

```bash
pi remove git:github.com/Fionoble/pi-status-line
```

---

## 🎨 Color Palette

Each segment has a distinct background color for quick visual scanning:

| Segment | Background | RGB |
|---------|------------|-----|
| Model | Indigo blue | `rgb(62, 68, 114)` |
| Thinking | Deep purple | `rgb(80, 60, 120)` |
| Tokens | Forest green | `rgb(50, 80, 60)` |
| Cost | Amber | `rgb(90, 75, 40)` |
| Git | Warm brown | `rgb(80, 55, 35)` |
| Turns | Steel blue | `rgb(40, 65, 90)` |
| State | Indigo blue | `rgb(62, 68, 114)` |

Colors are rendered using 24-bit true color ANSI escapes, so they work consistently across terminals without depending on your color scheme.

---

## 🔧 How It Works

The extension is a single TypeScript file that hooks into pi's extension API:

1. **Replaces the footer** via `ctx.ui.setFooter()` with a custom powerline renderer
2. **Subscribes to events** to track agent state in real-time:
   - `session_start` — Reset state, reconstruct turn count from history
   - `turn_start` / `turn_end` — Track turn count and thinking state
   - `tool_execution_start` — Show tool execution state
   - `agent_end` — Reset to idle
   - `model_select` — Update model display on switch
3. **Reads session data** from `ctx.sessionManager.getBranch()` to compute cumulative token usage and cost
4. **Reacts to git changes** via `footerData.onBranchChange()` for live branch updates

### Architecture

```
src/
└── index.ts          # Single-file extension — all logic in one place
    ├── ANSI helpers   # True-color RGB foreground/background utilities
    ├── Color palette  # Segment color definitions
    ├── Formatters     # Token count, cost, provider icon, thinking icon
    ├── Renderer       # Powerline segment builder (left + right aligned)
    └── Extension      # Event subscriptions + footer registration
```

---

## 🖥️ Requirements

- **[pi](https://github.com/badlogic/pi-mono)** coding agent
- A **terminal with true color support** (most modern terminals: iTerm2, Kitty, Ghostty, WezTerm, Alacritty, Windows Terminal, etc.)
- A **[powerline-patched font](https://github.com/powerline/fonts)** or [Nerd Font](https://www.nerdfonts.com/) for the chevron separators (``)

> **Note:** Without a powerline font, the chevron separators will render as missing glyphs or boxes. The status line will still function — it just won't look as smooth.

---

## 🤝 Contributing

Contributions are welcome! Some ideas:

- **Custom color themes** — Let users pick palettes or auto-derive from pi theme
- **Configurable segments** — Toggle segments on/off, reorder them
- **Additional segments** — Context window usage %, cache hit rate, session duration
- **Narrow terminal support** — Collapse segments progressively on small screens
- **Animation** — Spinner animation during thinking/tool states

### Development

```bash
git clone https://github.com/Fionoble/pi-status-line.git
cd pi-status-line

# Test your changes
pi -e ./src/index.ts
```

The extension uses [jiti](https://github.com/unjs/jiti) under the hood, so TypeScript runs directly — no build step needed.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[pi](https://github.com/badlogic/pi-mono)** by Mario Zechner — the coding agent this extends
- **[vim-airline](https://github.com/vim-airline/vim-airline)** / **[powerline](https://github.com/powerline/powerline)** — the visual inspiration
- **Claude Powerline** — the direct inspiration for bringing powerline aesthetics to coding agents
