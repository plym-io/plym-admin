// Pulls the live OpenAPI spec and regenerates the typed client.
//
// 1. Fetch the spec from the running API (override with OPENAPI_URL or argv[2]).
// 2. Write a pretty-printed snapshot to openapi.json so diffs stay reviewable.
// 3. Regenerate src/api/schema.d.ts from that snapshot.
//
// Deterministic: same spec in → same files out. Run with `npm run codegen`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_FILE = resolve(ROOT, 'openapi.json');
const OUT_FILE = resolve(ROOT, 'src/api/schema.d.ts');
const URL = process.argv[2] ?? process.env.OPENAPI_URL ?? 'http://127.0.0.1:9173/openapi.json';

const res = await fetch(URL).catch((e) => {
  console.error(`✗ Could not reach ${URL} — is the API running?\n  ${e.message}`);
  process.exit(1);
});
if (!res.ok) {
  console.error(`✗ ${URL} returned ${res.status} ${res.statusText}`);
  process.exit(1);
}

const spec = await res.json();
if (!spec?.openapi || !spec?.paths) {
  console.error(`✗ ${URL} did not return a valid OpenAPI document.`);
  process.exit(1);
}

// Stable key order + trailing newline keeps git diffs minimal between runs.
writeFileSync(SPEC_FILE, JSON.stringify(spec, null, 2) + '\n');
console.log(`✓ Wrote ${SPEC_FILE} (OpenAPI ${spec.openapi})`);

execFileSync('npx', ['openapi-typescript', SPEC_FILE, '-o', OUT_FILE], {
  cwd: ROOT,
  stdio: 'inherit',
});
console.log(`✓ Regenerated ${OUT_FILE}`);
