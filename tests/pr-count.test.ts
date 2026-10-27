import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPrCount, deltaRepositories, PrCountPoller, prSegment, REFRESH_MS, type JsonRunner } from "../src/pr-count.ts";

const NOW = Date.parse("2026-10-27T15:00:00Z");
const WEEK = 7 * 24 * 60 * 60 * 1000;
const row = (number: number, extra: Record<string, unknown> = {}) => ({
  html_url: `https://delta.shopify.io/shop/world/pull/${number}`,
  merged_at: new Date(NOW - 1000).toISOString(),
  user: { login: "aquifer-sandbox-runtime@shopify-aquifer.iam.gserviceaccount.com", service_brand: { display_name: "River" } },
  ...extra,
});
const page = (items: unknown[], extra = {}) => ({ items, total_count: items.length, incomplete_results: false, ...extra });

type Search = (source: string, query: string, pageNumber: number) => unknown;
function runner(search: Search): JsonRunner {
  return async (command, args, signal) => {
    signal.throwIfAborted();
    if (command === "gh" && args.at(-1) === "user") return { login: "Fionoble" };
    const params = new URLSearchParams(args.at(-1)!.split("?")[1]);
    return search(command, params.get("q")!, Number(params.get("page")));
  };
}
const signal = () => new AbortController().signal;

test("counts GitHub + Delta authored + River assigned, deduplicating both sources and queries", async () => {
  const run = runner((source, query) => {
    if (source === "gh") return page([row(1, { html_url: "https://github.com/shop/world/pull/1" })]);
    if (query.includes("author:@me")) return page([row(1), row(2)]);
    return page([row(2), row(3), row(4, { user: { login: "translation-platform[bot]" } })]);
  });
  assert.equal(await collectPrCount(NOW, signal(), run), 3);
});

test("uses exact rolling 168-hour merge times, not created/updated dates", async () => {
  const run = runner((source, query) => {
    assert.ok(query.includes("merged:2026-10-20T15:00:00.000Z..2026-10-27T15:00:00.000Z"));
    if (source === "gh" || query.includes("author:@me")) return page([]);
    return page([
      row(1, { merged_at: new Date(NOW - WEEK - 1).toISOString() }),
      row(2, { merged_at: new Date(NOW - WEEK).toISOString() }),
      row(3, { merged_at: new Date(NOW).toISOString() }),
      row(4, { merged_at: new Date(NOW + 1).toISOString() }),
    ]);
  });
  assert.equal(await collectPrCount(NOW, signal(), run), 2);
});

test("supports GitHub search timestamp shape and legacy River identities", async () => {
  const run = runner((source, query) => {
    if (source === "gh") return page([row(1, { merged_at: undefined, pull_request: { merged_at: new Date(NOW).toISOString() } })]);
    if (query.includes("author:@me")) return page([]);
    return page([row(2, { user: { login: "shopify-river" } }), row(3, { user: { login: "shopify-river[bot]" } })]);
  });
  assert.equal(await collectPrCount(NOW, signal(), run), 3);
});

test("paginates completely, including multiple configured Delta repos", async () => {
  const run = runner((source, query, number) => {
    if (source === "gh" || query.includes("author:@me")) return page([]);
    if (query.includes("repo:shop/other")) return page([row(999, { html_url: "https://delta.shopify.io/shop/other/pull/999" })]);
    return number === 1
      ? page(Array.from({ length: 100 }, (_, i) => row(i + 1)), { total_count: 101 })
      : page([row(101)], { total_count: 101 });
  });
  assert.equal(await collectPrCount(NOW, signal(), run, ["shop/world", "shop/other"]), 102);
});

for (const [name, bad] of Object.entries({
  incomplete: page([], { incomplete_results: true }),
  capped: page([], { total_count: 1001 }),
  short: page([], { total_count: 5 }),
  duplicate: page([row(1), row(1)]),
  timestamp: page([row(1, { merged_at: null })]),
  url: page([row(1, { html_url: "https://evil.example/shop/world/pull/1" })]),
  malformed: {},
})) {
  test(`rejects ${name} data rather than displaying a false count`, async () => {
    await assert.rejects(collectPrCount(NOW, signal(), runner(() => bad)));
  });
}

