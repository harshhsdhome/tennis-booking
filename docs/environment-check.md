# Environment Check Cheat Sheet

Run these commands in PowerShell to verify your development environment is ready.

---

## Node.js & npm
```powershell
node --version
# Expected: v18.x or higher

npm --version
# Expected: v9.x or higher
```

## TypeScript
```powershell
tsc --version
# Expected: Version 5.x.x
# If not found — install globally:
npm install -g typescript
# Or use locally after npm install:
npx tsc --version
```

## Docker CLI
```powershell
docker --version
# Expected: Docker version 24.x or higher
```

## Docker Compose
```powershell
docker compose version
# Expected: Docker Compose version v2.x
```

## Docker Daemon (is it actually running?)
```powershell
docker info
# Expected: Server Version: xx.x.x
# If you see "failed to connect" — open Docker Desktop and wait for it to start
```

## Git
```powershell
git --version
# Expected: git version 2.x
```

## Quick all-in-one check (copy/paste this block)
```powershell
node --version
npm --version
docker --version
docker compose version
docker info | Select-String "Server Version"
git --version
```

---

## Results on This Machine (last checked)

| Tool           | Version         | Status |
|----------------|-----------------|--------|
| Node.js        | v24.17.0        | ✅     |
| npm            | v11.13.0        | ✅     |
| TypeScript     | local via npm   | ✅     |
| Docker CLI     | v29.1.2         | ✅     |
| Docker Compose | v2.40.3         | ✅     |
| Docker Daemon  | Running         | ✅     |
| Git            | v2.52.0         | ✅     |

---

## If Docker Desktop is not running
Open **Docker Desktop** from the Windows Start menu.
Wait for the whale icon in the system tray to show "Docker Desktop is running" (green icon).
Then re-run `docker info` to confirm.
