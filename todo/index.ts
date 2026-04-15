/**
 * Briefing Extension — Interactive todo list and daily briefing for pi
 *
 * Commands:
 *   /todo         — View and manage the todo list interactively
 *   /todo add     — Add item via inline text
 *   /briefing     — Run the morning briefing (triggers plan-my-day prompt)
 *
 * Widget:
 *   Shows overdue/stale item count in footer status bar
 *
 * The todo list lives at ~/.pi/agent/todo.md and is the source of truth.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TODO_PATH = join(homedir(), ".pi", "agent", "todo.md");
const DONE_PATH = join(homedir(), ".pi", "agent", "todo-done.md");

// ── Types ──────────────────────────────────────────────────────────────

interface TodoItem {
	text: string;
	done: boolean;
	raw: string; // original markdown line
}

interface TodoSection {
	name: string;
	items: TodoItem[];
}

// ── Parse / Serialize ──────────────────────────────────────────────────

function parseTodo(content: string): { preamble: string; sections: TodoSection[] } {
	const lines = content.split("\n");
	const sections: TodoSection[] = [];
	let preamble = "";
	let currentSection: TodoSection | null = null;
	let inPreamble = true;

	for (const line of lines) {
		const sectionMatch = line.match(/^## (.+)$/);
		if (sectionMatch) {
			inPreamble = false;
			currentSection = { name: sectionMatch[1], items: [] };
			sections.push(currentSection);
			continue;
		}

		if (inPreamble) {
			preamble += line + "\n";
			continue;
		}

		if (!currentSection) continue;

		const todoMatch = line.match(/^- \[([ x])\] (.+)$/);
		if (todoMatch) {
			currentSection.items.push({
				done: todoMatch[1] === "x",
				text: todoMatch[2],
				raw: line,
			});
		}
	}

	return { preamble, sections };
}

function serializeTodo(preamble: string, sections: TodoSection[]): string {
	let out = preamble;
	for (const section of sections) {
		out += `## ${section.name}\n\n`;
		if (section.items.length === 0) {
			out += "<!-- No items -->\n";
		} else {
			for (const item of section.items) {
				out += `- [${item.done ? "x" : " "}] ${item.text}\n`;
			}
		}
		out += "\n";
	}
	return out;
}

async function loadTodo(): Promise<{ preamble: string; sections: TodoSection[] }> {
	try {
		const content = await readFile(TODO_PATH, "utf8");
		return parseTodo(content);
	} catch {
		return {
			preamble: "# Todo\n\n",
			sections: [
				{ name: "Projects", items: [] },
				{ name: "Management", items: [] },
				{ name: "Reviews & Delegation", items: [] },
				{ name: "Slack Replies Owed", items: [] },
				{ name: "Maintenance", items: [] },
			],
		};
	}
}

async function saveTodo(preamble: string, sections: TodoSection[]): Promise<void> {
	// Strip completed items from active sections before saving
	for (const section of sections) {
		if (section.name === "Done") continue;
		section.items = section.items.filter((i) => !i.done);
	}
	// Remove the Done section from the main file entirely
	const activeSections = sections.filter((s) => s.name !== "Done");
	await writeFile(TODO_PATH, serializeTodo(preamble, activeSections), "utf8");
}

async function appendDone(item: TodoItem): Promise<void> {
	let content: string;
	try {
		content = await readFile(DONE_PATH, "utf8");
	} catch {
		content = "# Done\n\n> Completed todo items. Format: `- [x] item text — completed YYYY-MM-DD`\n\n";
	}
	content += `- [x] ${item.text}\n`;
	await writeFile(DONE_PATH, content, "utf8");
}

async function loadDoneItems(): Promise<TodoItem[]> {
	try {
		const content = await readFile(DONE_PATH, "utf8");
		const items: TodoItem[] = [];
		for (const line of content.split("\n")) {
			const match = line.match(/^- \[x\] (.+)$/);
			if (match) {
				items.push({ text: match[1], done: true, raw: line });
			}
		}
		return items;
	} catch {
		return [];
	}
}

async function removeDoneEntry(text: string): Promise<void> {
	try {
		const content = await readFile(DONE_PATH, "utf8");
		const lines = content.split("\n");
		const filtered = lines.filter((line) => {
			const match = line.match(/^- \[x\] (.+)$/);
			return !(match && match[1].includes(text));
		});
		await writeFile(DONE_PATH, filtered.join("\n"), "utf8");
	} catch {
		// File doesn't exist, nothing to remove
	}
}

// ── OSC 8 hyperlinks ───────────────────────────────────────────────────

/**
 * Wrap text in an OSC 8 hyperlink — makes it clickable in supporting terminals
 * (Ghostty, iTerm2, Kitty, WezTerm, Windows Terminal, etc.)
 */
