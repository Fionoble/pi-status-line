import { execFile } from "node:child_process";

export const REFRESH_MS = 5 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELTA_HOST = "https://delta.shopify.io";

type Row = Record<string, any>;
export type JsonRunner = (command: string, args: string[], signal: AbortSignal) => Promise<unknown>;

/** No shell, interactive login, or writes. Bound both execution time and output. */
export const runJson: JsonRunner = (command, args, signal) => new Promise((resolve, reject) => {
  execFile(command, args, {
    signal, timeout: 20_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8",
  }, (error, stdout) => {
    if (error) { reject(new Error(`${command} PR read failed`)); return; }
    try { resolve(JSON.parse(stdout)); }
    catch { reject(new Error(`${command} returned invalid JSON`)); }
  });
});

function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed PR response");
  return value as Row;
}

async function search(
  source: "github" | "delta", query: string, signal: AbortSignal, run: JsonRunner, repo?: string,
): Promise<Row[]> {
  const items: Row[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 10; page++) {
    signal.throwIfAborted();
    const params = new URLSearchParams({ q: query, per_page: "100", page: String(page) });
    const response = object(await run(source === "github" ? "gh" : "dt", source === "github"
      ? ["api", "--method", "GET", `search/issues?${params}`]
      : ["api", "--host", DELTA_HOST, "--repo", repo!, `/api/v3/search/issues?${params}`], signal));
    if (!Array.isArray(response.items) || !Number.isSafeInteger(response.total_count) ||
      response.total_count < 0 || response.total_count > 1000 || response.incomplete_results !== false ||
      (total !== undefined && total !== response.total_count) || response.items.length > 100) {
      throw new Error("Incomplete PR search");
    }
    total = response.total_count as number;
    for (const value of response.items) {
      const row = object(value);
      if (typeof row.html_url !== "string" || seen.has(row.html_url)) throw new Error("Malformed PR search page");
      seen.add(row.html_url);
      items.push(row);
    }
    if (items.length === total) return items;
    if (items.length > total || response.items.length < 100) throw new Error("Incomplete PR search page");
  }
  throw new Error("PR search exceeds page limit");
}

/** The repository + PR number survives a GitHub-to-Delta migration. */
function prKey(row: Row): string {
  const url = new URL(row.html_url);
  const match = /^\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)$/.exec(url.pathname);
  if (!["github.com", "delta.shopify.io"].includes(url.hostname) || url.protocol !== "https:" || !match) {
    throw new Error("Invalid PR URL");
  }
  return `${match[1].toLowerCase()}#${match[2]}`;
}

export function deltaRepositories(value = process.env.PI_STATUS_DELTA_REPOS ?? "shop/world"): string[] {
  const repos = [...new Set(value.split(",").map((repo) => repo.trim().toLowerCase()))];
  if (!repos.length || repos.length > 20 || repos.some((repo) => !/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(repo))) {
    throw new Error("Invalid PI_STATUS_DELTA_REPOS");
  }
  return repos;
}

/** Fail the whole snapshot if either source is unavailable; never present a partial total. */
export async function collectPrCount(
  now: number, signal: AbortSignal, run: JsonRunner = runJson, repos = deltaRepositories(),
): Promise<number> {
  const user = object(await run("gh", ["api", "user"], signal));
  if (typeof user.login !== "string" || !/^[\w-]+$/.test(user.login)) throw new Error("Invalid GitHub identity");
  const from = now - WEEK_MS;
  const range = `merged:${new Date(from).toISOString()}..${new Date(now).toISOString()}`;
  const [github, ...delta] = await Promise.all([
    search("github", `is:pr is:merged author:${user.login} ${range}`, signal, run),
    ...repos.map(async (repo) => {
      const base = `repo:${repo} is:pr is:merged ${range}`;
      const [authored, assigned] = await Promise.all([
        search("delta", `${base} author:@me`, signal, run, repo),
        search("delta", `${base} assignee:@me`, signal, run, repo),
      ]);
      return [...authored, ...assigned.filter((row) => {
        const user = object(row.user);
        return user.service_brand?.display_name === "River" || /^shopify-river(?:\[bot\])?$/.test(user.login);
      })];
    }),
  ]);
  const keys = new Set<string>();
  for (const row of [...github, ...delta.flat()]) {
    const timestamp = row.merged_at ?? row.pull_request?.merged_at;
    const mergedAt = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(mergedAt)) throw new Error("Missing PR merge timestamp");
    // Enforce the exact rolling window even if a provider's date filtering is coarse.
    if (mergedAt >= from && mergedAt <= now) keys.add(prKey(row));
  }
  return keys.size;
}

export interface PrSnapshot {
  count?: number;
  checkedAt?: number;
  failed: boolean;
}

export function prSegment(snapshot: PrSnapshot, now = Date.now()): { text: string; warning: boolean } {
  if (snapshot.count === undefined) {
    return { text: `PRs 7d: ${snapshot.failed ? "unavailable" : "…"}`, warning: snapshot.failed };
  }
  const stale = snapshot.failed || snapshot.checkedAt === undefined || now - snapshot.checkedAt > REFRESH_MS;
  return { text: `PRs 7d: ${snapshot.count}${stale ? " (stale)" : ""}`, warning: stale };
}

/** Memory cache is shared by footer replacements, not by render calls. */
export class PrCountPoller {
  snapshot: PrSnapshot = { failed: false };
  private timer?: ReturnType<typeof setInterval>;
  private controller?: AbortController;
  private pending?: Promise<void>;
  private listeners = new Set<() => void>();

  private collect: typeof collectPrCount;
  private now: () => number;

  constructor(collect = collectPrCount, now = Date.now) {
    this.collect = collect;
    this.now = now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, REFRESH_MS);
    this.timer.unref();
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    const controller = new AbortController();
    this.controller = controller;
    const checkedAt = this.now();
    this.pending = (async () => {
      try {
        const count = await this.collect(checkedAt, controller.signal);
        if (!controller.signal.aborted) this.snapshot = { count, checkedAt, failed: false };
      } catch {
        // Preserve the last complete value, visibly marked stale; never substitute zero.
        if (!controller.signal.aborted) this.snapshot = { ...this.snapshot, failed: true };
      } finally {
        if (this.controller === controller) {
          this.controller = undefined;
          this.pending = undefined;
        }
        if (!controller.signal.aborted) for (const listener of this.listeners) listener();
      }
    })();
    return this.pending;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
    this.listeners.clear();
  }
}
