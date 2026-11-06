# Release-readiness pass — 16 October 2026

This build strengthens the existing co-op horror game. It is a playtest build, with a complete two-route finale, rather than a finished commercial release. The distinctive foundation is the crew's competing survival decisions and the creature's response to their signals.

## Fixed

- Replaying no longer appends another set of system rows or attaches another game-chat keyboard handler. HUD caches, toast timers and options subscriptions reset with the match.
- The server checks travelled movement segments, preventing a delayed or manipulated packet from crossing a thin wall to an otherwise valid destination.
- Capsule repair requests cancel when E is released, including when the acknowledgement has not arrived yet. Previously capsule work did not appear in the normal hold map and could continue after release.
- A quick pod repair release has its own rate limiter; it can no longer be swallowed by the limiter on the preceding repair action.
- Handing over or automatically reassigning piloting controls cancels the new pilot's unfinished repair when other crew are aboard.
- Capsule escapees disappear from the station. Spectators following an active pod can read its reserves, with its action buttons disabled. An escaped spectator's underwater effects follow the watched location.
- Reconnect restores authoritative facing and briefing time. A disconnected player cannot re-enable movement by closing a panel.
- Clicking the scene after using a button restores keyboard control. Spatial captions distinguish sounds behind the player. The sound option updates ambient audio immediately.
- Removed temporary objects and finished audio voices release their resources. Missing model requests return a real 404 rather than the entry HTML. The production server handles HEAD, malformed URLs, conditional requests, content types, hidden paths and interrupted file streams, and shuts down its simulation cleanly.

## Visuals and usability

- Locally authored industrial surface textures, floor plate seams, wear, bolts and structural ceiling beams. Instancing keeps structural detail to two draw calls.
- Reflective, lit water with animated ripple normals. Reduced-effects mode freezes ripple movement and removes the emergency light pulse.
- Textured, reinforced wreckage and illuminated cockpit details, with streaming marine particles giving the pod a clearer sense of movement.
- Low, Balanced and High rendering presets control resolution and particle density. Brightness is adjustable; invalid stored preferences recover to safe defaults.
- Escape opens the in-game suit menu. Resume, display controls and leaving are available without returning to the lobby. The menu explicitly explains that multiplayer continues while it is open.

No new model download is needed. These additions are original code-generated surfaces and detail alongside the existing local models. No paid assets or external services were introduced.

## Verification and limits

The suites cover game rules, finale decisions, multiplayer/reconnect, repeated matches, model ownership, HTTP behavior and actual Chrome/WebGL scenes. Browser screenshots are saved under `test/artifacts`, including water, cockpit, small-screen wrist UI, options and endings. The browser runner also verifies releasing a capsule repair through real keyboard events.

The release-readiness pass verified the production build, 28 release checks, 138 rule checks, 67 tactical/finale checks, 76 network checks, 94 client checks and 26 model checks, plus 16 actual Chrome checks/captures. A separate production-entry-point smoke check served the built website, answered its health probe and created a live multiplayer room.

The subsequent pod-escape iteration adds a six-times-longer visual corridor, close passing structures, speed streaks, smoothed steering, camera banking, boost field-of-view changes, impact feedback, near-miss rushes and a visible extraction gate. Engine and water-rush audio follow speed and boost, and are local to the pod view. Reduced effects keeps a fixed field of view and removes camera vibration, banking and speed streaks. Server progression, obstacle timing and the station survivor's available time remain intact. Seven new motion checks and two additional browser views cover the normal, boosted and reduced-effects presentation. The updated main bundle is approximately 761 KB before compression.

Balance decisions are now seeded separately from mission randomness, making repeated runs reproducible. The simulated medic prioritizes critically low station oxygen before individual rescue jobs. A twelve-seed sample at each crew size produces 75–100% wins: six-player crews win 75%, below the diagnostic's 80% target; seven- and eight-player crews win 83%. Those are simulated wins with at least one survivor, not full-crew survival rates. The diagnostic exits with failure while a crew size remains below target. Gameplay difficulty has not been weakened to conceal that result.

Chrome verification uses software WebGL. It catches rendering and interaction faults, but it does not establish a frame-rate target on players' real GPUs. The main JavaScript bundle remains approximately 757 KB before compression. There is one compact station map, generated sound and text communication. Rooms and expedition state are held in server memory, so restarting the host ends live matches; personal ending records stay in each browser.

## Exterior follow-up

