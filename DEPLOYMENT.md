# Running a shared Pressure Drop server

Install Node 24.20 or newer. From the project directory run:

```powershell
npm install
npm run build
npm start
```

Open http://localhost:3000. Remote players must open the same reachable server URL. A private LAN address will not connect players at other locations. Put this process on a publicly reachable machine behind an HTTPS reverse proxy that supports WebSocket upgrades, or expose your own machine through your chosen network setup. This repository does not create a hosting account or publish the game. No API key is required. Providers' free tiers, sleep policies and persistent-disk availability vary; verify these before choosing hosting.

The one Node process serves client/dist, Socket.IO and the authoritative rooms. Do not split rooms across multiple replicas: there is no shared room adapter. Give the process a writable persistent disk, and point PD_DATA_FILE to it. Ephemeral hosting loses stats, identity proofs and bans on restart.

## Environment

.env.example lists options but is not automatically loaded; set them in the shell or hosting dashboard.

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 3000 | HTTP/WebSocket port |
| PD_DATA_FILE | server/data/pressure-drop.sqlite | Private SQLite file; never place under client/dist |
| MAX_ROOMS | 20 | Concurrent rooms |
| MAX_ROOMS_PER_IP | 4 | Rooms created by one connection IP |
| MAX_CONNECTIONS | 200 | Total accepted connections |
| MAX_CONNECTIONS_PER_IP | 40 | Connections per IP; allow for shared households |
| CORS_ORIGIN | unset | Comma-separated exact origins if client hosted separately |
| TRUST_PROXY | false | Only enable behind a trusted proxy that replaces forwarded IP headers |

Keep default same-origin hosting when possible. CORS controls browser cross-origin access, not authentication. When a proxy is used, block direct access to the upstream port before enabling TRUST_PROXY. PD_TIME_SCALE is for tests only and must equal 1 in production. Room and connection caps are process limits, not load-tested capacity claims.

## Docker

With Docker installed:

```sh
docker compose up --build -d
docker compose logs -f
```

The image builds the browser client, uses Node 24, runs as the node user, serves port 3000 and keeps SQLite on the named /data volume. The health check requests /health. Stop with docker compose down; the named volume remains. Do not add -v unless deliberately deleting all identities, records, reports and bans. Container building could not be exercised in the current workspace because Docker is not installed; the equivalent local build and server smoke checks are covered.

## Health, shutdown and records

GET /health reports room/player counts, persistence availability and pending result writes; it returns 503 while result storage is degraded or shutdown is underway. GET /api/rooms projects public rooms only. GET /api/leaderboard?period=weekly&kind=escapes&crewSize=0 projects public results only; fastest requires crewSize 1?8. These APIs are read-only and rate-limited. Personal stats use the connection's identity through Socket.IO; there is no client result-write API.

SIGINT/SIGTERM stops the simulation, announces shutdown and leaves unfinished games unscored. Completed result transactions are atomic/idempotent and transient failures retry once per second. The retry queue is in memory: if the disk remains unavailable through shutdown or the process crashes before writing, those queued results can be lost. New scored starts pause when the queue reaches 1000. There is no mid-match resume after a server restart. Logs are JSON lines; identity secrets are not logged.

For a backup, stop the server cleanly, then copy the SQLite file. Do not copy a live SQLite file alone while WAL writes are active. Restore the backup to PD_DATA_FILE before restarting. Restrict database and backup access: they contain identity hashes, chosen names and reports. The server has no analytics/telemetry service. Use a dedicated test database for automated experiments.

## Operator moderation

Run from the project directory with the same PD_DATA_FILE as the server:

```sh
npm run moderate -- reports
npm run moderate -- ban FULL_PROFILE_UUID repeated-harassment
npm run moderate -- unban FULL_PROFILE_UUID
```

Reports show full profile IDs for operator review. Bans refresh in the running process within five seconds, reject reconnects and hide the banned profile from public rankings. Reports never auto-ban. There is no remote admin endpoint. Clearing local browser storage can create a new anonymous identity, so these basic tools still require a human operator for public stranger play. Review/delete reports and retained records according to your community's policy; no automated retention policy or player data-deletion UI is included. Voice chat/controller support remain outside this release.
