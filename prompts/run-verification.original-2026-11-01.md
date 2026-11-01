# 任務：重新研究 pstack 與 Boris 方法 → 修訂融合 skill → 用它驗證目前這個專案

你是在 Hank 的 Mac 上執行的 Claude Code，工作目錄就是要驗證的專案。整份讀完再開始。工作分成四段，每段結束時用三到五行回報，然後直接接著做下一段。只有標示 **【停下來問 Hank】** 的地方要等他回覆。

## 規則（違反就停）
- 先讀這個專案的 `AGENTS.md`、`CLAUDE.md`、`REVIEW.md`、`CONTRIBUTING.md`（有哪份讀哪份）並且遵守，尤其是分支、要誰核准、交付前必須跑的指令。
- 不部署、不 merge、不打開任何功能旗標、不動正式環境的資料。
- 產品程式碼**沒有 Hank 同意不改**。驗證相關的檔案（模型、設定、重現測試、skill）可以新增或修改，一律放在新分支。
- 每條結論都要有出處：URL、檔案:行號，或你實際執行過的指令。推測要標明是推測。
- 交付前跑專案規定的測試與建置指令，貼出結果行；沒跑的就寫「沒跑」。

## 第一段：從原始資料重新研究兩種方法（不要只靠記憶或摘要）
1. **pstack**（Cursor，Lauren Tan）：
   - `git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins`，再 `git sparse-checkout set pstack`，放在 scratch 目錄，不要放在專案裡。
   - **全文**讀這幾份：`create-formal-verification-skill`、`maintain-formal-verification-skill`、`statechart`（含 `scripts/` 和 `references/`）、`create-verification-skill`、`maintain-verification-skill`、`blast-radius`、`benchmark-checklist`、`principle-prove-it-works`、`principle-encode-lessons-in-structure`。
   - 再讀 `poteto-mode/playbooks/` 底下的 `bug-fix.md`、`opening-a-pr.md`、`shipping.md`，以及 `docs/guide/06-verify-and-ship.md`、`10-recipes-and-pitfalls.md`。
   - 記下每份 skill 的具體規則。特別留意：怎麼挑目標、怎麼選工具、怎麼證明檢查會失敗、遇到什麼情況要停、怎麼處理漂移、交接時要寫什麼。
2. **Boris 方法**：
   - 找一手資料：Boris Cherny 2026-09-23 在 X 上說用 Opus 5.5 加 Lean／TLA+ 驗證 Claude Agent SDK、產出 16 個 PR 的貼文和影片，以及 Agent SDK repo 裡對應的 PR（看標題、Lean／TLA+ 檔、附的測試）。
   - 二手資料（例如 explainx.ai）只能當線索，數字要回到一手來源核對。
   - 要回答：他怎麼下 prompt？Lean 和 TLA+ 各自用在哪？模型怎麼切？「simplify」類的 PR 是怎麼來的？PR 裡有沒有附回歸測試？
   - 找不到的就寫「找不到」，不要猜。
3. 輸出 `~/formal-verification/research/pstack-vs-boris-<日期>.md`：
   - 一張對照表，列出每條規則、出自哪裡、目前的融合 skill 有沒有涵蓋。
   - 和之前理解不同的地方。
   - 新學到、值得加進 skill 的做法。

## 第二段：修訂融合 skill（所有專案共用）
4. 讀目前的 skill：先找 `~/.claude/skills/fused-formal-verification/SKILL.md`。沒有的話，**【停下來問 Hank】** 請他貼上 claude.ai 那份 `fused-formal-verification` 的內容。
5. 拿第一段的對照表逐條檢查：
   - 缺的補上。
   - 錯的改掉，並引用出處。
   - 多餘或互相矛盾的刪掉。

   保留四種模式：Create（Boris 式掃雷，再接 pstack 式鎖定）、Maintain、Statechart、Handoff。內容不要寫死任何專案的名字，總長比現在多不超過 30%。
