# 仕様書 - SenaMint Photo Gallery

## 概要

写真ギャラリーサイト。Astro + Tailwind CSS で構築し、GitHub Pages で公開する。
フロントエンドのみで動作し、バックエンドは不要。

---

## アーキテクチャ

### データフロー

```
[元画像] → process-photos スクリプト → [サムネイル WebP] + [表示用 WebP] + [photos.json]
                                          ↓ git commit & push
                                       GitHub Actions → Astro build → GitHub Pages
```

### ディレクトリ構成

```
photo-archive/
├── source-photos/          # 元画像置き場（gitignore済）
│   └── {category}/         # カテゴリ名 = フォルダ名
│       └── *.jpg など
├── scripts/
│   └── process-photos.mjs  # 写真処理スクリプト
├── public/
│   └── photos/
│       └── {category}/
│           ├── thumbnails/ # サムネイル WebP（git管理）
│           └── display/    # 表示用 WebP（git管理）
├── src/
│   ├── data/
│   │   └── photos.json     # メタデータ（スクリプト生成・git管理）
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Navigation.astro
│   │   ├── PhotoGrid.astro
│   │   ├── PhotoCard.astro
│   │   └── PhotoModal.astro
│   ├── layouts/
│   │   └── BaseLayout.astro
│   └── pages/
│       └── index.astro
└── package.json
```

---

## 写真処理スクリプト（process-photos.mjs）

### 実行方法

```bash
npm run process-photos
```

### 入力

- `source-photos/{category}/` 以下の画像ファイル
- 対応フォーマット: `.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.heic`, `.heif`

### 出力

| 種別 | 出力先 | 解像度 | フォーマット | 品質 |
|------|--------|--------|-------------|------|
| サムネイル | `public/photos/{category}/thumbnails/` | 幅 600px | WebP | 80 |
| 表示用 | `public/photos/{category}/display/` | 幅 3840px | WebP | 85 |
| メタデータ | `src/data/photos.json` | - | JSON | - |

- 元画像より小さい場合は拡大しない（`withoutEnlargement: true`）
- ファイル名はスラッグ化（小文字・英数字・ハイフンのみ）

### photos.json スキーマ

```json
{
  "photos": [
    {
      "id": "landscape-img001",
      "category": "landscape",
      "filename": "img001",
      "thumbnail": "/photos/landscape/thumbnails/img001.webp",
      "display": "/photos/landscape/display/img001.webp",
      "thumbnailWidth": 600,
      "thumbnailHeight": 400,
      "displayWidth": 3840,
      "displayHeight": 2560,
      "exif": {
        "dateTaken": "2024-03-15T10:30:00.000Z",
        "camera": "SONY ILCE-7M4",
        "lens": "FE 24-70mm F2.8 GM",
        "focalLength": 35,
        "aperture": 2.8,
        "shutterSpeed": "1/500",
        "iso": 100
      }
    }
  ]
}
```

---

## フロントエンド仕様

### ギャラリーページ（index.astro）

- `src/data/photos.json` をビルド時に読み込む
- カテゴリフィルターボタン表示（「すべて」+ 各カテゴリ）
- クリックで対象カテゴリのみ表示（クライアントサイドJS）

### レイアウト（PhotoGrid.astro）

- CSS columns による Masonry 風レイアウト
- レスポンシブ: モバイル 1列 / タブレット 2列 / デスクトップ 3列

### モーダル（PhotoModal.astro）

- `<dialog>` 要素を使用
- 表示用 WebP（最大 3840px）を表示
- EXIF 情報パネルを併記
  - 撮影日時 / カメラ / レンズ / 焦点距離 / 絞り / SS / ISO
- 背景クリックまたは × ボタンで閉じる

### ダークモード

- システム設定に追従（`prefers-color-scheme`）

---

## デプロイフロー

1. `source-photos/{category}/` に元画像を配置
2. `npm run process-photos` を実行（サムネイル・表示用画像・JSON を生成）
3. `public/photos/` と `src/data/photos.json` を git commit
4. `main` ブランチへ push
5. GitHub Actions が自動ビルド・デプロイ

### 注意事項

- 元画像（`source-photos/`）は gitignore 済みのため GitHub には上がらない
- サムネイル・表示用 WebP は git 管理する（GitHub 上に保存される）
- GitHub Pages のリポジトリサイズ上限に注意（1GB 推奨、100GB まで）

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-04-08 | 初版作成 |
