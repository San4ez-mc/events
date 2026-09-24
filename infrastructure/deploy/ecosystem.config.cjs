// PM2 process definitions for the Kiro VPS (ports reserved in docs/VPS_ACCESS.md).
// Secrets live in apps/api/.env on the server, never here.
module.exports = {
  apps: [
    {
      name: "kiro-api",
      cwd: "/var/www/kiro/apps/api",
      script: "dist/src/main.js",
      env: { NODE_ENV: "production", PORT: "5100" },
      max_memory_restart: "600M",
    },
    {
      name: "kiro-web",
      cwd: "/var/www/kiro/apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 5101 -H 127.0.0.1",
      env: { NODE_ENV: "production", API_URL: "http://127.0.0.1:5100" },
      max_memory_restart: "600M",
    },
  ],
};