The exterior now uses a textured sediment shelf, eroded outer relief, buried asymmetrical outcrop clusters, small stones, sea fans, junction cables and curved corroded hull fragments. Large decorations stay beyond the playable EVA routes. The diver's flashlight reaches farther outside, while its interior settings stay the same. The pod's debris and seabed share the improved materials and geometry.

Leviathan facing follows actual rendered movement, including both orbit directions and outward retreat. The old facing calculation ignored clockwise patrols; the old body wave also propagated toward the head. Both are corrected. The new `npm.cmd run test:ocean` suite contains 30 checks for facing, wave direction, terrain clearance, geometry, deterministic placement, texture isolation and resource disposal, and is included in `npm test`. Actual Chrome captures include the exterior and reversed patrol alongside the existing mission and finale views. These changes do not add terrain collision or change the monster's attack rules.

## Next development milestones

1. **A sustained human playtest:** repeat missions with four, six and eight players, including internet latency, a pilot disconnect and both independent escape outcomes. Record where oxygen crises and rescue loops become unrecoverable before adjusting difficulty.
2. **One outstanding ten-minute section:** give the station recognizable room-specific props, stronger lighting composition and an identifiable approach to the finale. Replace remaining generic character presentation with a cohesive crew art direction and authored interaction/creature animations.
3. **A deeper ocean:** develop a larger explorable exterior and encounters that teach sound, concealment and the creature's behavior. Add content in tested sections rather than expanding an empty map.
4. **Production operation:** measure real hardware performance and server capacity; provide a persistent hosted HTTPS/WebSocket endpoint with monitoring. Test graceful maintenance and clearly communicate server restarts to players.
5. **Public playtest packaging:** a tutorial for calibration and the moral finale, credits available in-game, a short trailer showing actual play, and an issue-reporting process. Complete those before describing the build as a commercial release.

The long-term aim is a distinctive, polished underwater co-op game. The scale and content breadth of Halo, Subnautica or Assassin's Creed require sustained production; this pass improves the foundation without claiming that scale has been reached.

## Story and recovery ending

The finale now requires a deliberate docking maneuver at an armored auxiliary lift, followed by a protected twelve-second winch recovery. Passing the end of the route alone cannot award an escape. The pilot centers with A/D and holds S without boost for three uninterrupted seconds; support and survivor actions remain available until lock. The new server-authoritative phase and progress fields survive reconnects.

A three-shot incident record introduces NEREID-9, the acoustic survey, the severed main lift and the damaged pod. Local skipping cannot skip another crew member's opening; unanimous connected-crew skipping advances to the role countdown. See STORY.md for the current narrative and timing. The successful epilogue includes a later surface-tender recovery shot.

Validation for this pass: production build; 35 release, 30 ocean, 138 rules, 76 tactical, 79 network, 95 client and 26 model checks. A twelve-seed four-player balance run won 11 missions. The focused Chrome story review (`node test/browser-smoke.mjs --story-only`) captures the three opening shots, cradle approach, dock, lift, epilogue, surface rescue and report. Its visual fixture feeds validated piloting actions independently of slow software-rendered frames; keyboard and network behavior are checked in the separate client and network suites.

## Stutter and docking reliability follow-up

Piloting packets now run on a 70 ms timer independent of rendered frames. Focused pod buttons accept flight shortcuts, while typing and option controls remain isolated. Input disabling only releases controls on a state transition instead of sending cancellations on every snapshot. Walking advances through small collision steps using elapsed frame time, so a lower frame rate does not halve walking speed.

Only the visible station or cockpit animates. The hidden pod does not load for station survivors, off-screen pursuit anatomy is not animated, unchanged HUD text is not rewritten, and surface-wave normal updates are throttled. Sustained low frame rates reduce render resolution gradually with bounded, slower recovery. Changing sound/captions/brightness no longer reallocates the render buffer. Station flooding and station impacts cannot apply cockpit water or damage overlays.

Docking now has a governed approach, precision steering, a center indicator, capture progress and separate clamps, shutter and winch stages. Short packet gaps preserve capture progress and small alignment slips decay it; acceleration disengages the clamps. Once clamped, the shutter takes 2.4 seconds to seal and the crew remains exposed until closure. The stern camera shows the animated shutter; camera turns and lift motion interpolate. The propulsion deadline is displayed and cannot cancel an already clamped recovery.

