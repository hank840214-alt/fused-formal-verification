# pstack vs Boris 方法 — 對照與融合依據（2026-11-01）

一手來源：
- pstack：`cursor/plugins` at ae5650f（2026-10-31），`pstack/` 目錄，MIT（`pstack/LICENSE`，Copyright 2026 Lauren Tan）。讀過：`create-formal-verification-skill`、`maintain-formal-verification-skill`、`statechart`（含 scripts/ 目錄結構）、`blast-radius`、`benchmark-checklist`、`principle-prove-it-works`、`principle-encode-lessons-in-structure`、`tdd`、`interrogate`、`correct`、`reflect`、`show-me-your-work`、playbooks `bug-fix`／`opening-a-pr`／`shipping`、guide 02–10。
- Boris Cherny：推文 https://x.com/bcherny/status/2102543349102338309（搜尋摘要："I used Opus 5.5 to formally verify the Claude Agent SDK using Lean. A couple short prompts = 16 PRs fixing various bugs and race conditions. … TLA+ also works well. I sometimes combine Lean and TLA+ to look for issues around data flow, concurrency, and state mgmt."）；追問串 https://x.com/bcherny/status/2102898067133595992（三步：建模鎖定棘手狀態機／易競爭區 → 在模型找反例＝疑似 bug → 在真程式重現）。
- **找不到**：對應 PR。`gh pr list` 於 `anthropics/claude-agent-sdk-typescript` 與 `-python` 以 author=bcherny 查無結果；搜 lean/TLA/formal 亦無其 PR。explainx.ai 的細項（6 fix／6 simplify／4 follow-up、1,529 theorems、94 測試）無一手佐證，本文不採用。prompt 原文、模型切換、simplify PR 來源：找不到。

## 對照表

| 規則 | 出處 | 融合 skill 位置 | 狀態 |
|---|---|---|---|
| 從程式碼挑目標：承諾＋壞了傷到誰＋測試打不到 | pstack create §Choose the target | Phase 0 步 3 | 已涵蓋 |
| 問題決定工具：順序→TLA+；每個輸入→code verifier／property test；任何大小→證明 | pstack create §Let the question choose | Phase 1 步 6 | 已涵蓋，加 Lean 無 sorry／#print axioms（Boris 流程） |
| 一個原子步驟＝程式一個不可分段 | pstack create §True to the code；Boris 追問串步 1 | Phase 1 步 5 | 已涵蓋 |
| 檢查要能失敗（mutant） | pstack create §Able to fail | Phase 2 步 15 | 已涵蓋 |
| 發現就是發現，不弱化性質，不動產品碼 | pstack create／maintain | Hard rules、步 16 | 已涵蓋 |
| 對範圍誠實：bounds、假設、沒涵蓋 | pstack create §Honest about scope | 步 17、Handoff | 已涵蓋 |
| 記 sync commit＋覆蓋函式 | pstack create §Kept in step | 步 17 | 已涵蓋 |
| 交接前自己照 skill 走一次（scratch break） | pstack create §Prove it before you hand off | 步 19 | 已涵蓋 |
| Maintain 四種結果 in sync／updated／bug／blocked，可同時 updated+bug | pstack maintain §Outcomes | Maintain | 已涵蓋，加「budget 內沒碰到＝blocked」 |
| 先原樣跑一次，再讀 diff，從程式更新而非從結果更新 | pstack maintain §Pass 2–4 | Maintain 步 2–4 | 已涵蓋 |
| 通過後要故意破壞證明還會失敗；失敗要逐步重放 | pstack maintain §Pass 5 | Maintain 步 5 | 已涵蓋 |
| Statechart：規則＝INVARIANT、讀者用語標籤、≤20 箭頭、breaks／mayBreak、交接前重放 | pstack statechart | Statechart | 已涵蓋；加本 repo 的 fallback 腳本 |
| 500 states 圖表上限、Rules not checked | pstack statechart §Read the report | 未寫 | 略（工具細節） |
| 反例在模型找到後，在真程式重現才算 bug | Boris 追問串步 3；pstack create | 步 11 | 已涵蓋，加 CONFIRMED／CONFIRMED (agent)／PLAUSIBLE |
| FIX_* 開關同一份 spec 顯示 violated／holds | 本機 formal-bug-hunt（9/23 起） | 步 10 | 已涵蓋 |
| 一次一個反例 | 本機；pstack 無此規則 | 步 10 | 已涵蓋 |
| 外部故障用有上限預算注入 | 本機 | 步 8 | 已涵蓋 |
| 證據階梯 1–5（說了／指到行／走過／跑過／真機重現） | pstack blast-radius §How sure are you | Handoff | **新增** |
| 主 session 親自重跑 CONFIRMED repro | 本機 REFERENCE | Delegation | **新增** |
| 在 repo 外或唯讀快照工作 | 本機教訓（多 session 共用 worktree） | Hard rules | **新增** |
| 超時＝inconclusive | 本機；pstack statechart 100k 上限 | Long runs | 已涵蓋 |