function osc8(url: string, displayText: string): string {
	return `\x1b]8;;${url}\x1b\\${displayText}\x1b]8;;\x1b\\`;
}

/**
 * Convert markdown-style links [text](url) into OSC 8 clickable hyperlinks.
 * The URL is hidden — only the display text is visible and clickable.
 */
function renderLinks(text: string, styleFn?: (s: string) => string): string {
	return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, display, url) => {
		const styled = styleFn ? styleFn(display) : display;
		return osc8(url, styled);
	});
}

/**
 * Get the visible length of text after stripping markdown links down to display text.
 * Used for width calculations before rendering links.
 */
function visibleLenWithLinks(text: string): number {
	return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').length;
}

// ── Staleness helpers ──────────────────────────────────────────────────

function countStale(sections: TodoSection[]): { overdue: number; stale: number; total: number } {
	let overdue = 0;
	let stale = 0;
	let total = 0;
	for (const section of sections) {
		if (section.name === "Done") continue;
		for (const item of section.items) {
			if (item.done) continue;
			total++;
			if (item.text.includes("🔴 OVERDUE")) overdue++;
			else if (item.text.includes("⚠️ STALE")) stale++;
		}
	}
	return { overdue, stale, total };
}

// ── Section icons ──────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
	"Projects": "◆",
	"Management": "◉",
	"Reviews & Delegation": "⬡",
	"Slack Replies Owed": "◈",
	"Maintenance": "⚙",
	"Done": "✓",
};

function sectionIcon(name: string): string {
	return SECTION_ICONS[name] ?? "▸";
}

// ── ANSI helpers for the TUI ───────────────────────────────────────────

