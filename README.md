# BJT 深度學習刷題 App

這是一個純前端、免安裝依賴的 BJT 商務日語學習 App。

## 功能
- 原題重現：收錄本次對話中的 BJT 題型與考點
- 延伸題：從每個知識點自動生成意思題、例句題
- 綜合隨機練習
- 錯題複習 / 收藏題
- 知識卡：敬語、固定搭配、商務詞彙、閱讀策略
- 本機儲存進度（localStorage）
- 可匯出 / 匯入學習紀錄
- PWA：部署到 HTTPS 後可安裝到手機桌面

## 使用方式
最簡單：用瀏覽器開啟 `index.html`。

若瀏覽器限制 Service Worker，可用任意靜態伺服器，例如：

```bash
python -m http.server 8000
```

然後開啟 http://localhost:8000

## 部署
整個資料夾可直接丟到 Vercel / Netlify / GitHub Pages。
