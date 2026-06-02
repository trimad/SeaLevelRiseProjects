import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPublicDir = path.join(root, "public");
const REQUIRED_EXPORT_FILES = [
  "index.html",
  "css/site.css",
  "js/app.js",
  "data/sea-level-atlas.json",
  "data/world-land.json",
  "images/water.jpg",
];

function asPath(value) {
  return value instanceof URL ? fileURLToPath(value) : path.resolve(String(value));
}

function add(errors, subject, message) {
  errors.push(`${subject}: ${message}`);
}

function localAssetReferences(html) {
  const references = [];
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(html))) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/i.test(reference)) continue;
    references.push(reference.split(/[?#]/, 1)[0]);
  }
  return references;
}

export function validateExportDirectory(publicDir = defaultPublicDir) {
  const exportDir = asPath(publicDir);
  const errors = [];

  if (!fs.existsSync(exportDir) || !fs.statSync(exportDir).isDirectory()) {
    return [`${path.relative(root, exportDir) || exportDir}: export directory does not exist`];
  }

  for (const relativePath of REQUIRED_EXPORT_FILES) {
    const filePath = path.join(exportDir, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      add(errors, relativePath, "required exported file is missing");
    } else if (fs.statSync(filePath).size === 0) {
      add(errors, relativePath, "required exported file is empty");
    }
  }

  const indexPath = path.join(exportDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, "utf8");
    if (!/<canvas\b[^>]*\bid=["']?atlasCanvas["']?/.test(html)) {
      add(errors, "index.html", "missing Atlas canvas markup");
    }
    if (!html.includes("University of Hawaii Sea Level Center")) {
      add(errors, "index.html", "missing UH Sea Level Center source credit");
    }
    for (const phrase of ["Methodology", "five valid annual means", "ordinary least-squares", "station filtering"]) {
      if (!html.toLowerCase().includes(phrase.toLowerCase())) {
        add(errors, "index.html", `missing methodology note phrase: ${phrase}`);
      }
    }

    for (const reference of localAssetReferences(html)) {
      const normalized = reference.startsWith("/") ? reference.slice(1) : reference;
      if (normalized === "" || normalized.endsWith("/")) continue;
      const referencedPath = path.join(exportDir, normalized);
      if (!fs.existsSync(referencedPath)) {
        add(errors, `index.html -> ${reference}`, "referenced local asset is missing from export");
      }
    }
  }

  return errors;
}

export function validateExportFile(publicDir = defaultPublicDir) {
  return validateExportDirectory(publicDir);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exportDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultPublicDir;
  const errors = validateExportDirectory(exportDir);
  if (errors.length > 0) {
    console.error(`Static export validation failed for ${path.relative(root, exportDir) || exportDir}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Static export validation passed for ${path.relative(root, exportDir) || exportDir}.`);
  }
}