Regression coverage includes a deliberate render stall during live client docking, focused-button steering, hidden-scene update counts, disconnected controls, delayed packets, small alignment slips, exposed shutter closure, and complete one-/two-/three-player endings. Performance and input checks are part of npm test. The twelve-seed balance pass still flags the existing six-player 75% win rate against its 80% target; one-, two- and three-player crews each won all twelve runs. This is a tuning limitation, not a failed docking regression.

Follow-up validation: 18 performance/input checks, 87 tactical checks, 79 network checks and 103 client checks pass, alongside the release, ocean and base rule suites. The focused Chrome sequence now uses actual keyboard braking from a focused pod button, without a server-side piloting driver. The recovery structure batches over fifty static parts into material instances and stays within a twelve-mesh draw budget; moving clamps and shutters remain independent. Capture, shutter and lift HUDs are compact after control transfers to the cradle.

## Pod visibility during attacks

The pilot now keeps a forward flight view with a small, illuminated stern-camera feed. The feed shares the existing scene and creature, caches a 256 x 144 render at up to eight captures per second, and restores the main render target, viewport, scissor and clear state. A full rear peek uses hold-R and returns forward on release or input cancellation. Attack shake is smaller.

The flight HUD is a short bottom strip. POD TOOLS opens buttons at the left edge and closes after discrete actions; hotkeys remain available with the panel closed. Empty decoys get explicit text instead of leaving a permanent control panel over the windshield. Warnings, captions and consent controls sit at the edges. The stern feed sits below the match timer.

Checks cover cached-feed frequency, viewport restoration, input release, collapsed tools, exhausted countermeasures, forward-view recovery and complete docking/ending flow. Actual browser captures check that the central flight corridor remains clear with zero decoys, an attacking contact and expanded tools at desktop and narrow widths. No server pursuit, damage, charges or escape rules changed in this pass.

## Rescue craft redesign

The generic capsule and blue circular window are replaced by the original MANTA rescue submersible in client/src/escape-craft.js. It has a tapered pressure hull, ivory upper armor, orange rescue panels, framed wraparound glazing, guarded twin propulsors with animated impellers, skids, service vents, a hatch and a lifting bridle. Transfer and compact maintenance variants appear in the station and ending scenes. The surface crane attaches at the lifting rig; ending camera angles show both the canopy and aft machinery.

Static detail merges by finish. The craft stays within a 24-mesh budget, and station variants fit the existing footprints with uniform scaling. Interaction positions, collisions, seat counts and piloting rules are unchanged. The model is locally authored and needs no asset download. npm.cmd run test:craft validates geometry, draw budget, cosmetic animation and fit.

## Whole-loop review and presentation pass — 17 October 2026

- Revive time is now included in the authoritative snapshot. A late snapshot or reconnect cannot restart a local sixty-second countdown.
- Hidden tabs release movement, rear peek and repair controls even without a blur event. Editable UI text is isolated from game controls.
- Replay clears damage/water overlays and chat state. Chat fade timers are released with their view. Ending cleanup disposes shared geometry, materials and textures once; corrupt stored crew logs recover when a new record is saved.
- Wreckage collisions have a distinct impact caption; evacuation no longer announces a blast-door lockdown. Total-defeat endings no longer invent surviving crew.
- Role-specific briefings show the actual pod capacity, followed by act titles and paced mission transmissions in the existing radio transcript. Desktop and narrow layouts are checked in Chrome. No dialogue pauses or additional central overlays were introduced.
- The opening and epilogue use eased camera motion with static reduced-effects views. Station fates have a separate flooding-room/beacon scene. Successful routes keep the MANTA and Asterion recovery shots.
- Small first-person height/strafe feedback and a three-degree sprint FOV transition follow actual distance travelled. Walking into walls settles the effect. Repairs, downed/spectating states, menus and reduced effects disable it. Movement speed, collision rules, oxygen and finale difficulty remain authoritative and unchanged.

The new presentation suite checks pacing, reconnect behavior, seat-aware briefings, camera bounds, server revive time, ending consistency, saved records and texture cleanup. It is included in npm test. This remains a playtest build: real hardware frame rates, larger human crews and the existing six-player balance diagnostic still need dedicated playtesting before a public release.

Validation: production build; the complete npm test chain (35 release, 26 performance/input, 25 presentation, 13 craft, 30 ocean, 138 rules, 87 tactical and 79 network checks); 113 client checks; 26 model checks; and a complete 26-check real Chrome/WebGL walkthrough covering station play and the survivor ending. The focused recovery sequence additionally checks both briefing sizes, unobstructed attack controls, clamps, shutter, winch and the surface rescue. The approximately 805 KB main bundle still triggers Vite's size advisory. Software WebGL captures validate presentation and interactions, not frame-rate guarantees on players' GPUs.

