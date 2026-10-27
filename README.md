# ⚡ pi-status-line

A **powerline-style status line** for the [pi coding agent](https://github.com/badlogic/pi-mono) — replacing the default footer with a rich, information-dense bar.

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042  PRs 7d: 16     📂 …/my/project   main  ⟳ 5  ✓ ready
```

> Works with any terminal that supports true color (24-bit RGB) and powerline fonts.

This repo also includes **[pi-todo](#-pi-todo)** — an optional interactive todo list extension that pairs with the status line.

---

## 📦 Installation

### Status line only

```bash
pi install git:github.com/Fionoble/pi-status-line
```

### Status line + todo list

```bash
pi install git:github.com/Fionoble/pi-status-line
pi install git:github.com/Fionoble/pi-status-line/todo
```

### Uninstall

```bash
pi remove git:github.com/Fionoble/pi-status-line
pi remove git:github.com/Fionoble/pi-status-line/todo
```

---

## ✨ Status Line Features

### Left Side — Model, Usage & Shipped PRs

| Segment | Icon | Description |
|---------|------|-------------|
| **Model** | `⬡` `◈` `◆` `⊙` `▸` | Active model with provider icon |
| **Thinking** | `○` `◔` `◑` `◕` `●` `⬤` | Reasoning level — hidden when `off` |
| **Tokens** | `↑` `↓` | Cumulative input/output tokens, auto-formatted |
| **Cost** | `$` | Session cost — hidden when zero |
| **Shipped PRs** | `PRs 7d: N` | Merged PRs in the last rolling 168 hours, including River PRs assigned to you |

### Right Side — Context & State

| Segment | Icon | Description |
|---------|------|-------------|
| **Working dir** | `📂` | Last two path components, `~` for home |
| **Git branch** | `` | Hidden when not in a git repo |
| **Turns** | `⟳` | Turn count, restored on resume |
| **Agent state** | `✓` `◉` `⚙` | `ready` / `thinking` / `tools` |

### Shipped PR Segment

`PRs 7d: N` counts merged PRs across:

- GitHub: PRs authored by the signed-in `gh` user, across accessible repositories.
- Delta: PRs authored by the signed-in `dt` user, plus River-authored PRs assigned to that user. River's current service identity and its legacy bot accounts are recognized.

Delta defaults to `shop/world`. Set `PI_STATUS_DELTA_REPOS=shop/world,shop/other` before launching Pi to include more repositories. Delta requires repository-scoped searches. PRs are deduplicated by repository and number, including overlapping author/assignee queries and GitHub-to-Delta migrations.

Requires existing authenticated `gh` and `dt` CLIs. The extension makes read-only calls, never launches a login flow, refreshes in the background every **5 minutes**, and caches the last complete count in memory. No commands or network requests run during rendering. A new session/reload fetches a fresh snapshot. Shutdown cancels reads and stops the timer. There are no new package dependencies (tests require Node.js 22.18+ with native TypeScript support).

| State | Color | Example |
|-------|-------|---------|
| Loading | Green | `PRs 7d: …` |
| Fresh | Green | `PRs 7d: 16` (including a valid zero) |
| Refresh failed / cache expired | Amber | `PRs 7d: 16 (stale)` |
| No complete count available | Amber | `PRs 7d: unavailable` |

Failed, malformed, incomplete, or capped searches do not become a partial total or a false zero. The status bar no longer reads or displays todos; the optional `/todo` extension and its files are unchanged.

---

## 🔤 Font Setup

The status line uses powerline glyphs (`` ``) for separators. These require a **Nerd Font**. The extension auto-detects and warns if missing.

### macOS

```bash
brew install --cask font-fira-code-nerd-font
```

Then set it in your terminal (e.g. Ghostty: `font-family = FiraCode Nerd Font`).

### Linux

```bash
sudo apt install fonts-firacode
# Or download from https://www.nerdfonts.com/font-downloads
```

---

## 🎨 Color Palette

| Segment | Background RGB |
|---------|---------------|
| Model | `rgb(62, 68, 114)` |
| Thinking | `rgb(80, 60, 120)` |
| Tokens | `rgb(50, 80, 60)` |
| Cost | `rgb(90, 75, 40)` |
| PRs (fresh) | `rgb(40, 65, 45)` |
| PRs (stale/unavailable) | `rgb(90, 75, 35)` |
| Working dir | `rgb(55, 60, 70)` |
| Git | `rgb(80, 55, 35)` |
| Turns | `rgb(40, 65, 90)` |
| State | `rgb(62, 68, 114)` |

---

# 📋 pi-todo

An optional **interactive todo list** with persistent task tracking, LLM tool integration, and completion history. Lives in the `todo/` subdirectory of this repo.

## Install

```bash
pi install git:github.com/Fionoble/pi-status-line/todo
```

## Features

### Commands

| Command | Description |
|---------|-------------|
| `/todo` | Interactive todo list — ↑↓/jk navigate, space/x toggle, tab sections |
| `/todo add <text>` | Quick-add with auto-categorization |
| `/done` | Show completed items (today) |
| `/done yesterday` | Yesterday's completions |
| `/done week` | This week's completions |
| `/done 2026-04-10` | Specific date |
| `/briefing` | Run morning briefing prompt |
| **Ctrl+Shift+T** | Open todo list from anywhere |

### LLM Integration

The extension registers a `todo` tool and injects system prompt instructions automatically. Just say:

> "Add 'follow up with Alice on the API design' to my todo list"

The LLM will use the tool to add it to the right category. It also proactively adds items when it hears commitments.

### Categories

| Category | Auto-detected keywords |
|----------|----------------------|
| **Projects** | *(default)* |
| **Management** | 1:1, check in, feedback, mastery, onboard |
| **Reviews & Delegation** | review, PR, delegate, RFC |
| **Slack Replies Owed** | reply, slack, respond, DM |
| **Maintenance** | fix, clean, close, vault, stale, auth |

### Clickable Links

Markdown links in todo items render as clickable [OSC 8 hyperlinks](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5fede) in supporting terminals (Ghostty, iTerm2, Kitty, WezTerm):

```markdown
- [ ] Review Olavo's [#549326](https://github.com/shop/world/pull/549326) — navigate modality
```

Displays as: `○ Review Olavo's #549326 — navigate modality` (with `#549326` clickable)

### Two-File Architecture

| File | Purpose |
|------|---------|
| `~/.pi/agent/todo.md` | Active items only — stays small |
| `~/.pi/agent/todo-done.md` | Completion archive with dates |

Completed items get date-stamped (`— completed 2026-04-14`), appended to the done file, and stripped from the active file on save. The LLM only ever reads the active file.

---

## 🔧 Architecture

```
pi-status-line/
├── package.json          # Status line package (installed by default)
├── src/
│   ├── index.ts          # Powerline footer, segments, font detection
│   └── pr-count.ts       # Read-only PR collection, deduplication, cache and polling
├── tests/
│   └── pr-count.test.ts  # Counting, pagination, failures and lifecycle tests
├── todo/
│   ├── package.json      # Todo package (installed separately)
│   └── index.ts          # Interactive todo, LLM tool, done recap, commands
├── README.md
└── LICENSE
```

---

## 🤝 Contributing

```bash
git clone https://github.com/Fionoble/pi-status-line.git
cd pi-status-line

# Unit tests (no network or additional dependencies)
npm test

# Test status line only
pi -e ./src/index.ts

# Test both
pi -e ./src/index.ts -e ./todo/index.ts
```

TypeScript runs directly via jiti — no build step.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
