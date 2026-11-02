// Example `--view` module for pstack's `statechart` (skills/statechart/scripts/statechart).
// Model: Night Market Rush `formal/account-binding/AccountBinding.tla` (Apple/Google sign-in binding; not in this repo).
// Labels are in the reader's words (Traditional Chinese, for the product owner). Trial: research/pstack-statechart-trial-2026-11-02.md
// 帳號綁定（Apple 登入）statechart view。讀者：Hank。標籤只講玩家與伺服器看得到的事。
const NONE = "-";
const isRow = (r) => r && r.s !== NONE;
const tokAlive = (v, t) => t && t.s !== NONE && v.authAlive[t.s] && t.ep === v.epoch[t.s];

function appleSummary(v) {
  const parts = [];
  for (const s of Object.keys(v.authAlive)) {
    const live = v.authAlive[s], row = v.bound[s];
    const queued = v.pending.some((t) => t.s === s && tokAlive(v, t));
    if (!live) parts.push(isRow(row) ? `${s}：綁定留著已失效的授權` : null);
    else if (isRow(row)) parts.push(tokAlive(v, row.tok) ? `${s}：已綁定` : `${s}：已綁定但存的 token 已過期`);
    else if (queued) parts.push(`${s}：授權等撤銷`);
    else parts.push(`${s}：孤兒授權（Apple 還認得我們，伺服器沒人持有）`);
  }
  return parts.filter(Boolean).join("；") || "沒有 Apple 授權";
}
function inflight(v) {
  const parts = [];
  for (const p of Object.keys(v.pc)) {
    const r = v.pc[p];
    if (r.op === "idle") continue;
    const sess = v.sess[p] ? "" : "［這台裝置的 session 已被移除］";
    if (r.op === "signin") parts.push({ verify: "登入驗證中", exch: "等 Apple 換 token", cleanup: "登入作廢，準備撤銷剛拿到的 token" }[r.st] + sess);
    else if (r.op === "unlink") parts.push("解除綁定：逐筆撤銷中" + sess);
    else if (r.op === "delete") parts.push("刪除帳號：逐筆撤銷中" + sess);
  }
  if (v.rpc.st !== "idle") parts.push(v.rpc.st === "revoking" ? "背景重試：撤銷中" : "背景重試：掃描中");
  return parts.join("＋") || "閒置";
}
export const state = (v) => `${inflight(v)}｜${appleSummary(v)}`;
export const group = (v) => {
  const a = appleSummary(v);
  if (a.includes("孤兒") || a.includes("失效") || a.includes("過期")) return "出錯";
  if (inflight(v) !== "閒置") return "進行中";
  return "穩定";
};
export const colors = { 穩定: "teal", 進行中: "blue", 出錯: "orange" };
export const title = "Apple 登入綁定：撤銷與補救";
const changedProc = (from, to) => Object.keys(to.pc).find((p) => JSON.stringify(from.pc[p]) !== JSON.stringify(to.pc[p]));
export const step = (action, from, to) => {
  const p = changedProc(from, to);
  const failed = to.fails > from.fails;
  switch (action) {
    case "SStart": return to.pc[p].s.startsWith("a") ? "玩家按 Apple 登入" : "玩家按 Google 登入";
    case "SVerified":
      if (to.pc[p].op === "idle") return JSON.stringify(from.bound) !== JSON.stringify(to.bound) ? "驗證通過，直接綁定" : "伺服器拒絕這次登入";
      return "驗證通過，向 Apple 換 token";
    case "SExchanged":
      if (to.pc[p].op !== "idle") return "Apple 給了 token，但登入已作廢";
      if (to.nextK > from.nextK) return "Apple 給了 token，綁定完成";
      return "Apple 換 token 失敗";
    case "SCleanup": return failed ? "撤銷失敗（網路錯），token 丟掉" : "撤銷成功";
    case "EndSession": return "另一台裝置移除了這個 session";
    case "UStart": return "玩家按解除綁定";
    case "DStart": return "玩家刪除帳號";
    case "LRevoke": return failed ? "向 Apple 撤銷一筆：失敗" : "向 Apple 撤銷一筆：成功";
    case "UFinish": return "解除綁定收尾";
    case "DFinish": return "刪除收尾";
    case "RStart": return "背景重試開始";
    case "RScan": return "背景重試：看下一筆";
    case "RRevoke": return failed ? "背景重試撤銷：失敗" : "背景重試撤銷：成功";
    default: return action;
  }
};