## Underwater audio redesign

The former oscillator beeps, rising repair chimes and victory melody have been replaced by 32 original WAV assets. Offline sound design layers filtered turbulence, resonant steel, pressure transients and mechanical noise. The sound bank covers hydraulic doors/clamps, relay confirmations, suit alerts, hull strikes, breaches, creature calls, footsteps, wading, swimming, pod propulsion and separate station/deep-water/surface atmospheres. Nothing synthesizes a waveform in the render loop.

The shared audio engine caches decoded buffers with three concurrent loading workers. It applies HRTF positioning to spatial events, underwater filtering, warning ducking, compression and a 28 Hz high-pass filter. Effects are limited to twenty simultaneous voices with priority admission and cue cooldowns. Persistent ambience and two pod loops are reused; menus and hidden tabs mute them, and ending a match stops transient effects. Muting sound preserves important captions. Missing audio assets fail silently and can retry on another gesture.

Master, ocean/machinery and effects/alerts sliders are saved locally. Old preferences gain sensible defaults; invalid levels are bounded. Walking sounds follow actual distance and cannot repeat against a wall. They are cosmetic and do not change the server's acoustic signature rules. Epilogues crossfade to the appropriate room/ocean/surface beds, and their outcome cue follows the player's individual fate. The production handler serves WAV with the correct MIME type.

Validation: production build, 120 audio checks, 36 release checks, 25 presentation checks, 113 client checks and a 29-check real Chrome gameplay walkthrough. A separate Chrome audio test decodes all 32 files, exercises playback/spatial/loop nodes and renders a five-effect offline mix (peak 0.407, RMS 0.077). These are functional and signal checks, not a substitute for listening on different speakers/headphones. The 29-second audition reel is test/artifacts/sound-preview.wav; source and provenance are documented in ASSETS.md. The bank is 4.51 MiB; the approximately 809 KB main JS bundle retains the existing Vite size advisory.

## Station identity and readable atmosphere

The archived reference inspired room identity, architectural framing and visible damage. The current game's layout, task positions, collision routes, movement, story, sonar and finale remain intact. No reference-game code, surprise sonar sweeps, microphone gameplay, fear filters or blackout effects were imported.

`client/src/station-detail.js` provides original Control survey equipment and incident records, a protected Engineering power bus and tool storage, a Medical treatment cot and supplies, and transfer-bay infrastructure and severed-lift route signage. Overhead service trays, bulkhead headers, route arrows and restrained floor bounce connect the rooms. Wall records describe the existing 06:17 incident and basalt-ridge recovery, without adding another story branch.

All five furniture replacements fit the original crate footprints. The two storage chests also preserve the original crate heights to keep windows visible. Static geometry merges by material; the new layer has sixteen drawable objects including all four damage overlays and both particle systems, with approximately 13,000 vertices. It replaces the former individual identity strips and crate visuals, adds no lights or shadow passes, and introduces no full-screen rendering passes. The cot has rounded padding; the power bus remains a narrow landmark. Beam particles follow the flashlight and quality setting; pressure spray is bounded and updates at ten Hz. Reduced effects hides beam motion and freezes spray without repeated uploads.

Room lighting uses calmer, distinct industrial colors, an amber emergency level, and milder brief dips with a readable illumination floor. Hull strikes retain a capped cosmetic impact count per room in authoritative snapshots, so window scars survive reconnects. Scars are thin transparent markings. Breaches use inward pressure spray instead of a vertical cylinder; existing repair indicators remain available.

Validation: production build; the complete npm test chain (36 release, 26 performance/input, 27 station, 25 presentation, 120 audio, 13 craft, 30 ocean, 139 rules, 87 tactical and 79 network checks); 113 client playthrough/replay/reconnect checks. The station browser review (`node test/browser-smoke.mjs --station-only`) captures Control, Engineering, Medical, transfer bay, damage, emergency lighting and Low/reduced-effects mode, along with the opening and briefing. Screenshots are in test/artifacts/station-*-detail.png. Draw budgets and software-WebGL visual checks do not establish a real-hardware FPS guarantee. The approximately 818 KB main bundle retains the existing Vite size advisory.
