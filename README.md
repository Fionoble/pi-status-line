# ⚡ pi-status-line

A **powerline-style status line** for the [pi coding agent](https://github.com/badlogic/pi-mono) — replacing the default footer with a rich, information-dense bar inspired by vim-airline and Claude Powerline.

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042     📂 …/my/project   main  ⟳ 5  ✓ ready 
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
| **Working dir** | `📂` | Current working directory — shows last two path components, collapses `$HOME` to `~` |
| **Git branch** | `` | Current git branch — hidden when not in a git repo |
| **Turns** | `⟳` | Total turn count for the session, restored from history on resume |
| **Agent state** | `✓` `◉` `⚙` | Real-time indicator: `ready` (idle), `thinking` (LLM streaming), `tools` (tool execution) |

### Design

- **Powerline separators** — Left side uses right-pointing chevrons (``) and right side uses left-pointing chevrons (``) for proper directional flow
- **Smart visibility** — Segments hide themselves when irrelevant (no cost yet, thinking off, no git repo)
- **Live updates** — Footer re-renders on every turn start/end, tool execution, model change, and git branch switch
- **Session-aware** — Reconstructs turn count from session history when resuming a session
- **Font detection** — Checks for Nerd Font / Powerline font on startup and shows install instructions if missing

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

### Project-local install

To use the status line only in a specific project (instead of globally):

```bash
pi install -l git:github.com/Fionoble/pi-status-line
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

## 🔤 Font Setup

The status line uses powerline glyphs (`` ``) for segment separators. These require a **patched font** — without one, you'll see boxes or missing characters.

The extension **automatically detects** whether you have a compatible font installed and will show a warning with install instructions if not.

### macOS

```bash
brew install --cask font-fira-code-nerd-font
```

Then set it in your terminal. For example, in Ghostty:

```
font-family = FiraCode Nerd Font
```

Other popular choices:
- `font-jetbrains-mono-nerd-font`
- `font-hack-nerd-font`
- `font-meslo-lg-nerd-font`

### Linux

```bash
# Ubuntu/Debian
sudo apt install fonts-firacode

# Or download from https://www.nerdfonts.com/font-downloads
```

Then configure your terminal emulator to use the font.

### Browse all fonts

Visit [nerdfonts.com](https://www.nerdfonts.com/) for the full catalog.

---

## 🎨 Color Palette

Each segment has a distinct background color for quick visual scanning:

| Segment | Background | RGB |
|---------|------------|-----|
| Model | Indigo blue | `rgb(62, 68, 114)` |
| Thinking | Deep purple | `rgb(80, 60, 120)` |
| Tokens | Forest green | `rgb(50, 80, 60)` |
| Cost | Amber | `rgb(90, 75, 40)` |
| Working dir | Slate gray | `rgb(55, 60, 70)` |
| Git | Warm brown | `rgb(80, 55, 35)` |
| Turns | Steel blue | `rgb(40, 65, 90)` |
| State | Indigo blue | `rgb(62, 68, 114)` |

Colors are rendered using 24-bit true color ANSI escapes, so they work consistently across terminals without depending on your color scheme.

---

## 🔧 How It Works

The extension is a single TypeScript file that hooks into pi's extension API:

1. **Replaces the footer** via `ctx.ui.setFooter()` with a custom powerline renderer
2. **Subscribes to events** to track agent state in real-time:
   - `session_start` — Reset state, reconstruct turn count from history, run font check
   - `turn_start` / `turn_end` — Track turn count and thinking state
   - `tool_execution_start` — Show tool execution state
   - `agent_end` — Reset to idle
   - `model_select` — Update model display on switch
3. **Reads session data** from `ctx.sessionManager.getBranch()` to compute cumulative token usage and cost
4. **Reacts to git changes** via `footerData.onBranchChange()` for live branch updates
5. **Detects fonts** on startup — checks macOS font directories and `system_profiler`, or `fc-list` on Linux

### Architecture

```
src/
└── index.ts          # Single-file extension — all logic in one place
    ├── ANSI helpers   # True-color RGB foreground/background utilities
    ├── Color palette  # Segment color definitions
    ├── Formatters     # Token count, cost, provider icon, thinking icon
    ├── Font detection # Nerd Font / Powerline font detection (macOS + Linux)
    ├── Renderer       # Powerline segment builder (left + right aligned)
    └── Extension      # Event subscriptions + footer registration
```

---

## 🖥️ Requirements

- **[pi](https://github.com/badlogic/pi-mono)** coding agent
- A **terminal with true color support** (most modern terminals: iTerm2, Kitty, Ghostty, WezTerm, Alacritty, Windows Terminal, etc.)
- A **[Nerd Font](https://www.nerdfonts.com/)** or [Powerline-patched font](https://github.com/powerline/fonts) for the chevron separators

> **Note:** The extension will warn you on startup if no compatible font is detected. The status line still functions without one — separators just won't render cleanly.

---

## 🤝 Contributing

Contributions are welcome! Some ideas:

- **Custom color themes** — Let users pick palettes or auto-derive from pi theme
- **Configurable segments** — Toggle segments on/off, reorder them
- **Additional segments** — Context window usage %, cache hit rate, session duration, file count
- **Narrow terminal support** — Collapse segments progressively on small screens
- **Animation** — Spinner animation during thinking/tool states
- **Windows font detection** — Currently assumes fonts are present on Windows

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
