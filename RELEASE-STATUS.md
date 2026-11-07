# Current release status

The planned gameplay phases are implemented as documented MVPs. This is not a claim that every proposed extension or commercial-quality refinement is finished.

## Delivered in the release-polish pass

- Rolling measured FPS and 95th-percentile frame time in Display & Controls; local measurement only.
- New installations inherit system reduced motion unless a saved explicit setting overrides it.
- Supply-locker signs update their interaction key after rebinding.
- Regression expectations now match the physically mounted, approach-facing room signs.

The existing project also includes story/case-file progression, role gear and fabrication, optional ocean salvage, depth/pressure, the two-seat survey sub, four counterable hazards, training, both evacuation routes, public crews, persistence and moderation. See README and REMAINING-WORK for the actual limits and test coverage.

## Still unfinished or unverified

- Articulated fingers and reachable hand/tool contact are implemented. Distant work and treatment/unsupported props retain animated free poses; this is a first-person rig, not full-body character collision IK.
- The three existing falling route hazards now have authored gantry/bulkhead/conduit models and lane warnings. Additional collapse encounters or physical debris simulation remain deferred.
- Gear can now be put down and recovered by teammates; direct trade offers and automatic recovery from lost characters remain deferred.
- Proximity voice chat, controller support, drifting mines and machinery-targeting skitters remain deferred extensions and have not been implemented.
- Human playtesting with fresh crews at 1, 3-4 and 8 players is still required. Scripted crews do not evaluate fear, confusion, optional expedition appeal or the moral ending.
- Hardware frame-rate testing is still required. Software WebGL screenshots do not demonstrate 60 FPS. Use the new measured readout on target devices.
- Docker is unavailable in this workspace; container building remains unverified. The local production entry/restart has automated coverage.
- External deployment remains blocked by this session's network access and requires a real hosting destination.
- The user authorised committing the completed hand work together with this development pass after validation.

No unfinished item above should be reported as shipped or validated.

## Current development pass (8 November 2026)

Implemented authoritative gear hand-offs with finite charges, room/environment/range checks, cancellable exclusive recovery, crew-scaled loose-item limits and protected regulator cargo. Added keyboard and wrist controls, visible canisters, reach poses and captions. Screenshot review caught and fixed the old wrist-screen rule hiding the new equipment controls. Authored three replacement collapse silhouettes with deterministic essential fall motion, bounded geometry, a one-time authoritative lane telegraph and persistent HUD warning. No extra obstacles or damage were added.

Validation results for this pass are recorded in REMAINING-WORK.md. Human crew testing, hardware performance and deployment gates above still apply.

Final checks passed: full npm test, 184 client checks, production build, ten equipment browser checks/captures and six isolated collapse renders. A 480-match balance rerun retained 90-100% mission wins at every crew size; bots do not exercise hand-offs, and full-crew survival for larger crews remains unresolved. Wrist equipment focus and full-roster scrolling were corrected during review. The existing bundle-size warning remains. No commit or push performed.

## Articulated work hands follow-up

Both gloves now have individually animated fingers/thumbs, with two-bone arm IK and separate support/tool/fingertip contact anchors. Selected station/emergency equipment and supplies use mesh hits; breach/circuit work uses the visible floor face. Low work uses body-relative arm origins that remain correct while looking down. The offset wrench head and fingertip brace avoid pushing the glove through the working plane. Reach remains bounded; distant work, treatment and unsupported props use free gestures. Reduced effects keeps contact but freezes repetitive movement, without changing the camera or authoritative rules. The rig stays within ten mesh draws and adds no world lights or shadows.

The user authorised committing this follow-up and the preceding development pass together. Final validation is recorded in REMAINING-WORK.md; human/hardware/deployment gates remain unchanged.

## Earlier release-polish verification (historical)

Production build, complete npm test chain including 106 network checks, 178 real-client simulation checks, focused frame-stat/control tests and eight practice browser checks/captures passed. Balance: 100% wins at crew sizes 1-5 and 92% at 6-8 across the scripted twelve-seed sample. The existing bundle-size warning remains.
