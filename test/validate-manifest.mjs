/**
 * Manifest checks that the Chrome Web Store enforces at upload time.
 *
 * These exist because a 147-character `description` shipped in a built zip and
 * was only caught by the store's own validator after the upload -- a round trip
 * that costs minutes and happens at the worst moment. Every rule here is one
 * the store applies anyway; the point is to apply it before the zip is made,
 * not after it is rejected.
 *
 * Run from the repo root: node test/validate-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

/* Store field limits. Lengths are measured in UTF-16 code units, which is what
   the store counts -- `String.length` is already that, so no conversion. */
const LIMITS = { name: 45, description: 132, short_name: 12 };

for (const [field, max] of Object.entries(LIMITS)) {
  const v = manifest[field];
  if (typeof v !== "string") continue;
  check(v.length <= max, `${field} is ${v.length} characters, over the ${max} limit:\n    "${v}"`);
}

check(typeof manifest.name === "string" && manifest.name.trim(), "name is missing");
check(typeof manifest.description === "string" && manifest.description.trim(), "description is missing");
check(manifest.manifest_version === 3, `manifest_version is ${manifest.manifest_version}, expected 3`);

/* Version must be one to four dot-separated integers, each 0-65535, and the
   store rejects a leading zero on any part ("1.01"). */
const version = manifest.version;
check(
  typeof version === "string" && /^\d{1,5}(\.\d{1,5}){0,3}$/.test(version) &&
    version.split(".").every((p) => Number(p) <= 65535 && String(Number(p)) === p),
  `version "${version}" is not a valid store version string`
);

/* The store requires a 128px icon for the listing. */
check(manifest.icons && manifest.icons["128"], "icons.128 is required for the store listing");

/* Every path the manifest points at must exist, or the extension loads broken. */
const refs = [
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.action?.default_popup,
  ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
].filter(Boolean);

for (const ref of refs) {
  check(fs.existsSync(path.join(root, ref)), `manifest references a missing file: ${ref}`);
}

if (problems.length) {
  console.error("manifest validation failed:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}

console.log(
  `manifest ok — v${manifest.version}, ` +
    `name ${manifest.name.length}/${LIMITS.name}, ` +
    `description ${manifest.description.length}/${LIMITS.description}, ` +
    `${refs.length} referenced files present`
);
