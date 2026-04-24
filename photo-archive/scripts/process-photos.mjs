/**
 * process-photos.mjs
 *
 * public/source-photos/{category}/{subcategory}/ 以下の元画像（JPEG 等）を処理して
 * - thumbnails/{slug}.webp  (サムネイル)
 * - display/{slug}.webp     (表示用 4K 画像)
 * - src/data/photos.json    (メタデータ)
 * を生成する。
 *
 * 使い方: npm run process-photos
 */

import sharp from 'sharp';
import exifr from 'exifr';
import { readdir, mkdir, writeFile, rm } from 'fs/promises';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE_PHOTOS_DIR = join(ROOT, 'source-photos');
const PUBLIC_PHOTOS_DIR = join(ROOT, 'public', 'photos');
const SOURCE_FEATURED_DIR = join(ROOT, 'source-photos-featured');
const PUBLIC_FEATURED_DIR = join(ROOT, 'public', 'featured');
const DATA_DIR = join(ROOT, 'src', 'data');

const THUMBNAIL_WIDTH = 600;
const DISPLAY_WIDTH = 3840;
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.heic', '.heif', '.avif']);
// 出力サブフォルダ（スキャン対象から除外）
const OUTPUT_DIRS = new Set(['thumbnails', 'display']);

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatShutterSpeed(seconds) {
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
}

async function getImageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && SUPPORTED_EXTENSIONS.has(extname(e.name).toLowerCase()))
    .map(e => join(dir, e.name))
    .sort();
}

async function getSubdirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !OUTPUT_DIRS.has(e.name))
    .map(e => e.name)
    .sort();
}

async function processPhoto(sourcePath, categorySlug, subcategorySlug) {
  const ext = extname(sourcePath).toLowerCase();
  const nameSlug = slugify(basename(sourcePath, ext));

  const baseDir = join(PUBLIC_PHOTOS_DIR, categorySlug, subcategorySlug);
  const thumbDir = join(baseDir, 'thumbnails');
  const displayDir = join(baseDir, 'display');
  await mkdir(thumbDir, { recursive: true });
  await mkdir(displayDir, { recursive: true });

  const thumbDest = join(thumbDir, `${nameSlug}.webp`);
  const displayDest = join(displayDir, `${nameSlug}.webp`);

  const thumbInfo = await sharp(sourcePath)
    .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbDest);

  const displayInfo = await sharp(sourcePath)
    .resize(DISPLAY_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(displayDest);

  let exif = { dateTaken: null, camera: null, lens: null, focalLength: null, aperture: null, shutterSpeed: null, iso: null };
  try {
    const raw = await exifr.parse(sourcePath, {
      pick: ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal'],
    });
    if (raw) {
      exif = {
        dateTaken: raw.DateTimeOriginal instanceof Date ? raw.DateTimeOriginal.toISOString() : null,
        camera: [raw.Make, raw.Model].filter(Boolean).join(' ') || null,
        lens: raw.LensModel || null,
        focalLength: raw.FocalLength ?? null,
        aperture: raw.FNumber ?? null,
        shutterSpeed: raw.ExposureTime != null ? formatShutterSpeed(raw.ExposureTime) : null,
        iso: raw.ISO ?? null,
      };
    }
  } catch (err) {
    console.warn(`  ⚠ EXIF スキップ: ${err.message}`);
  }

  const filterKey = `${categorySlug}-${subcategorySlug}`;

  return {
    id: `${filterKey}-${nameSlug}`,
    category: categorySlug,
    subcategory: subcategorySlug,
    filterKey,
    filename: nameSlug,
    thumbnail: `/photos/${categorySlug}/${subcategorySlug}/thumbnails/${nameSlug}.webp`,
    display: `/photos/${categorySlug}/${subcategorySlug}/display/${nameSlug}.webp`,
    thumbnailWidth: thumbInfo.width,
    thumbnailHeight: thumbInfo.height,
    displayWidth: displayInfo.width,
    displayHeight: displayInfo.height,
    exif,
  };
}

