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
				{ name: "Done", items: [] },
			],
		};
	}
}

async function saveTodo(preamble: string, sections: TodoSection[]): Promise<void> {
	await writeFile(TODO_PATH, serializeTodo(preamble, sections), "utf8");
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
		// Start on first non-empty section
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
		item.done = !item.done;
		this.dirty = true;
		this.cachedLines = undefined;
	}

	private moveNext(): void {
		const section = this.sections[this.selectedSection];
		if (!section) return;
		if (this.selectedItem < section.items.length - 1) {
			this.selectedItem++;
		} else {
			// Wrap to next section with items
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

		// Header
		lines.push("");
		const counts = countStale(this.sections);
		const title = th.fg("accent", th.bold(" Todo List "));
		const stats = th.fg("dim", `${counts.total} open`);
		const overdueStats = counts.overdue > 0 ? th.fg("error", ` · ${counts.overdue} overdue`) : "";
		const staleStats = counts.stale > 0 ? th.fg("warning", ` · ${counts.stale} stale`) : "";
		lines.push(truncateToWidth(`  ${title} ${stats}${overdueStats}${staleStats}`, width));
		lines.push(truncateToWidth(`  ${th.fg("dim", "─".repeat(Math.min(width - 4, 60)))}`, width));
		lines.push("");

		// Sections
		for (let si = 0; si < this.sections.length; si++) {
			const section = this.sections[si];
			const isActiveSection = si === this.selectedSection;
			const sectionStyle = isActiveSection ? "accent" : "muted";
			const openCount = section.items.filter((i) => !i.done).length;
			const sectionLabel = `${section.name}${openCount > 0 ? ` (${openCount})` : ""}`;
			lines.push(truncateToWidth(`  ${th.fg(sectionStyle as any, th.bold(sectionLabel))}`, width));

			if (section.items.length === 0) {
				lines.push(truncateToWidth(`    ${th.fg("dim", "empty")}`, width));
			} else {
				for (let ii = 0; ii < section.items.length; ii++) {
					const item = section.items[ii];
					const isSelected = isActiveSection && ii === this.selectedItem;
					const checkbox = item.done ? th.fg("success", "✓") : "○";
					const indicator = isSelected ? th.fg("accent", "▸ ") : "  ";

					let text = item.text
						.replace("🔴 OVERDUE ", "")
						.replace("⚠️ STALE ", "");

					// Apply styling based on state
					let styledText: string;
					if (item.done) {
						styledText = th.fg("dim", th.strikethrough(text));
					} else if (item.text.includes("🔴 OVERDUE")) {
						styledText = th.fg("error", text);
					} else if (item.text.includes("⚠️ STALE")) {
						styledText = th.fg("warning", text);
					} else {
						styledText = text;
					}

					const line = `  ${indicator}${checkbox} ${styledText}`;
					lines.push(truncateToWidth(line, width));
				}
			}
			lines.push("");
		}

		// Footer hints
		lines.push(
			truncateToWidth(
				`  ${th.fg("dim", "↑↓/jk navigate · space/x toggle · tab section · q/esc close")}`,
				width,
			),
		);
		if (this.dirty) {
			lines.push(truncateToWidth(`  ${th.fg("success", "● Changes will be saved on close")}`, width));
		}
		lines.push("");

		return lines;
	}
}

// ── Extension ──────────────────────────────────────────────────────────

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
					// Insert before Done
					const doneIdx = sections.findIndex((s) => s.name === "Done");
					if (doneIdx >= 0) sections.splice(doneIdx, 0, section);
					else sections.push(section);
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
								// Also add to Done section
								const doneSection = sections.find((s) => s.name === "Done");
								if (doneSection) {
									doneSection.items.push({ text: item.text, done: true, raw: `- [x] ${item.text}` });
								}
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
	pi.registerShortcut("ctrl+t", {
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
