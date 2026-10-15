import { useEffect, useRef, useState } from "react";
import type { CodexAccounts as Accounts, CodexSwitchResult } from "../../shared/codex-accounts.ts";
import { useT } from "../lib/i18n.ts";

export function CodexAccounts() {
  const t = useT();
  const [report, setReport] = useState<Accounts | null>(null);
  const busy = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let mounted = true;
    fetch("/api/codex-accounts").then(async (response) => {
      if (!response.ok) throw new Error();
      const value = await response.json() as Accounts;
      if (mounted) setReport(value);
    }).catch(() => { if (mounted) setMessage(t("Could not load saved Codex accounts.")); });
    return () => { mounted = false; };
  }, [t]);
  async function switchAccount(id: string) {
    if (busy.current || uncertain) return;
    busy.current = true;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/codex-accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as CodexSwitchResult;
      if (!result.ok || result.activeAccountID !== id) throw new Error();
      setReport((value) => value ? { ...value, accounts: value.accounts.map((account) => ({ ...account, active: account.id === id })) } : value);
      setMessage(result.restartRequired ? t("Account switched. Restart Codex to apply it to an existing session.") : t("This Codex account is already active."));
    } catch { setUncertain(true); setMessage(t("Switch not confirmed. Reload the account list before trying again.")); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="codex-accounts" aria-label={t("Saved Codex accounts")}>
    <header className="usage-provider-head">{t("Saved Codex accounts")}</header>
    <p className="usage-note">{t("Switching applies to new Codex sessions on this PC.")}</p>
    {report?.accounts.map((account) => <div className="codex-account-row" key={account.id}>
      <span>{account.label}</span>
      <button type="button" disabled={pending || uncertain || account.active || !report.switchAvailable} onClick={() => void switchAccount(account.id)}>{account.active ? t("Active account") : t("Switch account")}</button>
    </div>)}
    {report && !report.switchAvailable && <p className="usage-note">{t("Account switching is unavailable on this PC.")}</p>}
    <p className="usage-note" role="status">{message}</p>
  </section>;
}
