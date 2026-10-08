import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { HerdrPane, SessionSnapshot } from "../shared/protocol.ts";

type Identity = { pane: string; workspace: string; tab?: string; terminal: string; cwd: string; session?: string | null };
type Origin = Identity & { parent: Identity; lifecycle?: string };

const read = (file: string): unknown => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
};

export function worktreeBranch(cwd: string | null | undefined): string | undefined {
  if (!cwd) return undefined;
  try {
    const gitdir = readFileSync(join(cwd, ".git"), "utf8").match(/^gitdir:\s*(.+)$/m)?.[1];
    if (!gitdir) return undefined;
    const head = readFileSync(join(resolve(cwd, gitdir.trim()), "HEAD"), "utf8").trim();
    return head.match(/^ref: refs\/heads\/(.+)$/)?.[1]
      ?? (/^[0-9a-f]{40,64}$/.test(head) ? `detached ${head.slice(0, 8)}` : undefined);
  } catch { return undefined; }
}

/** UI ancestry only: failed launch receipts can identify an origin, never a successful result. */
export class PaneOrigins {
  constructor(
    private readonly file = join(homedir(), ".local/state/herdr/parent-links.json"),
    private readonly delegations = process.env["HERDR_DELEGATION_DIR"] || join(homedir(), ".herdr/delegations"),
  ) {}

  apply(snapshot: SessionSnapshot): SessionSnapshot {
    const saved = read(this.file);
    const records: unknown[] = Array.isArray(saved) ? [...saved] : [];
    try {
      for (const dir of readdirSync(this.delegations, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        for (const name of readdirSync(join(this.delegations, dir.name))) {
          if (name.endsWith(".json") && !name.endsWith(".recovery.json")) records.push(read(join(this.delegations, dir.name, name)));
        }
      }
    } catch { /* absent launch history leaves native tab ancestry available */ }
    const panes = new Map(snapshot.panes.map((pane) => [pane.pane_id, pane]));
    const candidates = new Map<string, Set<string | null>>();
    for (const value of records) {
      if (!value || typeof value !== "object") continue;
      const record = value as Origin;
      if (!record.parent || record.lifecycle === "closed") continue;
      const child = panes.get(record.pane);
      if (!child || child.workspace_id !== record.workspace || child.terminal_id !== record.terminal || child.cwd !== record.cwd
          || (record.tab && child.tab_id !== record.tab)) continue;
      const space = snapshot.workspaces.find((workspace) => workspace.workspace_id === child.workspace_id);
      if (child.workspace_id !== record.parent.workspace && space?.worktree?.is_linked_worktree !== true) continue;
      const parent = panes.get(record.parent.pane);
      const childSession = child.agent_session?.value;
      const valid = parent && parent.pane_id !== child.pane_id && record.parent.session
        && parent.agent_session?.value === record.parent.session
        && parent.workspace_id === record.parent.workspace && parent.tab_id === record.parent.tab
        && parent.terminal_id === record.parent.terminal && parent.cwd === record.parent.cwd
        && (!record.session || !childSession || record.session === childSession);
      const owners = candidates.get(child.pane_id) ?? new Set<string | null>();
      owners.add(valid ? parent.pane_id : null);
      candidates.set(child.pane_id, owners);
    }
    const parents = new Map<string, string>();
    for (const [child, owners] of candidates) {
      const parent = owners.size === 1 ? [...owners][0] : null;
      if (parent) parents.set(child, parent);
    }
    for (const child of parents.keys()) {
      const seen = new Set<string>();
      let current: string | undefined = child;
      while (current && parents.has(current)) {
        if (seen.has(current)) { for (const id of seen) parents.delete(id); break; }
        seen.add(current); current = parents.get(current);
      }
    }
    return { ...snapshot, panes: snapshot.panes.map((pane) => {
      const checkout = snapshot.workspaces.find((space) => space.workspace_id === pane.workspace_id)?.worktree?.checkout_path;
      const branch = worktreeBranch(pane.cwd) ?? worktreeBranch(checkout);
      return { ...pane, ...(parents.has(pane.pane_id) ? { parent_pane_id: parents.get(pane.pane_id)! } : {}),
        ...(branch ? { worktree_branch: branch } : {}) } satisfies HerdrPane;
    }) };
  }
}
