#!/usr/bin/env node
/**
 * Cross-platform (Windows/macOS/Linux) SSH local-port-forward to reach
 * PostgreSQL and MinIO on the VPS from local dev tools. See docs/VPS_ACCESS.md.
 *
 * Node-based rather than a shell script so `pnpm db:tunnel` works the same
 * from PowerShell, cmd, and any POSIX shell without picking the wrong `bash`
 * (Windows ships a WSL-launching bash.exe that isn't Git Bash).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const keyPath = join(repoRoot, ".secrets", "kiro_vps_deploy_key");

const VPS_HOST = "173.242.62.180";

/** [localPort, remotePort, label] — all forwarded over one SSH connection. */
const FORWARDS = [
  [5433, 5432, "PostgreSQL"],
  [5502, 5102, "MinIO API"],
  [5503, 5103, "MinIO console"],
];

if (!existsSync(keyPath)) {
  console.error(
    `Missing ${keyPath} — see docs/VPS_ACCESS.md to (re)provision the deploy key.`,
  );
  process.exit(1);
}

for (const [local, remote, label] of FORWARDS) {
  console.log(`Tunnelling localhost:${local} -> ${VPS_HOST}:${remote} (${label})`);
}
console.log("(Ctrl+C to stop)");

const forwardArgs = FORWARDS.flatMap(([local, remote]) => ["-L", `${local}:127.0.0.1:${remote}`]);

const ssh = spawn(
  "ssh",
  [
    "-i",
    keyPath,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ExitOnForwardFailure=yes",
    "-N",
    ...forwardArgs,
    `root@${VPS_HOST}`,
  ],
  { stdio: "inherit" },
);

ssh.on("exit", (code) => process.exit(code ?? 0));
