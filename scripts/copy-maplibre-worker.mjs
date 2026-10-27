// Copies MapLibre's worker into public/ so it's served at /maplibre/…
//
// MapLibre 6 spawns its tile worker from a file next to its own module
// (new URL("./maplibre-gl-worker.mjs", import.meta.url)). Once Next bundles
// maplibre-gl, that relative URL no longer points anywhere, so MapCanvas calls
// setWorkerUrl() with this copy instead. Runs from postinstall, so the copy
// always matches the installed version. public/maplibre/ is gitignored.
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"))
const outDir = join(root, "public", "maplibre")

mkdirSync(outDir, { recursive: true })
copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), join(outDir, "maplibre-gl-worker.mjs"))