6. 寫回 `~/.claude/skills/fused-formal-verification/SKILL.md`，frontmatter 要有 `name` 和 `description`。舊版先備份成同目錄下的 `SKILL.prev.md`。
7. 回報時附上修訂前後的 diff 重點，並提醒 Hank：claude.ai 上那份帳號 skill 要他手動更新。你沒辦法改它。

## 第三段：用新版 skill 驗證目前這個專案
8. **Phase 0：決定範圍**
   - 先看專案裡有沒有既有的形式化驗證：`formal/` 目錄、`*.tla`、`*.lean`、verify skill、以 formal 命名的測試。有的話先跑 **Maintain**。
   - 沒有的話，列出 3 到 5 個候選目標。每個附上：程式做出的承諾（一句話）、壞掉時會傷到誰（一句話）、相關的檔案:行號，以及為什麼測試很難打到它。
   - 優先找會被併發打到的程式：有 await 或 callback 的流程、鎖、重試、session、佇列、狀態機、多裝置同步，以及金流、帳號、權限。
   - **【停下來問 Hank】** 讓他從候選裡挑一個，或接受你的推薦。
9. **Phase 1：掃雷**
   - 照 skill 建模。粒度必須等於程式碼裡 await 之間的同步區塊；每個 action 都附上檔案:行號註解。
   - 外部故障（網路錯誤、回應遺失、session 中途結束）用有上限的預算注入。
   - 一次處理一個反例：每個反例先用模型開關假設修正，再找下一個。
   - 每個反例都要寫成測試，在真實程式碼上重現，並確認它死在最後那條安全性斷言。重現不出來的，算建模錯誤。
10. **Phase 2：鎖定**
    - 守門設定要在一分鐘內跑完，並且在今天的程式碼上通過。
    - 做 mutation 表：每個 mutant 拿掉程式碼裡一個真實的防護，守門設定都必須失敗。
    - 重現測試用 todo／xfail 標記，讓測試套件維持綠燈。
    - 寫專案內的 verify skill，並記錄同步 commit。如果 `.claude/` 被 gitignore 擋住，**【停下來問 Hank】** 要強制加入還是放在 `formal/` 底下。
    - 寫 drift guard：只 hash 被涵蓋的函式本體。
    - 用一個暫時的破壞性改動，確認 skill 真的抓得到；然後還原。
    - 跑太久被砍掉的那一輪，結論一律寫 inconclusive。
11. **Statechart**：每個發現畫一張 Mermaid 狀態圖，用使用者看得懂的話標示。
12. commit 到新分支，例如 `formal/<領域>-<日期>`，然後 `git push -u`。淺層 clone 要補 fetch refspec，否則本機不會有對應的遠端追蹤 ref。

## 第四段：修正提案
13. **【停下來問 Hank】** 每個發現都列出：建議的修法、會改到的檔案:行號、風險、對舊版客戶端或既有資料的影響。語意不明確的，給 2 到 3 種選項讓他選。
14. Hank 同意後才實作：
    - 另開修正分支，和驗證分支分開。
    - 把對應測試的 todo 拿掉，確認它從失敗變成通過。
    - 把模型裡對應的修正開關改成「今天的程式碼」，加進守門設定，重跑。
    - 跑專案規定的測試與建置。
    - 開 PR，**不要 merge**。

## 最後的回報（繁體中文，技術詞可保留英文）
1. 重新研究後的三個最大收穫。
2. skill 改了什麼，以及 claude.ai 那份要 Hank 手動更新。
3. 這個專案驗證了什麼：工具、bounds、守門結果（狀態數、時間）、mutation 表。
4. 發現：每條附重現步驟、檔案:行號，標明是既有還是本次引入。
5. 修正的狀態（做了哪些，或在等 Hank 決定哪些）。
6. 指令與結果行。
7. 沒涵蓋的範圍，以及沒做的事。
