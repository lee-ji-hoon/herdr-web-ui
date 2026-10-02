import type { PaneInfo } from "../../shared/protocol.ts";

export interface TabTreeRow<P extends PaneInfo = PaneInfo> {
  pane: P;
  /** 0 for a tab's head and for panes in a tab without an agent, 1 for the panes under a head */
  depth: 0 | 1;
  /** the last pane under its head: draws `└` instead of `├` */
  last: boolean;
}

/**
 * Panes in tab order, each tab's first agent pane heading the other panes of that tab — the
 * parent and children herdr's radar sidebar shows. A tab with no agent stays flat. Order inside
 * a tab is herdr's own.
 */
export function tabTree<P extends PaneInfo>(panes: P[]): TabTreeRow<P>[] {
  const heads = new Map<string, P>();
  for (const pane of panes) if (pane.agent && !heads.has(pane.tab_id)) heads.set(pane.tab_id, pane);
  const children = new Map<string, P[]>();
  for (const pane of panes) {
    const head = heads.get(pane.tab_id);
    if (!head || head === pane) continue;
    children.set(head.pane_id, [...(children.get(head.pane_id) ?? []), pane]);
  }
  const rows: TabTreeRow<P>[] = [];
  for (const pane of panes) {
    const head = heads.get(pane.tab_id);
    if (head && head !== pane) continue;
    rows.push({ pane, depth: 0, last: false });
    const under = children.get(pane.pane_id) ?? [];
    under.forEach((child, index) => rows.push({ pane: child, depth: 1, last: index === under.length - 1 }));
  }
  return rows;
}
