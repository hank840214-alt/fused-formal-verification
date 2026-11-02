# 任務：用 fused-formal-verification 驗證目前這個專案（修訂版 2026-11-01）

你是在 Hank 的 Mac 上執行的 Claude Code。整份讀完再開始。工作分段回報（每段三到五行），只有 **【停下來問 Hank】** 要等回覆。

## 規則（違反就停）
- 先讀專案的 `AGENTS.md`、`CLAUDE.md`、`REVIEW.md`、`CONTRIBUTING.md`（有哪份讀哪份）並遵守。
- 不部署、不 merge、不開功能旗標、不動正式環境資料。產品程式碼沒有 Hank 同意不改。
- 不在別的 session 正在用的 worktree 裡跑任何東西：用 `git archive <ref> | tar -x` 匯出唯讀快照到 `~/formal-verification/<project>-<日期>/source/`。
- 每條結論要有出處：URL、檔案:行號，或實際執行過的指令。推測要標明。
- 交付前跑專案規定的測試與建置，貼出結果行；沒跑的寫「沒跑」。
- push／部署失敗：回報錯誤與重跑指令，不自行重試。

## 第零段：載入 skill
- 正本：`~/fused-formal-verification/skills/fused-formal-verification/SKILL.md`（本機 symlink `~/.claude/skills/fused-formal-verification`）。
- 不要改 `~/.claude/skills/synced/…` 底下任何檔案（claude.ai 單向同步，會被洗掉）。
- 報告格式與狀態詞：`~/fused-formal-verification/skills/formal-bug-hunt/REFERENCE.md`。

## 第一段：決定模式
1. 找既有驗證：`~/formal-verification/<project>*`、repo 內 `formal/`、`*.tla`、`*.lean`、verify skill。有 → 先跑 **Maintain**（每個 check 給 in sync／updated／bug／blocked）。
2. 沒有 → 列 3 到 5 個候選目標（承諾一句、壞了傷到誰一句、檔案:行號、為什麼測試打不到）。優先併發、狀態機、session、佇列、金流、帳號、權限。**【停下來問 Hank】** 挑一個。

## 第二段：Create（Phase 1 掃雷 → Phase 2 鎖定）
照 skill 做。硬性要求：原子步驟＝await 之間；每個 action 附檔案:行號；外部故障有上限；一次一個反例；每個反例在真程式重現並死在最後那條安全性斷言；守門設定一分鐘內跑完；mutation 表；重現測試標 todo；drift guard 用 `scripts/drift-guard.mjs`；用一個暫時的破壞性改動證明 skill 抓得到再還原；超時一律 inconclusive。
`.claude/` 被 gitignore 擋 → **【停下來問 Hank】** 強制加入或放 `formal/`。

## 第三段：Statechart
每個發現一張 Mermaid 狀態圖，讀者用語。先用自己的 TLC 多執行緒跑找違規，再用 pstack `statechart` 腳本只畫那條 bug 路徑（設 TLA2TOOLS／JAVA 兩個環境變數，一個 cfg 畫一條規則）。沒裝 pstack 就用 `scripts/tlc-dot-to-mermaid.mjs`。

## 第四段：交付
- commit 到 `formal/<領域>-<日期>` 分支，`git push -u`（淺層 clone 補 fetch refspec）。只開 PR 不 merge。
- **【停下來問 Hank】** 每個發現列：修法、改到的檔案:行號、風險、對舊客戶端／既有資料的影響；語意不明給 2–3 個選項。
- 同意後才修：另開修正分支；todo 拿掉確認從失敗變通過；模型對應 FIX 開關改成今天的程式碼並加進守門；跑測試與建置；開 PR 不 merge。
- 若專案規則要求：UI 改動附前後畫面給負責人確認。

## 最後回報（繁體中文，技術詞保留英文）
1. 模式與目標 commit。2. 每個 check 的結果（狀態數、時間、mutation 表）。3. 發現：重現步驟、檔案:行號、既有或本次引入、證據階梯第幾階。4. 修正狀態。5. 指令與結果行。6. 沒涵蓋的範圍與沒做的事。