test("source failures reject a partially successful snapshot", async () => {
  await assert.rejects(collectPrCount(NOW, signal(), runner((source) => {
    if (source === "dt") throw new Error("expired Delta auth");
    return page([row(1)]);
  })));
  await assert.rejects(collectPrCount(NOW, signal(), async () => { throw new Error("gh missing"); }));
});

test("rejects changing pagination totals", async () => {
  const run = runner((source, query, number) => {
    if (source === "gh" || query.includes("author:@me")) return page([]);
    return number === 1
      ? page(Array.from({ length: 100 }, (_, i) => row(i + 1)), { total_count: 101 })
      : page([row(101)], { total_count: 102 });
  });
  await assert.rejects(collectPrCount(NOW, signal(), run));
});

test("accepts true zero and validates Delta repository configuration", async () => {
  assert.equal(await collectPrCount(NOW, signal(), runner(() => page([]))), 0);
  assert.deepEqual(deltaRepositories("shop/world,SHOP/World, shop/other"), ["shop/world", "shop/other"]);
  for (const value of ["", "shop/world,", "../bad", "shop/world is:open"]) {
    assert.throws(() => deltaRepositories(value));
  }
});

test("shows loading, unavailable, fresh zero, and stale snapshots distinctly", () => {
  assert.deepEqual(prSegment({ failed: false }), { text: "PRs 7d: …", warning: false });
  assert.deepEqual(prSegment({ failed: true }), { text: "PRs 7d: unavailable", warning: true });
  assert.deepEqual(prSegment({ count: 0, checkedAt: NOW, failed: false }, NOW), { text: "PRs 7d: 0", warning: false });
  assert.equal(prSegment({ count: 16, checkedAt: NOW, failed: true }, NOW).text, "PRs 7d: 16 (stale)");
  assert.equal(prSegment({ count: 16, checkedAt: NOW, failed: false }, NOW + REFRESH_MS + 1).warning, true);
});

test("poller retains last complete value on failure and recovers", async () => {
  let fail = false;
  let count = 12;
  let renders = 0;
  const poller = new PrCountPoller(async () => {
    if (fail) throw new Error("offline");
    return count;
  }, () => NOW);
  const unsubscribe = poller.subscribe(() => { renders++; });
  await poller.refresh();
  assert.deepEqual(poller.snapshot, { count: 12, checkedAt: NOW, failed: false });
  fail = true;
  await poller.refresh();
  assert.deepEqual(poller.snapshot, { count: 12, checkedAt: NOW, failed: true });
  fail = false;
  count = 13;
  await poller.refresh();
  assert.equal(poller.snapshot.count, 13);
  assert.equal(poller.snapshot.failed, false);
  assert.equal(renders, 3);
  unsubscribe();
  await poller.refresh();
  assert.equal(renders, 3);
  poller.stop();
});

test("poller starts once, coalesces reads, and cancels work on shutdown", async () => {
  let calls = 0;
  let captured: AbortSignal | undefined;
  let finish!: (count: number) => void;
  const poller = new PrCountPoller((_now, signal) => {
    calls++;
    captured = signal;
    return new Promise<number>((resolve) => { finish = resolve; });
  }, () => NOW);
  poller.start();
  poller.start();
  const first = poller.refresh();
  assert.equal(first, poller.refresh());
  assert.equal(calls, 1);
  poller.stop();
  assert.equal(captured?.aborted, true);
  finish(100);
  await first;
  assert.equal(poller.snapshot.count, undefined);
  // A new session can restart polling without an old request overwriting it.
  poller.start();
  assert.equal(calls, 2);
  finish(7);
  await poller.refresh();
  assert.equal(poller.snapshot.count, 7);
  poller.stop();
});

test("poller refreshes every five minutes, recomputes the window, and stops its timer", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: NOW });
  const times: number[] = [];
  const poller = new PrCountPoller(async (now) => { times.push(now); return times.length; });
  try {
    poller.start();
    await poller.refresh();
    assert.deepEqual(times, [NOW]);
    t.mock.timers.tick(REFRESH_MS - 1);
    assert.equal(times.length, 1);
    t.mock.timers.tick(1);
    await poller.refresh();
    assert.deepEqual(times, [NOW, NOW + REFRESH_MS]);
    poller.stop();
    t.mock.timers.tick(REFRESH_MS * 2);
    assert.equal(times.length, 2);
  } finally {
    poller.stop();
    t.mock.timers.reset();
  }
});
