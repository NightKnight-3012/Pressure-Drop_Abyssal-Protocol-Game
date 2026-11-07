# Release status and known limitations

Pressure Drop is a playable 1-8-player co-op horror game. Its planned gameplay phases exist as working MVPs; it is still a playtest build, not a commercially validated release.

## Implemented

- Department repairs/calibrations, flooding/shared pump capacity, station/suit/helmet air, revival, noise-driven Leviathan and lockdowns.
- Four-slot equipment, department tools, finite lockers, alloy fabrication and validated ground hand-offs.
- Bounded ocean exploration, depth/pressure, seeded supplies, optional wreck regulator and two-seat SKIFF-2 survey sub.
- Skitters, electrical hazards, anchored mines and one late Warden, with warnings/counters.
- Solo practice, evidence/case file, event radio, simultaneous evacuation routes, docking/lift/rescue and personal endings.
- Private/public rooms, server-local Quick Match, anonymous identities, SQLite results, statistics, leaderboards and basic moderation.
- Captioned audio, accessibility/graphics options, binding-aware controls, wrist computer and local FPS/p95 diagnostics.
- Articulated fingers/thumbs and two-bone arm IK for reachable equipment/tool contact. Ten mesh draws, no added world lights/shadows. Distant work and treatment/unsupported props retain free gestures; this is not full-body collision IK.
- Three authored replacements for existing falling escape hazards, with lane telegraphs and persistent warnings.

See [README](README.md) for setup/mechanics, [TACTICAL-HORROR](TACTICAL-HORROR.md) for evacuation controls, [ASSETS](ASSETS.md) for provenance and [DEPLOYMENT](DEPLOYMENT.md) for operation.

## Validation baseline

The latest gameplay/hand-rig pass completed the full npm test chain, including 106 original network checks and additional dedicated suites, 185 client simulation checks, 12 existing hand checks plus 11 articulation/contact checks, and a production build. Focused Chrome captures cover equipment, full-crew layout, escape scenery and panel/floor work at 1280x720 and 520x640.

Client simulation uses a stub renderer. Some scenery captures are isolated previews. These are not a complete human playthrough, security audit or hardware performance test. The main bundle still exceeds the build's 500KB warning threshold.

Across 480 scripted matches, mission win rates were 90-100% at every crew size. A win means at least one escape; full-crew escape remained 0% for seven/eight-player scripted crews. Bots do not exercise all optional activities or hand-offs. See [BALANCE-REPORT](BALANCE-REPORT.md) for methodology, results and reproduction.

## Required release checks

- Fresh human tests at 1, 3-4 and 8 players: warning clarity, individual survival, useful role/passenger jobs, exploration risk/reward and survivor choices.
- Hardware performance measurements. Software WebGL screenshots do not establish 60 FPS.
- Actual Docker build/container deployment verification; Docker was unavailable during development. Local production entry/restart has automated coverage.
- Reachable hosting, persistent storage, WebSocket/HTTPS configuration and operator moderation before public stranger play.

## Deferred extensions and limitations

- Proximity voice chat and controller support.
- Drifting mines and machinery-targeting skitters.
- Direct trade offers, thrown-item physics and automatic lost-inventory recovery.
- Full-body IK or contact on every treatment/vehicle prop.
- Additional collapse encounters and physical debris simulation.
- Free-depth sub navigation, a larger seamless ocean and procedural station generation.
- Verified accounts, shared multi-server rooms and mid-match restoration after server restart.

The sub remains horizontal at survey level; mines are anchored; case-file progress is browser-local; online services are server-local. Anonymous bans can be evaded with a new browser identity. Do not describe deferred or unverified capabilities as shipped.