async function main() {
  console.log('📸 写真処理を開始します...\n');

  // 前回生成物を削除して、削除漏れ・古いファイル残存を防ぐ
  await rm(PUBLIC_PHOTOS_DIR, { recursive: true, force: true });
  await rm(PUBLIC_FEATURED_DIR, { recursive: true, force: true });

  await mkdir(PUBLIC_PHOTOS_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const categories = await getSubdirs(SOURCE_PHOTOS_DIR);

  if (categories.length === 0) {
    console.log('source-photos/ にカテゴリフォルダが見つかりません。');
    console.log('例: source-photos/landscape/autumn/ に画像を配置してください。');
    return;
  }

  const allPhotos = [];
  const seenPhotoIds = new Set();
  let totalErrors = 0;

  for (const category of categories) {
    const categorySlug = slugify(category);
    const categoryDir = join(SOURCE_PHOTOS_DIR, category);
    const subcategories = await getSubdirs(categoryDir);

    for (const sub of subcategories) {
      const subcategorySlug = slugify(sub);
      const subDir = join(categoryDir, sub);
      const files = await getImageFiles(subDir);

      console.log(`📁 ${category}/${sub} (${files.length}枚)`);

      for (const file of files) {
        process.stdout.write(`  → ${basename(file)} ... `);
        try {
          const photo = await processPhoto(file, categorySlug, subcategorySlug);
          if (seenPhotoIds.has(photo.id)) {
            throw new Error(`slug が重複しています: ${photo.id}`);
          }
          seenPhotoIds.add(photo.id);
          allPhotos.push(photo);
          console.log(`✓`);
        } catch (err) {
          console.log(`✗ ${err.message}`);
          totalErrors++;
        }
      }
    }

    // サブカテゴリなしで直接置かれた画像も処理
    const rootFiles = await getImageFiles(categoryDir);
    if (rootFiles.length > 0) {
      console.log(`📁 ${category}/ (${rootFiles.length}枚 - サブカテゴリなし)`);
      for (const file of rootFiles) {
        process.stdout.write(`  → ${basename(file)} ... `);
        try {
          const photo = await processPhoto(file, categorySlug, 'general');
          if (seenPhotoIds.has(photo.id)) {
            throw new Error(`slug が重複しています: ${photo.id}`);
          }
          seenPhotoIds.add(photo.id);
          allPhotos.push(photo);
          console.log(`✓`);
        } catch (err) {
          console.log(`✗ ${err.message}`);
          totalErrors++;
        }
      }
    }
  }

  const jsonPath = join(DATA_DIR, 'photos.json');
  await writeFile(jsonPath, JSON.stringify({ photos: allPhotos }, null, 2), 'utf-8');

  console.log(`\n✅ 完了: ${allPhotos.length}枚 / エラー: ${totalErrors}件`);
  console.log(`📄 src/data/photos.json を更新しました`);

  // featured/ の処理
  await processFeatured();
}

// source-photos-featured/ の画像を Web 最適化して src/data/featured.json を生成
async function processFeatured() {
  let featuredFiles = [];
  try {
    featuredFiles = await getImageFiles(SOURCE_FEATURED_DIR);
  } catch {
    return; // フォルダが無ければスキップ
  }

  const featuredPath = join(DATA_DIR, 'featured.json');
  if (featuredFiles.length === 0) {
    await writeFile(featuredPath, JSON.stringify({ photos: [] }, null, 2), 'utf-8');
    return;
  }

  console.log(`\n🌟 featured (${featuredFiles.length}枚)`);

  const displayDir = join(PUBLIC_FEATURED_DIR, 'display');
  await mkdir(displayDir, { recursive: true });

  const featuredPhotos = [];
  for (const file of featuredFiles) {
    const ext = extname(file).toLowerCase();
    const nameSlug = slugify(basename(file, ext));
    const dest = join(displayDir, `${nameSlug}.webp`);

    process.stdout.write(`  → ${basename(file)} ... `);
    try {
      await sharp(file)
        .resize(2560, null, { withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(dest);
      featuredPhotos.push({ src: `/featured/display/${nameSlug}.webp` });
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }

  await writeFile(featuredPath, JSON.stringify({ photos: featuredPhotos }, null, 2), 'utf-8');
  console.log(`📄 src/data/featured.json を更新しました`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
