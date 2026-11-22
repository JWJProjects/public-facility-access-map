# 介接、資料與評分

## GeoJSON 介接

使用 UTF-8 GeoJSON FeatureCollection，經度先於緯度，依 [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) 使用 WGS84。無自訂 CRS，最多 2 MB、2,500 features、40 區。這是 GeoJSON 的應用層子集合；其他格式需先轉換。

- metadata：name、origin（synthetic / official-open / user-provided）、source、license、version。來源由資料提供方自報，系統不證實其真偽。
- district：properties.id、name、kind、population；Polygon 單外環，須閉合，至少 3 個不同點、最多 300 點，非零面積。沒有內洞、MultiPolygon、拓樸、重疊或跨日界線支援。
- facility：id、name、kind、district、category；Point。category 為 park、sport、open。
- demand：id、name、kind、district、demandWeight；Point。權重為正數，不推定為實際人口。
- 每個 ID 全域唯一，分區關聯採提供方的 district ID；不由座標自動認定，需先做 GIS 拓樸及實地資料品管。匯出原始資料只保留白名單欄位；分析匯出則另帶區級指標、排名與參數，不是可以直接還原設施／需求點的備份。
- 不接受個人名單、住址、精細個人軌跡等資料。匯入本機記憶體，重整恢復範例，不上傳；匯出檔由操作者自行保管。文字欄位仍可能含不應使用內容，即使會去掉額外欄位。下載結果依法遵守資料來源條款，外部授權資料不因匯入而變成 CC0。

## 模型

區域依 district 計算同類設施數，密度 = 設施數 ÷ 人口 × 10,000。供給缺口 = max(0, 1 − 密度 ÷ 目標密度)。每個需求點以 Haversine 球面距離找最近的篩選設施，允許跨區；近接缺口是未達所選半徑的需求權重比。沒有需求點的區域只顯示供給指標，整體不排名。

    優先分數 = 100 × (近接權重 × 近接缺口 + (1 − 近接權重) × 供給缺口)

預設 700 m、每萬人 3 處、近接權重 60%。範圍篩選只改顯示，不切掉鄰區可近接的設施。分數同分按 ID 排序；畫面顯示一位小數，匯出最多三位小數，按精確分數排序。地圖是小範圍的等距近似，無街道基圖。不用人口代表實際服務對象、不能跨類等量解讀設施容量。設施開放時段、資格及入口差異未納入。

合成資料由 synthetic() 固定規則生成，data/demo.geojson 是同一輸入的可攜式版本。模型驗證是距離規則與流程一致性驗證，不是實地效度驗證。
