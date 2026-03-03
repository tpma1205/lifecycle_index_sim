# 退休策略模擬器 — Life-Cycle Index Investing Simulator

基於 **生命週期投資法 (Life-Cycle Investing)** 的退休財務模擬工具。以 1,000 次蒙地卡羅路徑模擬，搭配動態年齡槓桿配置，評估指數投資者的退休提領成功率與資產軌跡。

## 功能概覽

| 功能             | 說明                                                          |
| ---------------- | ------------------------------------------------------------- |
| **蒙地卡羅模擬** | 1,000 條獨立路徑，輸出 P25 / P50 / P75 三種情境               |
| **動態槓桿配置** | 10 個年齡區間（20-25 到 66+）各自設定曝險倍數                 |
| **自動建議槓桿** | 根據人力資本 / 淨資產比例，依 Ayres & Nalebuff 理論計算建議值 |
| **通膨調整提領** | 退休後首年提領金額逐年依通膨率遞增，計算資金存活率            |
| **即時視覺化**   | Chart.js 繪製資產生命週期預測曲線，標記目標達成點與退休時點   |

## 技術棧

- **前端**: Vanilla HTML5 + CSS3（Neumorphism / Soft UI 設計風格）
- **邏輯**: Pure JavaScript (ES6+)
- **圖表**: [Chart.js 4.x](https://www.chartjs.org/)
- **圖示**: [Lucide Icons](https://lucide.dev/)
- **字體**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) + [DM Sans](https://fonts.google.com/specimen/DM+Sans)

## 快速開始

這是一個純靜態網頁，不需要建構工具或後端伺服器。

```bash
# Clone
git clone git@github.com:tpma1205/lifecycle_index_sim.git
cd lifecycle_index_sim

# 用任何靜態伺服器開啟，例如 VS Code Live Server 或：
npx -y serve .
```

然後在瀏覽器開啟 `http://localhost:3000`。

## 使用方式

1. **基本現況** — 輸入當前年齡、淨資產（萬元）、每月投入金額（元）
2. **市場預期** — 設定年化報酬率、波動率、通膨率
3. **退休目標** — 定義退休年齡、目標資產、首年提領金額
4. **槓桿配置** — 點擊 ⚡ 自動依人力資本計算，或手動調整各區間
5. **執行模擬** — 點擊按鈕即時生成 KPI、曲線圖與情境分析

## 設計風格

採用 **Neumorphism (Soft UI)** 設計系統：

- 單色 Cool Grey 表面 (`#E0E5EC`)，以雙向 RGBA 陰影塑造深度
- Extruded（凸起）卡片 + Inset（內嵌）輸入框，無邊框線
- 32px 容器圓角、16px 元件圓角
- Accent `#6C63FF` (Soft Violet) 用於 CTA 與 Focus 狀態
- 300ms ease-out 微互動動畫

## 理論基礎

| 理論                                        | 核心主張                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| **Life-Cycle Investing** (Ayres & Nalebuff) | 年輕時透過槓桿增加股市曝險，將投資風險分散至整個生命週期        |
| **4% Rule** (Trinity Study)                 | 退休後每年提領總資產的 4%（隨通膨調整），高機率維持 30 年不耗盡 |
| **Leveraged ETFs in LCI**                   | 探討槓桿型 ETF 作為生命週期投資法中增加曝險的可行工具           |
| **Beyond the Status Quo**                   | 100% 多元化股票配置可極大化退休財富並降低資金耗盡風險           |

## 專案結構

```
├── index.html      # 主頁面結構
├── styles.css      # Neumorphism 設計系統 & 響應式佈局
├── simulator.js    # 模擬邏輯、圖表渲染、UI 互動
├── .gitignore
└── README.md
```

## 免責聲明

本工具僅供學術研究與投資策略模擬參考。模擬結果基於歷史統計數據與數學模型，不保證未來市況表現。投資一定有風險，使用前請諮詢專業理財顧問。