function rgb(r: number, g: number, b: number, text: string): string {
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function bgRgb(r: number, g: number, b: number, text: string): string {
	return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
}

function dim(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

// ── Interactive Todo List Component ────────────────────────────────────

class TodoListUI {
	private sections: TodoSection[];
	private preamble: string;
	private theme: Theme;
	private done: (value: boolean) => void;
	private selectedSection: number = 0;
	private selectedItem: number = 0;
	private dirty: boolean = false;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		preamble: string,
		sections: TodoSection[],
		theme: Theme,
		done: (value: boolean) => void,
	) {
		this.preamble = preamble;
		this.sections = sections.filter((s) => s.name !== "Done" || s.items.length > 0);
		this.theme = theme;
		this.done = done;
		for (let i = 0; i < this.sections.length; i++) {
			if (this.sections[i].items.length > 0 && this.sections[i].name !== "Done") {
				this.selectedSection = i;
				break;
			}
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q")) {
			if (this.dirty) {
				saveTodo(this.preamble, this.sections).then(() => this.done(true));
			} else {
				this.done(false);
			}
			return;
		}

		if (matchesKey(data, "return") || matchesKey(data, " ") || matchesKey(data, "x")) {
			this.toggleCurrent();
			return;
		}

		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.movePrev();
		} else if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.moveNext();
		} else if (matchesKey(data, "tab")) {
			this.nextSection();
		} else if (matchesKey(data, "shift+tab")) {
			this.prevSection();
		}

		this.cachedLines = undefined;
	}

	private toggleCurrent(): void {
		const section = this.sections[this.selectedSection];
		if (!section || section.items.length === 0) return;
		const item = section.items[this.selectedItem];
		if (!item) return;

		if (!item.done) {
			// Marking done — stamp date and append to done file
			item.done = true;
			const today = new Date().toISOString().slice(0, 10);
			item.text += ` — completed ${today}`;
			appendDone(item); // fire-and-forget, saved on close anyway
		} else {
			// Unchecking — remove date stamp and remove from done file
			const originalText = item.text.replace(/ — completed \d{4}-\d{2}-\d{2}$/, "");
			item.done = false;
			item.text = originalText;
			removeDoneEntry(originalText); // fire-and-forget
		}

		this.dirty = true;
		this.cachedLines = undefined;
	}

	private moveNext(): void {
		const section = this.sections[this.selectedSection];
		if (!section) return;
		if (this.selectedItem < section.items.length - 1) {
			this.selectedItem++;
		} else {
			for (let i = 1; i <= this.sections.length; i++) {
				const nextIdx = (this.selectedSection + i) % this.sections.length;
				if (this.sections[nextIdx].items.length > 0) {
					this.selectedSection = nextIdx;
					this.selectedItem = 0;
					break;
				}
			}
		}
	}

	private movePrev(): void {
		if (this.selectedItem > 0) {
			this.selectedItem--;
		} else {
			for (let i = 1; i <= this.sections.length; i++) {
				const prevIdx = (this.selectedSection - i + this.sections.length) % this.sections.length;
				if (this.sections[prevIdx].items.length > 0) {
					this.selectedSection = prevIdx;
					this.selectedItem = this.sections[prevIdx].items.length - 1;
					break;
				}
			}
		}
	}

	private nextSection(): void {
		for (let i = 1; i <= this.sections.length; i++) {
			const nextIdx = (this.selectedSection + i) % this.sections.length;
			if (this.sections[nextIdx].items.length > 0) {
				this.selectedSection = nextIdx;
				this.selectedItem = 0;
				break;
			}
		}
		this.cachedLines = undefined;
	}

	private prevSection(): void {
		for (let i = 1; i <= this.sections.length; i++) {
			const prevIdx = (this.selectedSection - i + this.sections.length) % this.sections.length;
			if (this.sections[prevIdx].items.length > 0) {
				this.selectedSection = prevIdx;
				this.selectedItem = 0;
				break;
			}
		}
		this.cachedLines = undefined;
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const th = this.theme;

		const counts = countStale(this.sections);

		// ── Header ──────────────────────────────────────────
		lines.push("");
		const title = th.fg("accent", th.bold("Todo List"));
		let stats = th.fg("dim", `${counts.total} open`);
		if (counts.overdue > 0) stats += th.fg("error", `  🔴 ${counts.overdue} overdue`);
		if (counts.stale > 0) stats += th.fg("warning", `  ⚠ ${counts.stale} stale`);
		lines.push(truncateToWidth(`  ${title}  ${stats}`, width));
		lines.push(truncateToWidth(`  ${th.fg("muted", "─".repeat(width - 4))}`, width));

		// ── Sections ────────────────────────────────────────
		for (let si = 0; si < this.sections.length; si++) {
			const section = this.sections[si];
			const isActiveSection = si === this.selectedSection;
			const openCount = section.items.filter((i) => !i.done).length;
			const icon = sectionIcon(section.name);

			// Section header
			lines.push("");
			if (isActiveSection) {
				const badge = openCount > 0 ? th.fg("accent", ` (${openCount})`) : "";
				lines.push(truncateToWidth(`  ${th.fg("accent", icon)} ${th.fg("accent", th.bold(section.name))}${badge}`, width));
			} else {
				const badge = openCount > 0 ? th.fg("dim", ` (${openCount})`) : "";
				lines.push(truncateToWidth(`  ${th.fg("muted", icon)} ${th.fg("muted", section.name)}${badge}`, width));
			}

			if (section.items.length === 0) {
				lines.push(truncateToWidth(`      ${th.fg("dim", "─ empty ─")}`, width));
			} else {
				for (let ii = 0; ii < section.items.length; ii++) {
					const item = section.items[ii];
					const isSelected = isActiveSection && ii === this.selectedItem;

					// Checkbox
					let checkbox: string;
					if (item.done) {
						checkbox = th.fg("success", "◼");
					} else if (item.text.includes("🔴 OVERDUE")) {
						checkbox = th.fg("error", "○");
					} else if (item.text.includes("⚠️ STALE")) {
						checkbox = th.fg("warning", "○");
					} else {
						checkbox = th.fg("dim", "○");
					}

					// Cursor
					const cursor = isSelected ? th.fg("accent", "  ▸ ") : "    ";

					// Item text — strip markers for display
					let text = item.text
						.replace(/🔴 OVERDUE /g, "")
						.replace(/⚠️ STALE /g, "");

					// Style based on state, then render markdown links as clickable OSC 8 hyperlinks
					let styledText: string;
					if (item.done) {
						styledText = renderLinks(text, (s) => th.fg("dim", th.strikethrough(s)));
					} else if (isSelected) {
						if (item.text.includes("🔴 OVERDUE")) {
							styledText = renderLinks(text, (s) => th.fg("error", th.bold(s)));
						} else if (item.text.includes("⚠️ STALE")) {
							styledText = renderLinks(text, (s) => th.fg("warning", th.bold(s)));
						} else {
							styledText = renderLinks(text, (s) => th.bold(s));
						}
					} else if (item.text.includes("🔴 OVERDUE")) {
						styledText = renderLinks(text, (s) => th.fg("error", s));
					} else if (item.text.includes("⚠️ STALE")) {
						styledText = renderLinks(text, (s) => th.fg("warning", s));
					} else {
						styledText = renderLinks(text);
					}

					lines.push(truncateToWidth(`${cursor}${checkbox} ${styledText}`, width));
				}
			}
		}

		// ── Footer ──────────────────────────────────────────
		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("muted", "─".repeat(width - 4))}`, width));

		const keys = [
			`${th.fg("accent", "↑↓")} ${th.fg("dim", "navigate")}`,
			`${th.fg("accent", "space")} ${th.fg("dim", "toggle")}`,
			`${th.fg("accent", "tab")} ${th.fg("dim", "section")}`,
			`${th.fg("accent", "q")} ${th.fg("dim", "close")}`,
		];
		lines.push(truncateToWidth(`  ${keys.join(th.fg("muted", "  ·  "))}`, width));

		if (this.dirty) {
			lines.push(truncateToWidth(`  ${th.fg("success", "●")} ${th.fg("dim", "Changes will be saved on close")}`, width));
		}
		lines.push("");

		return lines;
	}
}

// ── Extension ──────────────────────────────────────────────────────────

// ── Done Recap UI Component ────────────────────────────────────────────

class DoneRecapUI {
	private items: TodoItem[];
	private label: string;
	private theme: Theme;
	private done: () => void;

	constructor(items: TodoItem[], label: string, theme: Theme, done: () => void) {
		this.items = items;
		this.label = label;
		this.theme = theme;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "return")) {
			this.done();
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = `${th.fg("success", "✓")} ${th.fg("accent", th.bold("Completed"))} ${th.fg("dim", `— ${this.label}`)}`;
		const countText = th.fg("dim", `${this.items.length} item${this.items.length === 1 ? "" : "s"}`);
		lines.push(truncateToWidth(`  ${title}  ${countText}`, width));
		lines.push(truncateToWidth(`  ${th.fg("muted", "─".repeat(width - 4))}`, width));

		// Group by date
		const byDate = new Map<string, TodoItem[]>();
		for (const item of this.items) {
			const dateMatch = item.text.match(/completed (\d{4}-\d{2}-\d{2})/);
			const date = dateMatch ? dateMatch[1] : "unknown";
			if (!byDate.has(date)) byDate.set(date, []);
			byDate.get(date)!.push(item);
		}

		const dates = [...byDate.keys()].sort().reverse();

		for (const date of dates) {
			const dateItems = byDate.get(date)!;
			const dateLabel = date === new Date().toISOString().slice(0, 10) ? `${date} (today)`
				: date === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? `${date} (yesterday)`
				: date;

			lines.push("");
			lines.push(truncateToWidth(`  ${th.fg("accent", th.bold(dateLabel))}`, width));

			for (const item of dateItems) {
				let text = item.text.replace(/ — completed \d{4}-\d{2}-\d{2}$/, "");
				text = text.replace(/🔴 OVERDUE /g, "").replace(/⚠️ STALE /g, "");

				const linkedText = renderLinks(text);
				lines.push(truncateToWidth(`    ${th.fg("success", "✓")} ${linkedText}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("muted", "─".repeat(width - 4))}`, width));
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press")} ${th.fg("accent", "q")} ${th.fg("dim", "or")} ${th.fg("accent", "esc")} ${th.fg("dim", "to close")}`, width));
		lines.push("");

		return lines;
	}
}

