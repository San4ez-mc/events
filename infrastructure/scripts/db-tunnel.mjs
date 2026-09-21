#!/usr/bin/env node
/**
 * Cross-platform (Windows/macOS/Linux) SSH local-port-forward to reach
 * PostgreSQL and MinIO on the VPS from local dev tools. See docs/VPS_ACCESS.md.
 *
 * Node-based rather than a shell script so `pnpm db:tunnel` works the same
 * from PowerShell, cmd, and any POSIX shell without picking the wrong `bash`
 * (Windows ships a WSL-launching bash.exe that isn't Git Bash).
 *
 * Auto-reconnects on drop (idle NAT/firewall timeouts are common for a
 * long-lived tunnel) — keeps retrying with a short backoff instead of
 * silently dying and leaving local dev pointed at nothing.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const keyPath = join(repoRoot, ".secrets", "kiro_vps_deploy_key");

const VPS_HOST = "173.242.62.180";
const RECONNECT_DELAY_MS = 3000;

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

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  process.exit(0);
});

function connect() {
  const ssh = spawn(
    "ssh",
    [
      "-i",
      keyPath,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ExitOnForwardFailure=yes",
      // Send a keepalive probe every 15s, tolerate 3 missed replies before
      // giving up — makes the client-side notice a dead connection promptly
      // and helps stop idle-timeout middleboxes from dropping it at all.
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=3",
      "-N",
      ...forwardArgs,
      `root@${VPS_HOST}`,
    ],
    { stdio: "inherit" },
  );

  ssh.on("exit", (code) => {
    if (stopping) return;
    console.log(`\nTunnel dropped (exit ${code}) — reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });
}

connect();
