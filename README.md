# ⚡ pi-status-line

A **powerline-style status line** for the [pi coding agent](https://github.com/badlogic/pi-mono) — replacing the default footer with a rich, information-dense bar.

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042  📋 8 todo     📂 …/my/project   main  ⟳ 5  ✓ ready 
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

### Left Side — Model, Usage & Todo

| Segment | Icon | Description |
|---------|------|-------------|
| **Model** | `⬡` `◈` `◆` `⊙` `▸` | Active model with provider icon |
| **Thinking** | `○` `◔` `◑` `◕` `●` `⬤` | Reasoning level — hidden when `off` |
| **Tokens** | `↑` `↓` | Cumulative input/output tokens, auto-formatted |
| **Cost** | `$` | Session cost — hidden when zero |
| **Todo** | `📋` `⚠` `🔴` | Open todo count — hidden when no `~/.pi/agent/todo.md` exists |

### Right Side — Context & State

| Segment | Icon | Description |
|---------|------|-------------|
| **Working dir** | `📂` | Last two path components, `~` for home |
| **Git branch** | `` | Hidden when not in a git repo |
| **Turns** | `⟳` | Turn count, restored on resume |
| **Agent state** | `✓` `◉` `⚙` | `ready` / `thinking` / `tools` |

### Todo Segment

The todo segment reads `~/.pi/agent/todo.md` if it exists. Three visual states:

| State | Color | Example |
|-------|-------|---------|
| Normal | Green | `📋 12 todo` |
| Has stale items (⚠️ STALE prefix) | Amber | `⚠ 3 stale · 12 todo` |
| Has overdue items (🔴 OVERDUE prefix) | Red | `🔴 2 overdue · 12 todo` |
| Empty / no file | Hidden | *(segment not shown)* |

This works with any markdown todo file that uses `- [ ]` checkboxes — you don't need the pi-todo extension. But they pair well together.

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
| Todo (normal) | `rgb(40, 65, 45)` |
| Todo (stale) | `rgb(90, 75, 35)` |
| Todo (overdue) | `rgb(100, 40, 40)` |
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
│   └── index.ts          # Powerline footer, segments, font detection, todo counts
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

# Test status line only
pi -e ./src/index.ts

# Test both
pi -e ./src/index.ts -e ./todo/index.ts
```

TypeScript runs directly via jiti — no build step.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
