# ⚡ pi-status-line

A **powerline-style status line** and **interactive todo list** for the [pi coding agent](https://github.com/badlogic/pi-mono) — replacing the default footer with a rich, information-dense bar and adding persistent task tracking across sessions.

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042  📋 8 todo     📂 …/my/project   main  ⟳ 5  ✓ ready 
```

> Works with any terminal that supports true color (24-bit RGB) and powerline fonts.

---

## ✨ Features

### Powerline Status Bar

#### Left Side — Model, Usage & Todo

| Segment | Icon | Description |
|---------|------|-------------|
| **Model** | `⬡` `◈` `◆` `⊙` `▸` | Active model name with provider-specific icon (Anthropic, OpenAI, Google, OpenRouter, or generic) |
| **Thinking** | `○` `◔` `◑` `◕` `●` `⬤` | Current thinking/reasoning level — hidden when `off`, progressively filled circle for minimal → xhigh |
| **Tokens** | `↑` `↓` | Cumulative input/output token counts for the session, auto-formatted (`1234` → `1.2k` → `1.23M`) |
| **Cost** | `$` | Running session cost — hidden when zero, precision adjusts to magnitude |
| **Todo** | `📋` `⚠` `🔴` | Open todo count — changes color based on urgency. Hidden when list is empty. |

#### Right Side — Context & State

| Segment | Icon | Description |
|---------|------|-------------|
| **Working dir** | `📂` | Current working directory — shows last two path components, collapses `$HOME` to `~` |
| **Git branch** | `` | Current git branch — hidden when not in a git repo |
| **Turns** | `⟳` | Total turn count for the session, restored from history on resume |
| **Agent state** | `✓` `◉` `⚙` | Real-time indicator: `ready` (idle), `thinking` (LLM streaming), `tools` (tool execution) |

#### Todo Segment States

| State | Color | Example |
|-------|-------|---------|
| Normal | Green | `📋 12 todo` |
| Has stale items (7+ days) | Amber | `⚠ 3 stale · 12 todo` |
| Has overdue items (14+ days) | Red | `🔴 2 overdue · 12 todo` |
| Empty | Hidden | *(segment not shown)* |

### Interactive Todo List

A persistent, categorized task list at `~/.pi/agent/todo.md` that you can manage from any pi session.

#### Commands

| Command | Description |
|---------|-------------|
| `/todo` | Open the interactive todo list — navigate with ↑↓/jk, toggle items with space/x, switch sections with tab |
| `/todo add <text>` | Quick-add an item. Auto-categorizes based on keywords (review → Reviews, reply → Slack, 1:1 → Management, etc.) |
| `/briefing` | Run the morning briefing prompt (requires a `plan-my-day` prompt template) |
| **Ctrl+T** | Keyboard shortcut to open the todo list from anywhere |

#### Categories

Items are automatically organized under these headings:

| Category | What goes here |
|----------|---------------|
| **Projects** | Active project work — features, experiments, technical initiatives |
| **Management** | People tasks — check-ins, feedback, 1:1 prep, team health |
| **Reviews & Delegation** | PR reviews, RFC decisions, things to hand off |
| **Slack Replies Owed** | Messages you committed to responding to |
| **Maintenance** | Infrastructure, cleanup, tooling, process fixes |
| **Done** | Completed items with dates |

#### Staleness Markers

The todo list supports urgency prefixes that the status bar reads:

- `⚠️ STALE` — Items older than 7 days without progress
- `🔴 OVERDUE` — Items older than 14 days

Add these prefixes to item text and they'll be reflected in the powerline segment color.

#### Any Session Can Manage the List

The todo file lives at `~/.pi/agent/todo.md` — accessible from any pi session regardless of working directory. The extension registers a `todo` tool and injects system prompt instructions automatically, so the LLM knows about the list on every turn. Just say:

> "Add 'follow up with Alice on the API design' to my todo list"

The LLM will use the `todo` tool to add it to the right category. It also proactively adds items when it notices you making commitments ("I'll do X", "remind me to Y").

---

## 📦 Installation

### From Git (recommended)

```bash
pi install git:github.com/Fionoble/pi-status-line
```

This installs both the powerline status bar and the interactive todo list.

### From a local clone

```bash
git clone https://github.com/Fionoble/pi-status-line.git
pi install /path/to/pi-status-line
```

### Project-local install

To use only in a specific project (instead of globally):

```bash
pi install -l git:github.com/Fionoble/pi-status-line
```

### Quick test (no install)

```bash
# Status line only
pi -e /path/to/pi-status-line/src/index.ts

# Both status line and todo
pi -e /path/to/pi-status-line/src/index.ts -e /path/to/pi-status-line/src/briefing.ts
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
| Todo (normal) | Soft green | `rgb(40, 65, 45)` |
| Todo (stale) | Warm amber | `rgb(90, 75, 35)` |
| Todo (overdue) | Alert red | `rgb(100, 40, 40)` |
| Working dir | Slate gray | `rgb(55, 60, 70)` |
| Git | Warm brown | `rgb(80, 55, 35)` |
| Turns | Steel blue | `rgb(40, 65, 90)` |
| State | Indigo blue | `rgb(62, 68, 114)` |

Colors are rendered using 24-bit true color ANSI escapes, so they work consistently across terminals without depending on your color scheme.

---

## 🔧 How It Works

The package includes two extensions:

### `src/index.ts` — Powerline Status Bar

1. **Replaces the footer** via `ctx.ui.setFooter()` with a custom powerline renderer
2. **Subscribes to events** to track agent state in real-time:
   - `session_start` — Reset state, reconstruct turn count from history, run font check
   - `turn_start` / `turn_end` — Track turn count and thinking state
   - `tool_execution_start` — Show tool execution state
   - `agent_end` — Reset to idle
   - `model_select` — Update model display on switch
3. **Reads todo list** from `~/.pi/agent/todo.md` on each render to show todo counts
4. **Reads session data** from `ctx.sessionManager.getBranch()` to compute cumulative token usage and cost
5. **Reacts to git changes** via `footerData.onBranchChange()` for live branch updates
6. **Detects fonts** on startup — checks macOS font directories and `system_profiler`, or `fc-list` on Linux

### `src/briefing.ts` — Interactive Todo List

1. **Parses `~/.pi/agent/todo.md`** — a standard markdown file with `## Section` headers and `- [ ]` / `- [x]` checkboxes
2. **Registers `/todo` command** — full-screen interactive UI with keyboard navigation, section switching, and toggle-to-complete
3. **Registers `/todo add` command** — quick-add with auto-categorization based on keywords
4. **Registers `/briefing` command** — triggers a morning briefing prompt template
5. **Registers Ctrl+T shortcut** — quick access to the todo list from anywhere
6. **Auto-saves** — changes are written back to the file when you close the UI

### Architecture

```
src/
├── index.ts      # Powerline footer — segments, colors, font detection, todo counts
└── briefing.ts   # Interactive todo list — parser, TUI component, commands, shortcuts
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
- **Todo improvements** — Due dates, priorities, drag-to-reorder, search/filter
- **Windows font detection** — Currently assumes fonts are present on Windows

### Development

```bash
git clone https://github.com/Fionoble/pi-status-line.git
cd pi-status-line

# Test your changes
pi -e ./src/index.ts -e ./src/briefing.ts
```

The extensions use [jiti](https://github.com/unjs/jiti) under the hood, so TypeScript runs directly — no build step needed.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[pi](https://github.com/badlogic/pi-mono)** by Mario Zechner — the coding agent this extends
- **[vim-airline](https://github.com/vim-airline/vim-airline)** / **[powerline](https://github.com/powerline/powerline)** — the visual inspiration
- **Claude Powerline** — the direct inspiration for bringing powerline aesthetics to coding agents
