import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HerdrPane, SessionSnapshot } from "../shared/protocol.ts";
import { PaneOrigins, worktreeBranch } from "./pane-origins.ts";

const pane = (pane_id: string, workspace_id: string): HerdrPane => ({ pane_id, workspace_id, tab_id: `${workspace_id}:t1`, terminal_id: `term-${pane_id}`, cwd: `/${workspace_id}`, agent: "codex", agent_status: "idle", revision: 1, focused: false, agent_session: { value: `sid-${pane_id}`, agent: "codex", kind: "id", source: "herdr:codex" } });
const root = pane("main", "primary"), other = pane("aep", "primary"), child = pane("child", "worker");
const snapshot = { panes: [root, other, child], workspaces: [{ workspace_id: "primary" }, { workspace_id: "worker", worktree: { is_linked_worktree: true } }] } as unknown as SessionSnapshot;
const identity = (p: HerdrPane) => ({ pane: p.pane_id, workspace: p.workspace_id, tab: p.tab_id, terminal: p.terminal_id, cwd: p.cwd, session: p.agent_session?.value });
const origin = () => ({ ...identity(child), parent: identity(root), stage: "start", delivered: false, session: null });
const ownedDirs: string[] = [];
afterEach(() => { for (const dir of ownedDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function apply(records: unknown[], receipts = false) {
  const dir = mkdtempSync(join(tmpdir(), "pane-origins-"));
  ownedDirs.push(dir);
  const file = join(dir, "parent-links.json"), history = join(dir, "delegations");
  if (receipts) {
    mkdirSync(join(history, "parent"), { recursive: true });
    records.forEach((record, i) => writeFileSync(join(history, "parent", `${i}.json`), JSON.stringify(record)));
  } else writeFileSync(file, JSON.stringify(records));
  return new PaneOrigins(file, history).apply(snapshot).panes as HerdrPane[];
}

describe("PaneOrigins", () => {
  test("worktree labels read the actual ref through a relative gitdir and never expose a folder path", () => {
    const dir = mkdtempSync(join(tmpdir(), "pane-branch-")); ownedDirs.push(dir);
    mkdirSync(join(dir, "metadata")); writeFileSync(join(dir, ".git"), "gitdir: metadata\n");
    writeFileSync(join(dir, "metadata/HEAD"), "ref: refs/heads/docs/1086-privacy-writer\n");
    expect(worktreeBranch(dir)).toBe("docs/1086-privacy-writer");
    writeFileSync(join(dir, "metadata/HEAD"), "a".repeat(40));
    expect(worktreeBranch(dir)).toBe("detached aaaaaaaa");
    expect(worktreeBranch(join(dir, "missing"))).toBeUndefined();
  });
  test("failed receipt establishes display origin with exact native identities without changing delivery or native IDs", () => {
    const before = structuredClone(snapshot), record = origin();
    expect(apply([record], true)[2]?.parent_pane_id).toBe("main");
    expect(snapshot).toEqual(before);
    expect(record.delivered).toBe(false);
  });
  test("a second same-repository main never becomes the inferred owner", () => {
    expect(apply([{ ...origin(), parent: identity(other) }])[2]?.parent_pane_id).toBe("aep");
    expect(apply([])[2]?.parent_pane_id).toBeUndefined();
  });
  test("changed parent or child identity and conflicting current origins stay unbound", () => {
    for (const key of ["session", "terminal", "cwd", "tab", "workspace"] as const) {
      expect(apply([{ ...origin(), parent: { ...identity(root), [key]: "changed" } }])[2]?.parent_pane_id).toBeUndefined();
      expect(apply([{ ...origin(), [key]: "changed" }])[2]?.parent_pane_id).toBeUndefined();
    }
    expect(apply([origin(), { ...origin(), parent: identity(other) }])[2]?.parent_pane_id).toBeUndefined();
    expect(apply([origin(), { ...origin(), parent: { ...identity(root), session: "changed" } }])[2]?.parent_pane_id).toBeUndefined();
  });
  test("closed receipts and cyclic origins cannot create a display family", () => {
    expect(apply([{ ...origin(), lifecycle: "closed" }])[2]?.parent_pane_id).toBeUndefined();
    const shared = { ...identity(root), parent: identity(other) }, reverse = { ...identity(other), parent: identity(root) };
    expect(apply([shared, reverse]).every((p) => !p.parent_pane_id)).toBe(true);
  });
});
