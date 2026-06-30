const { spawnSync } = require("child_process");
const path = require("path");

const reactScriptsBin = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-scripts",
  "bin",
  "react-scripts.js",
);

const result = spawnSync(process.execPath, [reactScriptsBin, "build"], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    CI: "false",
    DISABLE_ESLINT_PLUGIN: "true",
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