## 和之前理解不同的地方
1. pstack 所在 repo 的 GitHub metadata 顯示無 license，但 `pstack/LICENSE` 是 MIT。可引用，需保留署名。
2. Boris 的「16 PRs」有一手推文佐證；所有細項數字都只有二手。
3. 兩種方法不衝突：Boris 是廣掃（找 bug），pstack 是鎖定與維護（不讓它再壞）。差異在「做完之後」。

## 值得加進 skill 的做法（已加）
- 證據階梯。
- Maintain 面對大漂移（上百 commits）的做法：逐 check、設預算、其餘 blocked。
- 唯讀快照：`git archive <ref> | tar -x`。

## pstack 除了 debug 還能用在哪（給 Hank 的評估）

| pstack 項目 | 做什麼 | 我們現在怎麼做 | 建議 |
|---|---|---|---|
| `blast-radius` | 小 diff 可能炸到哪；找出「它安全是因為哪一件事」並用跑程式證明 | /code-review、Codex 審 | **採用**：發版前對「小修」跑一次，寫進 TEMPLATES 審查段 |
| `benchmark-checklist` | 七問核對效能數字（限制在哪／是否調校／是否超物理極限／錯誤／重現／端到端／工作真的發生） | make-it-faster skill | **採用**：併進 make-it-faster 的回報格式 |
| `create/maintain-verification-skill`（非 formal） | 幫 app 產生「怎麼開、怎麼操作、什麼證據算過」的 verify skill＋feature map，每天跑 maintain | NMR qa-first-play／share-daily | **評估**：NMR 已有類似腳本；差的是 feature map＋每日 maintain＋三種結果 |
| `correct` | 同一錯誤出現兩次→改 repo（架構＞型別＞lint＞測試＞文件） | CORE「違反過的 rule 才升 hook」 | **已有同精神**；可借它的「規則表配執法者」格式 |
| `show-me-your-work` | 無人看守時的決策 TSV 日誌 | PreCompact 收尾 hook、flags | **採用**：夜間排程與長 agentic run 用 |
| `shipping` playbook | 寫碼的 agent 不當驗證者；只合併底部連續已驗證的 PR | 獨立審查原則（10/22） | 已有同精神；「verdict 綁 patch-id」可加進 TEMPLATES T5 |
| `opening-a-pr` playbook | PR 描述＝一分鐘簡報：Why／What changed／Scope／Blast radius／Verification | 無固定格式 | **採用**：當 PR 範本 |
| `interrogate` | 多模型對抗審查，只留跑過證明的發現 | 三腦會診＋redteam | 已有；可借「Dropped 清單」 |
| `tdd` | 只在有便宜測試路徑時寫失敗測試 | debug 決策樹 🟡 | 已有 |
| `reflect` | 一次 session 的教訓→skill 修改，三審一合成 | MAINTENANCE 寫教訓 | 參考即可 |
| `sharpen` / `in-your-own-words` | 送出前把 prompt 加深；先複述問題 | 無 | 小採用：派工文先複述 |
| `poteto-mode` playbooks 路由 | 一個入口依任務配 playbook | /lead | 已有 |
| `arena` / `swarm` | N 平行嘗試擇優／切片平行 | Agent<5 規則 | 不採用（成本） |
| `make-bot-ui`、automations/benny | Cursor 專屬 | — | 不適用 |
