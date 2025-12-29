# Recovery Notes

## What was recovered

- `src/index.js` is the production bundle downloaded from Cloudflare.
- `recovered-src/` contains a best-effort split of that bundle into per-file sections based on `// src/...` markers.

## How to deploy the recovered bundle

The current `wrangler.jsonc` points `main` to `src/index.js` so the exact production bundle can be deployed without rebuilding sources.

## Limits

- The recovered files are compiled JS, not the original TypeScript.
- Function and type names may be altered by the bundler.
- This reconstruction is for reference and future refactoring, not a perfect source restore.
