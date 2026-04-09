# pi-status-line

A powerline-style status line for [pi coding agent](https://github.com/badlogic/pi-mono), inspired by Claude Powerline.

## Preview

```
 ⬡ claude-sonnet-4-20250514  ◕ high  ↑12.3k ↓2.1k  $0.042          main  ⟳ 5  ✓ ready 
```

## Features

- **Model info** — Provider icon + model name with colored background
- **Thinking level** — Visual indicator (○◔◑◕●⬤) when reasoning is active
- **Token usage** — Input/output token counts (auto-formats k/M)
- **Cost tracking** — Running session cost
- **Git branch** — Current branch with  icon
- **Turn counter** — How many turns in the current session
- **Agent state** — Real-time indicator: ready / thinking / tools

All segments use powerline-style chevron separators () with smooth color transitions.

## Install

```bash
pi install /path/to/pi-status-line
# or
pi install git:github.com/Fionoble/pi-status-line
```

## Quick Test

```bash
pi -e /path/to/pi-status-line/src/index.ts
```

## Color Palette

| Segment   | Background     | Purpose           |
|-----------|----------------|-------------------|
| Model     | Indigo blue    | Primary identity  |
| Thinking  | Deep purple    | Reasoning level   |
| Tokens    | Forest green   | Usage tracking    |
| Cost      | Amber          | Spend awareness   |
| Git       | Warm brown     | Repository info   |
| Turns     | Steel blue     | Session progress  |
| State     | Indigo blue    | Agent activity    |

## How It Works

The extension replaces pi's default footer with a custom powerline renderer using `ctx.ui.setFooter()`. It subscribes to session, turn, tool, and model events to keep the status line current in real-time.

## License

MIT
