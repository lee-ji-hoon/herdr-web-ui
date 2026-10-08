import type { HerdrPane, PaneInfo } from "../../shared/protocol.ts";

export interface TabTreeRow<P extends PaneInfo = PaneInfo> {
  pane: P;
  depth: number;
  parent?: P;
  /** the last pane under its head: draws `└` instead of `├` */
  last: boolean;
  root: P;
  continuations: boolean[];
}

/**
 * Explicit origins connect worktree Spaces and shared tabs to their actual parent pane.
 * Native tab heads provide ancestry for panes with no explicit origin; roots stay flat.
 */
export function tabTree<P extends PaneInfo>(panes: P[]): TabTreeRow<P>[] {
  const byId = new Map(panes.map((pane) => [pane.pane_id, pane]));
  const parents = new Map<string, P>();
  for (const pane of panes) {
    const explicit = byId.get((pane as HerdrPane).parent_pane_id ?? "");
    if (explicit && explicit !== pane) parents.set(pane.pane_id, explicit);
  }
  const heads = new Map<string, P>();
  for (const pane of panes) {
    if (!pane.agent || heads.has(pane.tab_id)) continue;
    let head = pane, current = pane;
    const seen = new Set<string>();
    while (parents.has(current.pane_id) && !seen.has(current.pane_id)) {
      seen.add(current.pane_id); current = parents.get(current.pane_id)!;
      if (current.tab_id === pane.tab_id) head = current;
    }
    heads.set(pane.tab_id, head);
  }
  for (const parent of parents.values()) {
    const head = heads.get(parent.tab_id);
    if (head && parents.has(head.pane_id) && !parents.has(parent.pane_id)) heads.set(parent.tab_id, parent);
  }
  for (const pane of panes) {
    const head = heads.get(pane.tab_id);
    if (parents.has(pane.pane_id) || !head || head === pane) continue;
    const seen = new Set<string>();
    let current: P | undefined = head;
    while (current && current !== pane && !seen.has(current.pane_id)) {
      seen.add(current.pane_id); current = parents.get(current.pane_id);
    }
    if (current !== pane) parents.set(pane.pane_id, head);
  }
  for (const pane of panes) {
    const seen = new Set<string>();
    let current: P | undefined = pane;
    while (current && parents.has(current.pane_id)) {
      if (seen.has(current.pane_id)) { for (const id of seen) parents.delete(id); break; }
      seen.add(current.pane_id); current = parents.get(current.pane_id);
    }
  }
  const children = new Map<string, P[]>();
  for (const pane of panes) {
    const parent = parents.get(pane.pane_id);
    if (parent) children.set(parent.pane_id, [...(children.get(parent.pane_id) ?? []), pane]);
  }
  const rows: TabTreeRow<P>[] = [];
  const visit = (pane: P, root: P, depth: number, last: boolean, continuations: boolean[]) => {
    rows.push({ pane, root, depth, parent: parents.get(pane.pane_id), last, continuations });
    const under = children.get(pane.pane_id) ?? [];
    under.forEach((child, index) => visit(child, root, depth + 1, index === under.length - 1,
      depth ? [...continuations, !last] : []));
  };
  for (const pane of panes) {
    if (!parents.has(pane.pane_id)) visit(pane, pane, 0, false, []);
  }
  return rows;
}
