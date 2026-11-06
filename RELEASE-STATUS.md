# Current release status

The planned gameplay phases are implemented as documented MVPs. This is not a claim that every proposed extension or commercial-quality refinement is finished.

## Delivered in the release-polish pass

- Rolling measured FPS and 95th-percentile frame time in Display & Controls; local measurement only.
- New installations inherit system reduced motion unless a saved explicit setting overrides it.
- Supply-locker signs update their interaction key after rebinding.
- Regression expectations now match the physically mounted, approach-facing room signs.

The existing project also includes story/case-file progression, role gear and fabrication, optional ocean salvage, depth/pressure, the two-seat survey sub, four counterable hazards, training, both evacuation routes, public crews, persistence and moderation. See README and REMAINING-WORK for the actual limits and test coverage.

## Still unfinished or unverified

- Precise hand-to-panel contact IK and individually animated fingers remain unfinished. The current hands use bounded camera-relative work poses.
- Additional authored collapse set pieces remain unfinished; the route already has authoritative falling obstacles and static wreck dressing.
- Proximity voice chat, controller support, trading/dropping gear, drifting mines and machinery-targeting skitters were deferred extensions and have not been implemented.
- Human playtesting with fresh crews at 1, 3-4 and 8 players is still required. Scripted crews do not evaluate fear, confusion, optional expedition appeal or the moral ending.
- Hardware frame-rate testing is still required. Software WebGL screenshots do not demonstrate 60 FPS. Use the new measured readout on target devices.
- Docker is unavailable in this workspace; container building remains unverified. The local production entry/restart has automated coverage.
- External deployment remains blocked by this session's network access and requires a real hosting destination.
- No new commit or push is authorised until the user answers the required yes/no approval immediately before committing.

No unfinished item above should be reported as shipped or validated.

## Verification for this pass

Production build, complete npm test chain including 106 network checks, 178 real-client simulation checks, focused frame-stat/control tests and eight practice browser checks/captures passed. Balance: 100% wins at crew sizes 1-5 and 92% at 6-8 across the scripted twelve-seed sample. The existing bundle-size warning remains.
