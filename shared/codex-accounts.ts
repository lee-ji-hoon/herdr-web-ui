export interface CodexAccount {
  id: string;
  label: string;
  active: boolean;
}
export interface CodexAccounts {
  accounts: CodexAccount[];
  switchAvailable: boolean;
}
export interface CodexSwitchResult {
  ok: boolean;
  activeAccountID: string;
  restartRequired: boolean;
}