const CATEGORY_NAMES = ["Projects", "Management", "Reviews & Delegation", "Slack Replies Owed", "Maintenance"];

export default function (pi: ExtensionAPI) {
	// ── System prompt injection ─────────────────────────────────────
	// This makes the LLM aware of the todo list on every turn, without
	// requiring the user to set up AGENTS.md manually.
	pi.on("before_agent_start", async (event, _ctx) => {
		return {
			systemPrompt: event.systemPrompt + `\n\n## Todo List

A persistent todo list exists at ~/.pi/agent/todo.md. Use the \`todo\` tool to manage it.
When the user says "add X to my todo", "remind me to Y", or makes a commitment like "I'll do X", use the todo tool to add it.
Categories: ${CATEGORY_NAMES.join(", ")}.
When a task is done, use the todo tool to complete it.`,
		};
	});

	// ── Todo tool for the LLM ───────────────────────────────────────
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: "Manage the persistent todo list at ~/.pi/agent/todo.md. Use this to add, complete, list, or remove tasks.",
		promptSnippet: "Add, complete, list, or remove items from the persistent todo list",
		promptGuidelines: [
			"Use this tool when the user asks to add something to their todo list, mark something done, or check their tasks.",
			"When you notice the user making a commitment ('I'll do X', 'remind me to Y'), proactively add it.",
			"Auto-categorize: reviews/PRs → 'Reviews & Delegation', replies/Slack → 'Slack Replies Owed', people/1:1/feedback → 'Management', cleanup/fix → 'Maintenance', everything else → 'Projects'.",
		],
		parameters: Type.Object({
			action: StringEnum(["add", "complete", "remove", "list"] as const),
			text: Type.Optional(Type.String({ description: "Task text (for add) or substring to match (for complete/remove)" })),
			category: Type.Optional(StringEnum(["Projects", "Management", "Reviews & Delegation", "Slack Replies Owed", "Maintenance"] as const)),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { preamble, sections } = await loadTodo();

			if (params.action === "list") {
				const lines: string[] = [];
				for (const section of sections) {
					if (section.name === "Done") continue;
					const open = section.items.filter((i) => !i.done);
					if (open.length === 0) continue;
					lines.push(`## ${section.name} (${open.length})`);
					for (const item of open) {
						lines.push(`- [ ] ${item.text}`);
					}
					lines.push("");
				}
				return {
					content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "Todo list is empty." }],
					details: {},
				};
			}

			if (params.action === "add") {
				if (!params.text) {
					throw new Error("text is required for add action");
				}
				// Determine category
				let categoryName = params.category;
				if (!categoryName) {
					const lower = params.text.toLowerCase();
					if (lower.includes("review") || lower.includes("pr ") || lower.includes("pr#") || lower.includes("delegate") || lower.includes("rfc")) {
						categoryName = "Reviews & Delegation";
					} else if (lower.includes("reply") || lower.includes("slack") || lower.includes("respond") || lower.includes("dm ")) {
						categoryName = "Slack Replies Owed";
					} else if (lower.includes("1:1") || lower.includes("check in") || lower.includes("feedback") || lower.includes("mastery") || lower.includes("onboard")) {
						categoryName = "Management";
					} else if (lower.includes("fix") || lower.includes("clean") || lower.includes("close") || lower.includes("vault") || lower.includes("stale") || lower.includes("auth")) {
						categoryName = "Maintenance";
					} else {
						categoryName = "Projects";
					}
				}

				let section = sections.find((s) => s.name === categoryName);
				if (!section) {
					section = { name: categoryName!, items: [] };
					sections.push(section);
				}

				section.items.push({ text: params.text, done: false, raw: `- [ ] ${params.text}` });
				await saveTodo(preamble, sections);
				return {
					content: [{ type: "text", text: `Added to ${categoryName}: ${params.text}` }],
					details: {},
				};
			}

			if (params.action === "complete" || params.action === "remove") {
				if (!params.text) {
					throw new Error("text is required to identify which item to " + params.action);
				}
				const lower = params.text.toLowerCase();
				for (const section of sections) {
					for (const item of section.items) {
						if (item.text.toLowerCase().includes(lower) && !item.done) {
							if (params.action === "complete") {
								item.done = true;
								item.text += ` — completed ${new Date().toISOString().slice(0, 10)}`;
								// Append to done file (separate from active todos)
								await appendDone(item);
							} else {
								// Remove
								const idx = section.items.indexOf(item);
								section.items.splice(idx, 1);
							}
							await saveTodo(preamble, sections);
							return {
								content: [{ type: "text", text: `${params.action === "complete" ? "Completed" : "Removed"}: ${item.text}` }],
								details: {},
							};
						}
					}
				}
				return {
					content: [{ type: "text", text: `No open item matching "${params.text}" found.` }],
					details: {},
				};
			}

			throw new Error(`Unknown action: ${params.action}`);
		},
	});

	// /todo command — interactive todo list
	pi.registerCommand("todo", {
		description: "View and manage your todo list",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Todo list requires interactive mode", "error");
				return;
			}

			// /todo done [filter] — alias for /done
			if (args && (args === "done" || args.startsWith("done "))) {
				const doneArgs = args.slice(4).trim() || undefined;
				await pi.executeCommand("done", doneArgs, ctx);
				return;
			}

			// /todo add <text> — quick add
			if (args && args.startsWith("add ")) {
				const text = args.slice(4).trim();
				if (!text) {
					ctx.ui.notify("Usage: /todo add <text>", "error");
					return;
				}
				const { preamble, sections } = await loadTodo();
				// Default to Projects if no category signal
				let targetSection = sections.find((s) => s.name === "Projects");
				// Try to auto-categorize
				const lower = text.toLowerCase();
				if (lower.includes("review") || lower.includes("pr ") || lower.includes("delegate")) {
					targetSection = sections.find((s) => s.name === "Reviews & Delegation") ?? targetSection;
				} else if (lower.includes("reply") || lower.includes("slack") || lower.includes("respond")) {
					targetSection = sections.find((s) => s.name === "Slack Replies Owed") ?? targetSection;
				} else if (lower.includes("1:1") || lower.includes("check in") || lower.includes("feedback") || lower.includes("mastery")) {
					targetSection = sections.find((s) => s.name === "Management") ?? targetSection;
				} else if (lower.includes("fix") || lower.includes("clean") || lower.includes("close") || lower.includes("vault")) {
					targetSection = sections.find((s) => s.name === "Maintenance") ?? targetSection;
				}

				if (targetSection) {
					targetSection.items.push({ text, done: false, raw: `- [ ] ${text}` });
					await saveTodo(preamble, sections);
					ctx.ui.notify(`Added to ${targetSection.name}: ${text}`, "info");
				}
				return;
			}

			// Interactive view
			const { preamble, sections } = await loadTodo();

			await ctx.ui.custom<boolean>((_tui, theme, _keybindings, done) => {
				const component = new TodoListUI(preamble, sections, theme, done);
				return component as any;
			});
		},
	});

	// /done [date|yesterday|week] — show completed items
	pi.registerCommand("done", {
		description: "Show completed todo items (today, yesterday, this week, or a specific date)",
		handler: async (args, ctx) => {
			const allDone = await loadDoneItems();
			if (allDone.length === 0) {
				ctx.ui.notify("No completed items yet.", "info");
				return;
			}

			// Parse the date filter
			const today = new Date().toISOString().slice(0, 10);
			const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
			const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

			let filterDate: string | null = null;
			let filterLabel: string;
			let filterFn: (text: string) => boolean;

			const arg = (args || "").trim().toLowerCase();
			if (!arg || arg === "today") {
				filterDate = today;
				filterLabel = `Today (${today})`;
				filterFn = (text) => text.includes(`completed ${today}`);
			} else if (arg === "yesterday") {
				filterDate = yesterday;
				filterLabel = `Yesterday (${yesterday})`;
				filterFn = (text) => text.includes(`completed ${yesterday}`);
			} else if (arg === "week" || arg === "this week") {
				filterLabel = `This week (since ${weekAgo})`;
				filterFn = (text) => {
					const match = text.match(/completed (\d{4}-\d{2}-\d{2})/);
					return match ? match[1] >= weekAgo : false;
				};
			} else if (arg.match(/^\d{4}-\d{2}-\d{2}$/)) {
				filterDate = arg;
				filterLabel = arg;
				filterFn = (text) => text.includes(`completed ${arg}`);
			} else {
				// Try to find items matching the text
				const lower = arg;
				filterLabel = `matching "${arg}"`;
				filterFn = (text) => text.toLowerCase().includes(lower);
			}

			const filtered = allDone.filter((item) => filterFn(item.text));

			if (filtered.length === 0) {
				ctx.ui.notify(`No items completed ${filterLabel}.`, "info");
				return;
			}

			if (!ctx.hasUI) {
				// Non-interactive: just print
				const lines = [`Completed ${filterLabel}: ${filtered.length} items\n`];
				for (const item of filtered) {
					lines.push(`  ✓ ${renderLinks(item.text)}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// Interactive view
			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
				const component = new DoneRecapUI(filtered, filterLabel, theme, () => done());
				return component as any;
			});
		},
	});

	// /briefing command — trigger the morning briefing
	pi.registerCommand("briefing", {
		description: "Run the morning briefing (scans Slack, GitHub, resiliency, todo list)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Starting morning briefing...", "info");
			// Trigger the plan-my-day prompt via a user message
			pi.sendUserMessage("/plan-my-day", { deliverAs: "followUp" });
		},
	});

	// Keyboard shortcut: Ctrl+T to open todo
	pi.registerShortcut("ctrl+shift+t", {
		description: "Open todo list",
		handler: async (ctx) => {
			// Trigger the todo command
			const { preamble, sections } = await loadTodo();
			await ctx.ui.custom<boolean>((_tui, theme, _keybindings, done) => {
				const component = new TodoListUI(preamble, sections, theme, done);
				return component as any;
			});
		},
	});
}
