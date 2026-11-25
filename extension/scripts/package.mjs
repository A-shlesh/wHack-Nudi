// Builds the extension and zips the dist folder into extension/nudi-extension.zip,
// ready to share. Uses the zip tool the computer already has (no extra packages):
// PowerShell's Compress-Archive on Windows, "zip" on macOS and Linux.
//
// Usage:  npm run package

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const ZIP = "nudi-extension.zip";

execSync("node build.mjs", { stdio: "inherit" });
if (existsSync(ZIP)) rmSync(ZIP);

if (process.platform === "win32") {
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path dist\\* -DestinationPath ${ZIP}"`, { stdio: "inherit" });
} else {
  execSync(`cd dist && zip -qr ../${ZIP} .`, { stdio: "inherit" });
}
console.log(`Made extension/${ZIP}. Unzip it and use "Load unpacked" in chrome://extensions.`);
