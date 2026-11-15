import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "scripts", "tests"];
const files = ["server.mjs"];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
}

for (const root of roots) {
  try {
    collect(root);
  } catch {
    // A missing optional directory is fine.
  }
}

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failed += 1;
    console.error(`✗ ${file}\n${error.stderr?.toString() ?? error.message}`);
  }
}

console.log(
  failed === 0
    ? `Syntax OK: ${files.length} files`
    : `Syntax errors in ${failed} of ${files.length} files`,
);
process.exitCode = failed === 0 ? 0 : 1;
