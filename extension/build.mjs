// Build script: bundles the TypeScript files with esbuild and copies the
// static files (manifest, popup page) into extension/dist/.
// Load extension/dist/ in Chrome with "Load unpacked".
//
// Usage:  node build.mjs          (build once)
//         node build.mjs --watch  (rebuild on every save)

import { cpSync, mkdirSync } from "node:fs";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

mkdirSync("dist/fonts", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("public", "dist", { recursive: true });

// Atkinson Hyperlegible: a free font made by the Braille Institute for
// people with low vision. We ship it inside the extension.
const fontFolder = "node_modules/@fontsource/atkinson-hyperlegible/files";
for (const weight of ["400", "700"]) {
  cpSync(`${fontFolder}/atkinson-hyperlegible-latin-${weight}-normal.woff2`, `dist/fonts/atkinson-${weight}.woff2`);
}

const options = {
  // One output file per entry point.
  entryPoints: ["src/content.ts", "src/background.ts", "src/popup.ts"],
  outdir: "dist",
  bundle: true,
  format: "iife", // plain scripts: content scripts cannot use ES modules
  target: "chrome120",
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
