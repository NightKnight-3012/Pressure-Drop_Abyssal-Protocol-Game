# Pressure Drop: Abyssal Protocol

A co-op, first-person deep-sea survival horror game that runs in the browser, for **1 to 8 players**
(4 to 8 recommended).

A research station is flooding and a blind **Leviathan** circles outside. It hunts by **sound**. Your crew has
four departments, a handful of failing systems, and an escape pod that has **fewer seats than people**.
Repair the station, keep the air breathable, stay quiet, survive the lockdown, and decide who gets left behind.

Built with Three.js, Vite, Node.js and Socket.IO. No paid services or API keys.
Visuals use free CC0 models by Quaternius and Gobkit alongside original procedural geometry; sound uses the original local audio bank. See `ASSETS.md`.

**Tactical horror update:** the launch now starts a playable pod pursuit alongside a collapsing-station survivor route, with shared noise decisions and personalized endings. See [the updated step-by-step guide and controls](TACTICAL-HORROR.md). On Windows PowerShell use `npm.cmd` in place of `npm` in the commands below.

See [release status and known limitations](RELEASE-STATUS.md) for the current playtest gates and validation scope. Escape opens the in-game menu; multiplayer continues while it is open.

## Quick start

Requirements: [Node.js](https://nodejs.org) 24.20 or newer (required for built-in SQLite persistence) and a modern browser with WebGL.

```bash
npm install        # installs everything (run once)
npm run assets:download # optional: bundle the online models locally for offline play
npm run dev        # starts the game server (port 3000) and the client (port 5173)
```

Open **http://localhost:5173**, enter a name and click **Create room**. Friends open the same address and
join with the 5-letter room code. On the same Wi-Fi they use the "Network" address that `npm run dev` prints
(on Windows, allow Node.js through the firewall when asked).

### Test with a full crew when you are alone

```bash
npm run bots              # in a second terminal: creates a lobby with 7 bots and prints a join code
npm run bots -- 3         # 3 bots
npm run bots -- 5 ABCDE   # add 5 bots to your own lobby ABCDE
```

Join the code, pick a department, press **Ready**. Bots wander (and sometimes sprint, which is noisy), vote,
and return to the lobby after each match. They do not repair anything, so you have to.

### Run as a single server (events, demos)

```bash
npm run build      # builds the client into client/dist
npm start          # serves the game AND the website on http://localhost:3000
```

## The game

### Passing equipment

Press **Q** to select a carried slot, then **Backspace** to put that item down. A teammate with an empty slot can approach it and **hold the interaction key for one second** to recover it. In the wrist computer, clicking a hotbar slot selects it without spending it; the **Put down** button works with mouse or keyboard focus. Outside the wrist screen, hotbar buttons retain their normal use action.

Transfers preserve the single charge and department restrictions. Alloy can be passed; the pump regulator stays secured as mission cargo. Drops are available only before launch, inside or at the marked exterior survey level, and remain until recovered or the match resets. Loose gear is capped at four items per starting crew member; reaching that cap refuses a new drop without consuming it. No added supplies, credits or required exploration. Gear is placed at the server-validated player position, with a short drop cooldown and exclusive, cancellable recovery. There is no throwing, physics drift or automatic recovery from a lost player's carried inventory.

Run `npm run test:gear-sharing` for pure-rule and four-diver network checks. `npm run test:client` exercises actual put-down/recovery controls; after building, `node test/review-current-ui.mjs --gear-only` captures the recovery and wrist screens at 1280×720 and 520×640.

### Authored escape collapses

The three existing falling obstacles now appear as a broken lift gantry, torn wreck bulkhead and sheared survey conduit. Their fall follows authoritative route progress, so reconnects and reduced effects preserve the same hazard. A one-time server warning and caption identify the blocked lane about three seconds ahead even at maximum boost; the continuous HUD warning also survives reconnects. The two other lanes remain clear. Damage, obstacle count, route length and steering are unchanged; these are authored replacements for existing hazards, not added difficulty. Reduced effects removes decorative roll while retaining the necessary fall.

Run `npm run test:collapse` for telegraph/damage checks at every crew size and finite geometry/lane-envelope checks. For isolated scenery captures: `node test/build-route-preview.mjs`, then `node test/review-current-ui.mjs --collapse-only`. These renders do not measure hardware FPS or replace full cockpit playtesting.

### A match, step by step

1. **Lobby**: everyone picks a department and readies up. The host starts the mission. (Unchosen departments are
   filled automatically, and when there are 4+ players every department is guaranteed to be covered.)
2. **Briefing** (10 s): your role, the selected mission variation and the plan.
3. **The mission**: calibrate and repair systems, patch breaches, manage oxygen and noise, handle the lockdown.
4. **The escape**: start the pod launch. If there are more survivors than seats, the crew **votes** who stays behind,
   then everyone else has 35 seconds to board.
5. **Final approach**: pilot and support the pod through wreckage while station survivors choose between attracting the monster and repairing personal capsules. Neither route ends the other's game.
6. **Epilogue and summary**: a personal cinematic, actual extraction outcomes, commemorations and contributions. Expedition records are saved in the browser.

### Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click the screen to capture the mouse, Esc to release) |
| Shift | Sprint: fast but **noisy** and tiring (about 3 seconds, then catch your breath) |
| Hold E | Repair / patch / revive / use the panel you are next to |
| E (tap) | Open the Command console when you stand at it |
| 1 to 4, 5 | In the console: toggle a blast door, launch the decoy |
| F | Flashlight |
| Tab | Wrist computer (during active station play) |
| Enter | Chat to the crew (Esc cancels) |
| Tab / P | Spectators: next crew member / ping their location |

### Departments

| Department | What it is best at |
|---|---|
| **Engineering** | Repairs the Power core, the pump and hull breaches in about half the time |
| **EVA Diver** | The only crew allowed through the airlock. Repairs the cable junctions outside |
| **Command & Sonar** | Reads the sonar, operates the blast doors from the console, launches a decoy |
| **Medical & Logistics** | Heals injuries, revives faster, refills oxygen faster, runs life support |

Everyone *can* do every task (just slower), except the airlock, which is divers-only whenever a diver is alive.
That keeps small crews playable.

### Systems and hazards

| System | What it does |
|---|---|
| Power core (Engineering) | Powers the lights, pump, doors, airlock and sonar. Do this first |
| Flood pump (Engineering) | Drains every room. Needs power. About 4 open breaches outpace it |
| Command console (Control Room) | Sonar, remote doors, decoy. Running becomes 40% quieter |
| Life support (Medical Bay) | Unlocks the Oxygen reserve, which refills station oxygen (short cooldown) |
| Cable junctions (outside) | Divers repair 2 (4 or fewer players) or 3 (5+) junctions |
| Pod launch console | Needs everything above. Starts the escape |

- **Hull breaches** appear in random rooms. Patch them (hold E) or the water keeps rising. Each room floods
  separately; open doors let the water spread, **sealed doors keep it in** (and keep people out).
- **Drowning**: water above head height hurts. **Oxygen**: when station oxygen hits zero everyone suffocates.
- **Down but not out**: at 0 health you collapse. A teammate can revive you (hold E). After 60 seconds you are
  lost and become a spectator.
- **Sprinting makes noise.** Machinery and divers make a little too.

### The Leviathan

It has five states: **patrol, investigate, approach, attack, retreat**. Noise increases its hidden threat level and silence lowers it. Your suit shows your own acoustic signature; Command reads detailed sonar.
It heads for the loudest noise, presses against the hull (the hull groans: freeze!), then rams the nearest part of the
station: that room floods, a new breach opens and everyone inside is hurt. A single burst of sprinting is forgiven; a whole
crew sprinting together is not. Command can launch a **decoy** that lures it to the far side for 18 seconds.
Divers outside are in real danger when it is close.

### The lockdown (the crew gets split)

A few minutes in (earlier with bigger crews), the station slams the blast doors on the **two rooms holding the most
crew**. Those groups are now isolated and must **hold their own door panels at the same time** (8 seconds) to override it.
If the other sealed room is empty, one person can override alone (slower). If nobody is trapped, the doors release by
themselves, so a lockdown can never lock the crew out of the game for good.
While sealed, the **walkie-talkie is glitchy**: chat between sealed sections arrives garbled.

### The escape and the vote

The pod has fewer seats than the crew: 3 / 4 / 5 / 6 / 6 seats for 4 / 5 / 6 / 7 / 8 players (smaller crews all fit).
When there are too many survivors, everyone drafts and explicitly confirms who stays behind, or abstains. Voting for yourself means you **volunteer** (counts
double). Ties, or no votes, are decided by a published rule: **the crew member with the fewest contributions stays**. The
server resolves it; nobody is picked at random or in secret. Left-behind players cannot board the pod but stay in the game, including during its pursuit. Use the actual hatch to board. See [the finale guide](TACTICAL-HORROR.md#second-act-two-simultaneous-routes) for beacon, capsule and pod controls.

### Scaling with crew size

| Players | Breach every | Max breaches | Oxygen drain | Lockdowns (first at) | Cable junctions | Pod seats |
|---|---|---|---|---|---|---|
| 1 | 44 s | 2 | 0.22%/s | none | 2 | 1 |
| 2 | 40 s | 2 | 0.25%/s | 1 (110 s) | 2 | 2 |
| 3 | 36 s | 3 | 0.27%/s | 1 (110 s) | 2 | 3 |
| 4 | 31 s | 3 | 0.3%/s | 1 (105 s) | 2 | 3 |
| 5 | 28 s | 4 | 0.33%/s | 1 (95 s) | 3 | 4 |
| 6 | 25 s | 4 | 0.35%/s | 1 (90 s) | 3 | 5 |
| 7 | 22 s | 5 | 0.38%/s | 2 (80 s) | 3 | 6 |
| 8 | 20 s | 5 | 0.4%/s | 2 (75 s) | 3 | 6 |

Edit the numbers in `shared/layout.js` (scaling table) and `server/game.js` (`TUNING`).

### Accessibility

Options are in the menu and lobby, and are saved in your browser:

- **Captions** for important sounds (sonar pings, hull groans, strikes, alarms, breaches, low oxygen)
- **Colour-blind safe palette** (blue and orange). Status text also uses symbols, never colour alone
- **Reduced effects**: no screen shake, flashing, light flicker or pulsing
- Mouse sensitivity, sound on/off

## Multiplayer design

- The **server is authoritative** for everything that matters: flooding, oxygen, health, stamina, repairs, doors, the
  Leviathan, the lockdown, the vote and the win/lose result. Clients send movement, interaction and equipment intents; the server resolves their effects.
- Every message is validated: types, lengths, ranges, speed limits, wall and door collisions, repair distance,
  permissions, and rate limits. The test suite fires hundreds of malformed messages at it.
- If the server rejects a move it tells the client where it really is, so nobody gets stuck out of sync.
- **Reconnecting**: refresh the page or lose Wi-Fi and you are put back in your seat (90 seconds during a match, 20 in the
  lobby). Your character is safe and invulnerable while you are away.
- The host leaving hands the host role to another player.
- Chat is a separate module (`client/src/chat.js`, `server/net.js`), so **voice chat can be added later without touching
  the gameplay code**. There is no voice chat yet, and the game does not pretend there is.

## Project structure

```
shared/layout.js        Station layout, doors, stations, departments, scaling table. Used by BOTH server and client
server/index.js         HTTP + Socket.IO bootstrap (also serves client/dist when built)
server/net.js           Rooms, lobby, chat, reconnecting, validation, match lifecycle, 20 Hz broadcast
server/game.js          Pure game rules: tasks, flooding, oxygen, health, stamina, doors, lockdown, vote (+ TUNING)
server/leviathan.js     The Leviathan state machine
server/finale.js        Independent pod/station routes, reserves, pursuit and diversion consent
shared/tactical.js      Mission variations, calibration definitions and finale interaction points
server/scripts/         bots.js, balance.js and the test suites
client/src/main.js      Screens and socket wiring
client/src/lobby.js     Lobby screen
client/src/game.js      Game loop, movement, interaction, console, spectating, vote, events
client/src/world.js     The 3D station: windows, doors, panels, water, breaches, ocean, Leviathan
client/src/hud.js       HUD, vote, briefing and summary screens
client/src/sonar.js     Sonar display
client/src/chat.js      Crew chat
client/src/options.js   Accessibility options
client/src/audio.js     Generated sound effects, ambience and captions
client/src/pod-view.js  Playable pod cockpit and wreckage route
client/src/epilogue.js  Personal in-engine endings and local expedition records
test/                   Browser-simulation test
```

## Testing

```bash
npm test               # rule, tactical/finale and real multiplayer checks
npm run test:client    # real client + server, including replay and in-game menu
npm run test:release   # production HTTP, movement paths and stored display preferences
npm run test:models    # model loading and animation integration
npm run test:ocean     # swim direction, body wave, terrain, wreckage and resource ownership
npm run test:browser   # actual Chrome/WebGL smoke checks and screenshots; build first
npm run balance        # a scripted crew plays full matches at every crew size
REACTION=25 RUN=0.4 npm run balance    # ...a slow, noisy crew (how often do they lose?)
```

The client simulation stubs WebGL. The separate Chrome test renders actual scenes and saves screenshots under `test/artifacts`.
Scripted crews can lose; this is a balance diagnostic rather than a guarantee of survival. Decisions are seeded, so repeated runs are reproducible. The current twelve-run sample per crew size wins 92–100%; see the equipment section for the limits of that simulation. Human playtesting is still needed, especially for large crews.

## Known limitations

- Voice chat is not implemented (text chat only).
- Online models require network access unless installed locally with `npm run assets:download`.
- The station shell, cockpit and cinematic staging use procedural geometry alongside the imported models. Screenshots cover station interactions, repairs, cockpit, compact HUD and endings.
- Names, rooms and layout are fixed: one station map.
- The scripted balance crew is an approximation; real crews will differ, so adjust `TUNING` after playtests.
- If you host publicly, put the server behind HTTPS and set `CORS_ORIGIN` if the client is on another domain.

### Limited equipment and mission timeline

Every crew member begins each match with **one flare, one acoustic lure, one repair kit and one department tool**. Press **1/2/3/4** to use the corresponding slot, or **Q** to select and **X** to use. The same numbered keys still operate doors while the Command console is open; pod controls keep their existing meanings. Equipment is unavailable in the finale. Button tooltips explain each trade-off.

- A flare lights its deployment position for 24 seconds, but its hiss increases Leviathan noise. Leave it behind when moving quietly.
- An acoustic lure distracts the Leviathan toward the deployment angle for 10 seconds. Use it before a committed strike, then move away quietly. A shared 16-second channel cooldown prevents eight players chaining permanent protection; the Command console decoy remains available.
- While holding **E** to patch a breach, press **3** to cut the remaining repair time by up to half. Keep holding E; the kit does not instantly seal a breach. Leaving or releasing cancels the repair, and the kit is spent. Nearly finished holds preserve the charge instead of wasting it.

Flares and lures deploy at the server's player position. No client coordinates, charges or repair results are trusted. Inventories persist through reconnect and reset only on a new match. Four occupied slots fit the four-slot inventory limit. Finite shared lockers can replenish spent shared equipment; there is no crafting or thrown-device physics yet. Deployment makes one positional sound with a caption; device audio does not loop yet. Device visuals use eight pooled meshes, at most two unshadowed lights (one active on Low), and no flashing or camera shake.

**Slot 4 is your department tool, with one charge per match:**

| Department | Tool | Effect and trade-off |
| --- | --- | --- |
| Engineering | Portable welder | Hold E at a nearby breach, then press 4. Reduces remaining patch time by up to 65%, while generating loud machinery noise until completion or cancellation. Releasing E still cancels the patch and spends the charge. Cannot stack with a repair kit on the same hold; nearly finished holds preserve the charge. |
| Command | Active scanner | Shares the Leviathan's last-known position for six seconds. Every crew member gets a distance, relative bearing and age in the hotbar. This is a fixed sample, not live tracking. The pulse makes noise for 1.5 seconds, and a shared 25-second channel cooldown prevents chained scans. |
| Medical | Emergency air canister | Inside: adds 12 percentage points to station oxygen. Outside: adds 30 seconds to your own suit. Both clamp to capacity. Full reserves reject use without spending the canister. It cannot revive or heal. |
| EVA | Airlock home marker | Outside only: shares a 60-second bearing to the real exterior airlock approach for all outside crew. The battery is spent. Another EVA cannot overwrite an active marker and keeps their battery. This is a direct bearing; it does not plot a safe path around the hull or obstacles. |

Only the assigned department can activate its signature tool. Missing roles do not block tasks or launch, and crews of 1–8 receive one tool per player with no additional required objectives. The hotbar becomes two rows on compact screens; static control reminders hide during active guidance to keep it readable. Scan/return guidance uses text, distance and direction instead of colour; reduced effects require no special animation. No extra 3D models or lights are added by signature tools. Sounds use the existing original audio bank with distinct captions; held tools do not yet have hand animations or looping audio.

After the ending, expand **MISSION TIMELINE** to see server-recorded repairs, deployments, rescues, lockdowns and escape decisions, with timestamps and crew names. It retains the most recent 160 significant events and is a match recap rather than persistent account statistics.

Run `npm run test:equipment` for shared/role equipment, permissions, noise, cooldowns, repair, air caps, reconnect snapshots, visual budgets and timeline checks. `npm run test:roles` focuses on signature tools. `npm test` also exercises four simultaneous outside deployments and signature tools through real Socket.IO clients; `npm run test:client` checks the real hotbar, shortcuts and shared guidance. `npm run test:visual` reviews the hotbar and combined scan/airlock readouts at 1280×720, 960×640 and 520×640 after a build.

This phase's twelve seeded balance runs per crew size won 100% at sizes 1–5 and 8, and 92% at sizes 6–7, unchanged after signature gear. The scripted crews do not use equipment, so these results verify that the base route remains winnable without spending gear. Equipment-specific tests separately exercise lure protection, welder/scanner noise, repair speed and oxygen recovery; human playtests are still needed to judge tool usefulness.

### Finite shared supply lockers

The existing drawer cabinet in **Engineering** and emergency storage in **Medical** now dispense real equipment. Walk to the front and **press E**. Choose a supply with the mouse or Tab/Enter. **Escape** closes the panel; movement remains available after clicking a button, and walking out of reach closes it automatically. Suit meters and the hotbar remain visible. Manual stores work without station power and seal once launch starts.

Engineering stocks flares and repair kits; Medical stocks acoustic lures and a repair kit. Stock is shared by the entire crew and scales using the existing junction/breach tiers:

| Crew | Engineering | Medical |
| --- | --- | --- |
| 1–2 | 1 flare, 1 repair kit | 1 lure, 1 repair kit |
| 3–4 | 1 flare, 2 repair kits | 1 lure, 1 repair kit |
| 5–6 | 2 flares, 2 repair kits | 2 lures, 1 repair kit |
| 7–8 | 2 flares, 3 repair kits | 2 lures, 1 repair kit |

Checkout fills your **first empty slot**; its number and new label appear in the hotbar. It never replaces or drops carried gear. A full inventory or exhausted item rejects the request without spending stock. Checkout has a one-second dispenser cooldown and cannot bypass equipment-use cooldowns. The server validates the room, front-side access, distance, stage, item and player state, then decrements stock and grants exactly one item synchronously. Simultaneous requests for the last item cannot duplicate it. Reconnecting keeps stock depleted; only a new match restores it. Taking supplies earns no contribution points and is recorded in the mission timeline.

This phase replenishes **shared equipment only**. Department tools retain one charge per match. There is no crafting, item trading, dropping, replenishment timer or mandatory locker objective. Mounted labels use two small meshes with no new lights or collision changes. The supply-drawer cue reuses original local audio and has a caption.

`npm run test:lockers` covers acquisition, stock scaling, last-unit contention, invalid requests, capacity, range/front-side access, cooldowns, snapshots, reachable working positions, panel behavior and input focus. The multiplayer suite also races four real clients for the last unit and reconnects to depleted stock. Client checks cover actual interaction, checkout, movement, hotbar updates and Escape; screenshot checks compare panel bounds against meters, hotbar and objective at 1280×720, 960×640 and 520×640.

The balance diagnostic was repeated after lockers: 100% team wins at sizes 1–5 and 8, and 92% at sizes 6–7 (12 seeds per size). Those scripted crews do not visit lockers, so this verifies the base route remains winnable without reserve supplies; human playtests still need to assess how extra stock affects difficulty.

### Optional exterior supply recovery

Moored emergency canisters appear near the hull and on optional survey expeditions. Swim close, face a canister and **hold E for two seconds** to recover its labelled supply. Opening it adds real noise; moving away, releasing E, going inside or losing inventory space cancels recovery without consuming it. Make room before leaving: collecting fills the first empty inventory slot and never replaces carried gear. Use its displayed hotbar number after returning inside, or deploy a flare/lure outside when useful.

Each match seeds both sites and contents independently of the main rules RNG. There are **2 canisters for 1–2 crew, 3 for 3–4, 4 for 5–6 and 5 for 7–8**. A repair kit stays on the near-hull west airlock route, and at least one other canister is placed at an optional survey landmark. Remaining supplies are repair kits, flares or acoustic lures. One canister holds one item. Collection removes it for everybody, reconnect cannot respawn it, and a new match restores a newly seeded set. Recovery earns no contribution points and appears in the mission timeline.

The server validates target ID, match stage, active player, exterior state, distance, exclusive hold and inventory capacity throughout recovery. All clients send is an interaction intent. Recovery is available before launch only and never becomes a launch prerequisite. The suit objective explains optional supplies and the west Medical airlock; the EVA home marker remains a timed direct bearing rather than obstacle avoidance. Keep watching suit oxygen.

Canisters are original curved pressure vessels with protective end bands, handles, reflective strips, mooring cables and seabed anchors. Different supplies have different proportions, and the interaction prompt names the contents, so identification does not depend on colour. All instances share **six render batches**, with no new lights, shadows, flashing or animation. Recovery has a captioned positional mechanical cue from the existing local bank.

Run `npm run test:resources` for deterministic spawning, 1–8 scaling, collision-free routes, round-trip air budget, cancellation, capacity, contention, noise, snapshots, replay and rendering budgets. A rule test recovers a kit, returns through the real airlock and uses it to accelerate an actual breach repair. Multiplayer checks contend with four outside clients and reconnect after collection; client checks exercise the prompt, partial cancellation, recovery and airlock return. Visual checks review full-inventory and recovery states at 1280×720, 960×640 and 520×640.

The twelve-seed balance sample per crew size remains 100% team wins at sizes 1–5 and 8, and 92% at 6–7. These scripted crews ignore pickups, so this confirms the base mission does not depend on exploration. Human playtesting still needs to assess the value and risk of taking detours.

Recovery replenishes shared equipment only. It does not add scrap, crafting, logs or system-upgrade salvage. Suit-air drain is unchanged.

### Expanded exterior survey area

The exterior is now **120 × 120 metres**, with the original near-hull required-work apron kept clear. All cable-junction positions, required task counts, station rules and escape controls remain the same. Four areas give divers different sights and navigation choices:

- **Station flats:** the hull, airlock and required junctions, with a marked circulation loop.
- **West vent garden:** lower visibility, branching deep-water fans and weathered outcrops. It uses deep-sea growth rather than sunlit kelp.
- **East survey wreck:** a ribbed hull and deck with two open entrances, solid side walls and baffles to swim around.
- **North basalt cleft:** a passage between tall eroded rock walls, reached from the north side of the station loop.

Seabed-anchored route posts and mounted names lead to the optional destinations. The survey edge has illuminated posts, signs and a visible safety net matching the authoritative collision boundary. Command's sonar map now covers the expanded area and shows route lines, obstacles and labels. Region names appear on the suit HUD; fog blends between profiles, and the flashlight's useful range changes with visibility. Quality settings, captions and reduced effects stay available.

The **return-air warning** estimates direct travel time to the Medical airlock plus an 18-second allowance, with a minimum reserve of 20 seconds. It takes priority over the survey-boundary warning. This is an early caution, not an obstacle-aware route or a guarantee of enough air after detours. Use the marked routes, watch the suit timer and return before exploring another branch. The EVA marker still provides its timed direct bearing. All exploration and extra supplies remain optional for crews of 1–8.

Authoritative obstacle footprints live in `shared/layout.js` and are used for both client movement and server path validation. Large background rocks and torn hull decorations were moved beyond the survey fence; the playable area uses deliberate shared collision footprints. The receiver uses its shared position. Patrol visuals rise over new ruins/outcrops and settle back to the original height near the hull; the server's predator rules, noise response and attacks are unchanged.

The new survey scenery uses six static material batches plus one sign atlas, without additional lights or shadow passes. Existing procedural industrial and rock textures are reused. Run `npm run test:survey` for footprint, route, boundary, crew-size, warning and model checks, and `npm run test:survey:visual` after building for real browser captures of each area and compact warnings. Network tests swim past the former edge and verify wreck-wall and perimeter rejection. Balance remains 100% team wins at sizes 1–5 and 8 and 92% at 6–7 over 12 seeded runs per size; those crews stay on required work and do not exercise optional expeditions.

**Current limits:** swimming is still at a fixed depth; there is no vertical control, depth-pressure drain, submersible or additional creature AI. The Leviathan retains its station-oriented hunt, so the new farther areas mainly challenge navigation, air and visibility. This is the larger survey area, not a finished open-ocean simulation. Human testing should cover detours, returning with low air and multiplayer visibility.

### Pump complication and Leviathan listening pass

Once per match, 55–90 seconds after the start (seeded), debris obstructs the flood-pump filter **after the pump has been repaired**. Output falls to 85%. This is optional: it never locks launch or exterior work. Return to the Engineering pump and hold E for six seconds (Engineering takes 3.3 seconds) to clear it and raise output to 110%. Clearing makes machinery noise. Any role can do it, and the job count stays at one for crews of 1–8. The suit objective guides Engineering; everybody receives the warning and reward message. This is the first complication, not a full random-event catalogue.

During an investigation, the Leviathan can make one short physical listening pass after noise falls away. Its real position moves closer, accompanied by directional scraping and a caption. Staying quiet lets it retreat; this does not force an attack or add damage. Continued noise still uses the existing escalation rules. No extra creature model, shadow scene or scripted fake monster is spawned.

`test/complication-checks.mjs` covers seed timing, role/crew scaling, validation, cancellation, pump drainage, timeline recording and quiet/noisy encounters. The balance sample above was repeated after this phase with the same win rates. Those crews ignore the obstruction, so the penalty remains survivable without the bonus.

See [RELEASE-STATUS.md](RELEASE-STATUS.md) for implemented features, known limitations and validation requirements.

### Story and final recovery

Each mission opens with the NEREID-9 incident record, then the role briefing. Skip dismisses the record locally; if the entire connected crew skips, the shared role countdown starts early.

The pod slows automatically near the armored recovery shaft. Use the alignment display to center with **A/D**, release boost and **hold S for three seconds** to engage the clamps. The cradle then holds the pod while the shutter closes; keep repairing until the seal completes. The lift secures the pod while station survivors continue their own escape. See [STORY.md](STORY.md) for the backstory and ending.

Rendering now adjusts its pixel resolution during sustained low frame rates. Piloting updates run independently of rendering, and the game animates only the visible station or cockpit scene. `npm.cmd run test:performance` checks resolution behavior and input handling.

During pod flight, the small stern-camera feed shows attacks while the main view stays on the route. **Hold R** for a full rear peek; release it to return forward. **POD TOOLS** opens the action buttons at the edge of the screen; keyboard shortcuts stay available with the panel closed. Running out of decoys does not cover the windshield or change the camera.


### Optional wreck salvage: pump regulator

One regulator waits at the north end of the Survey Wreck (38, -12), beside the marked route. Command's map marks it with a square and PART label. Any department can recover it; it never blocks the required mission and there is only one per match for crews of 1?8.

Use a shared tool first to free a hotbar slot. Swim to the regulator and hold E for 3 seconds. Recovery makes noise. Carry it back through the Medical airlock, repair the Engineering pump and restore station power if needed, then hold E at the pump for 4 seconds to install. Installation also makes noise. The regulator is cargo: pressing its hotbar key explains installation and does not consume it.

The upgrade adds 20 percentage points of pump output: normal 120%, clogged 105%, or serviced 130%. It does not repair the pump, clear a clogged filter, restore oxygen or prevent attacks. The wrist systems display reports the resulting output. Recovery and installation appear on the match timeline; there are no repeatable contribution rewards. No new lights, shadows or per-frame animations were added; the existing six instanced supply batches now accommodate five canisters plus the regulator.

Releasing E, moving away, becoming inactive or starting launch cancels work without consuming the part. Installation also cancels if power fails. Cargo persists during a reconnect window. If its carrier is permanently lost, the component resets to the wreck recovery cradle and is removed from that player's inventory. This recovery reset is a small-version concession; there is no physical dropped-cargo simulation, trading or crafting yet. Downed carriers can still be revived. The upgrade lasts only for that match.

Validation: npm run test:salvage covers recovery/install validation, crew sizes 1?8, contention, cancellation, power loss, cargo use, airlock return, loss/reconnect and exact drainage rewards. The resource route test also checks a collision-free round trip to the regulator within a full suit's air budget. Network tests exercise four competing divers and installation broadcasts; the real-client simulation checks recovery, hotbar guidance and installation. Browser screenshots review recovery prompts at 1280?720 and 520?640. The balance sample remains 100% wins for crews 1?5 and 8, and 92% for 6?7 (12 seeds each). Those bots ignore optional salvage, so human playtests must judge whether the expedition is worth the risk.


### NEREID-9 evidence and control preferences

Twelve original records are distributed around the station and outside. Each seeded match selects three indoor and two exterior terminals; none are required. Hold your interaction key for one second at an unread terminal. Its evidence is shared with the crew, captioned without stopping movement, recorded in the timeline, and saved in this browser's case file. Open CASE FILE from the menu or lobby to read at your own pace. Reconnecting recovers discoveries from the server snapshot; local storage failures do not stop the game. Stored progress is local to the browser, not an account or cloud save.

The closing report now distinguishes a lost expedition, an escape that left someone behind, an evidence-bearing escape (at least three records), and an escape with the mystery unresolved. These complement the existing individual sacrifice/capsule/pod cinematics. Asterion radio messages now acknowledge initial flooding, low air and a closing contact, with a bounded queue and captions. Voice remains the authored sound bank plus text, without paid speech services.

Options now include inverted vertical look, 60?100 degree station FOV, and remapping for movement, sprint, flashlight and interaction. Select a binding button and press a new key; Escape cancels. Duplicate bindings and reserved chat/pod/hotbar shortcuts are rejected. Arrow keys stay available, reset restores defaults, and interaction prompts display the assigned key. Other tutorial/objective text still names the default keys. Options persist locally and recover safely from corrupt storage.


### Salvaged alloy, fabrication and counterable hazards

Exterior alloy caches are seeded separately from supplies (2?5 caches using the crew scaling table). Each holds one alloy item and takes one inventory slot. Hold E for two noisy seconds to recover it. At the powered Engineering stores, shared supplies are still available; the fabrication list below them trades carried alloy for one tool. Common flare/lure/repair recipes cost one alloy; original signature tools cost two. Additional role tools are Engineering's temporary pipe clamp, EVA's sonic prod, Command's EMP and Medical's trauma kit. Role restrictions, costs, first material slot, proximity/front-side access, power, match phase and the two-second fabrication cooldown are all server-validated. No inventory item is silently overwritten. Materials are finite; this is not a crafting tree or trading system.

- Skitters enter through an existing breach after power and the pump are restored. Claw warnings give eight seconds before they move and bite. Patch that breach to remove them, use a nearby flare to hold them off, or stun them with an EVA sonic prod. Up to three skitter units scale with the existing breach cap. They currently target crew, not machinery, and expire after a limited encounter.
- Live-water faults announce their room eight seconds before shocks start. Drain below 0.15m or isolate the local circuit using its marked floor switch (hold E 1.5s). Command can also isolate circuits from the console. Local lighting goes dark; critical machinery remains on a separately isolated backup supply. EMP briefly suppresses a fault too. Faults clear after 45 active seconds.
- Three anchored sensor mines occupy optional survey detours, away from required cables. Their ring and a persistent near-mine warning identify them. A nearby lit diver or flare charges a four-second fuse; turn off your lamp and back away, route around the mine, or let Command disarm it with a nearby EMP. This version uses anchored mines rather than drifting physics.
- The Warden is a single late contact, gated behind restored sonar and exterior cables. It follows light rather than the Leviathan's noise. A warning precedes its hunt; turn off your lamp and isolate local circuits, divert it with a flare, or interrupt it with an EMP. It can strike a lit room after committing to it. It leaves after a limited encounter and does not join the existing escape-pod chase yet.

A clamp stops one leak for 20 seconds but does not patch it. A sonic prod stuns nearby skitters for ten seconds and cannot kill the Leviathan. An EMP interrupts nearby skitters, disarms nearby outside mines, interrupts the Warden and briefly darkens local lighting. A trauma kit extends the timer on a genuinely downed crew member being revived by up to 20 seconds; it does not instantly revive them. All cost one charge. Flares remain a deliberate trade-off: useful against small creatures/light hunters but noisy enough to attract the Leviathan.

Lobby hosts can choose Relaxed, Normal or Nightmare. Difficulty changes repeating threat frequency and damage; the required mission and crew scaling stay intact. All new threat simulation, positions, damage and decisions are authoritative. Warnings have text/captions, persistent critical indications and static readable models; no flashing effects or extra lights/shadows are needed. These threats stop escalating during the existing evacuation finale.

Validation: 23 focused crafting/threat checks, ten additional four-client network checks, regression tests and client interaction tests cover materials, recipe forgery, cooldown/role/range/phase checks, four-diver contention, circuit controls, damage, warnings and each counter. Balance crews now respond to electrical faults and the Warden using actual circuit interactions and use a carried flare against skitters. The current 12-seed sample wins 100% at sizes 1?5 and 92% at sizes 6?8. These are scripted diagnostics, not a guarantee for human crews; they still skip optional salvage and fabrication.


### Diving depth and SKIFF-2 survey sub

Outside divers can hold Ctrl to descend and Space to ascend below the marked survey line. Depth is integrated on the server from a bounded direction intent; clients cannot send an accepted depth or air result. The seabed sampler is shared with rendering, so divers stop above the real floor, up to a 10m survey envelope. This is depth relative to the station's working route, not travel to the ocean surface. Structural collision footprints still extend through the diving envelope; you cannot dive through the hull or underneath a wreck wall. Required cables remain near the hull at route level. Ascend to within 1.25m of that line to use outside equipment or the airlock. The HUD shows depth and air-use multiplier. Suit drain increases with depth and distance beyond the working apron; the return-air estimate now includes ascent time and pressure allowance. Darkness and lamp reach also change with depth. Ctrl/Space are reserved controls.

The two-seat SKIFF-2 starts at the west Medical dock. Restore power, then use the separate SURVEY / TWO SEATS panel beside the Medical airlock to board; the normal diver airlock remains available. Any department may take a vehicle seat. First aboard pilots, second operates survey equipment. W/S thrust or reverse, A/D turn, and releasing thrust brakes. The pilot alone can steer; the operator uses X to launch one of three flares or T for one of two scans on the shared scanner cooldown. A solo pilot can use that equipment too. V takes a genuinely unattended pilot seat after a disconnect or incapacitation; an active pilot cannot be displaced.

The sub has 100 hull and a shared 180-unit air reserve. Two occupants use one unit per second, one occupant half that. Seated crew breathe the vehicle reserve rather than their suit. A powered dock refills air, not hull or equipment charges. Engine noise attracts the Leviathan, whose strikes damage the hull; mine damage also goes through the vessel hull. Collisions damage the hull and stop the vessel. All movement, collisions, seat changes, damage, charges, cooldowns and docking are server-owned. Ordinary movement packets cannot teleport seated players, and stale/disconnected steering safely stops thrust.

Follow the posts home. The instrument panel gives a direct bearing relative to the bow, not an obstacle-avoiding autopilot. At the marked west dock, stop within the approach area and hold the interaction key or DOCK button for two seconds to seal and equalise the transfer hatch. Both occupants arrive inside Medical. Leaving range, thrusting or losing power cancels docking. Elsewhere the interaction key or EXIT HATCH releases the player onto suit air. An occupied vehicle must be recalled before beginning the main evacuation, so the survey trip cannot silently strand active crew when launch starts.

Outside a stationary damaged sub, aim at the aft service area and hold the interaction key for five seconds. One carried alloy or repair kit restores 25 hull. A destroyed sub cannot be rebuilt that match; emergency release ejects occupants safely onto suit air, and the normal mission remains available. Reconnect preserves vehicle state and seat reassignment. New matches reset the sub.

Current limits: SKIFF-2 cruises horizontally at the marked survey depth, uses a conservative circular swept collider and has no combat gun or autopilot. Divers have vertical control, the vehicle does not yet. There is one shared sub for every crew size, with two seats rather than a seat for every player. Cockpit geometry uses six static/dynamic material draws plus its dock/boarding plates (at most nine total), with no new lights or shadow casters. Software screenshots do not prove hardware frame rate. Validation includes 24 focused depth/vehicle checks, 12 additional multiplayer checks (including four divers outside), the full regression suite, real-client keyboard boarding/driving/docking and compact-instrument screenshots. Base-mission balance remains 100% at crews 1?5 and 92% at 6?8; scripted crews skip the optional sub and deeper expeditions.


### Solo recovery training

Enter a crew name and choose SOLO TRAINING from the title screen. A private one-person simulator starts immediately, without another player or readiness vote. Use the real station and interaction controls: walk, calibrate/restore power, patch the training pipe leak, deploy a real limited tool, restore the other systems, repair the outside cable, return, launch, board and dock the escape pod. The server advances guidance from actual movement and completed actions; there is no client completion acknowledgement. Early legitimate actions still count when their step is reached. Reconnect preserves the course.

Training disables random threats and damage, caps flooding, stabilises suit air at a reserve and protects the pod while docking is learned. Calibrations, inventory charges, airlock use and steering still use their normal rules. It is not a second difficulty setting for scored matches. Lore is disabled in the simulator. A completed real pod extraction marks a local training-complete preference; practice runs do not enter expedition records or competitive statistics. The normal menu's Create Room still starts an ordinary co-op mission.

The complete solo course is exercised by a server simulation that issues actual repairs and vehicle controls, with separate network checks for auto-start, one-person access, movement-driven progress, invalid completion attempts and reconnect. Browser review checks the real training button, initial movement and instruction layout at 1280?720 and 520?640. Like the rest of the game, training needs the local or deployed server running; it is not an offline-only tutorial.


### Public crews, results and safety

Use QUICK MATCH to fill an open Normal lobby or open PUBLIC CREWS to choose one. This browses only the server you are connected to, not a global directory. Create Room stays private by default. In the lobby the host can edit its name, check Public room and APPLY ROOM SETTINGS before starting. Visibility cannot change during a match. Leave your current room before joining a different one. Difficulty still belongs to the host.

The browser stores a random anonymous identity secret and chosen name. The server stores only its hash, a random profile ID, display name, completed-match stats, reports and bans in SQLite. No password, email or paid service is used. Results come only from server actions and the final authoritative summary: matches, escapes, completed work/treatment, downs, revives and seconds survived. Duplicate writes do not add scores twice. Private results appear in MY STATS; only completed public expeditions enter leaderboards. Training and shutdown-interrupted matches are excluded. Weekly boards begin Monday 00:00 UTC; fastest escapes require a specific starting crew size. Scores are local to each server, and clearing browser storage creates a new identity. This is an anonymous convenience identity, not a verified account or protection against determined ban evasion. Keep its secret private.

Click a crew name in the lobby, radio or wrist-computer roster to mute their chat locally or submit a report. Mute persists in this browser. Reports contain the reason, server-resolved participant IDs and last canonical chat excerpt; they go to the operator, with no automatic ban. A small local English word filter covers obvious words and Unicode compatibility variants; it is not comprehensive moderation. Existing gameplay/chat limits remain, with new room, connection, browsing and report limits. Connection IPs are used in memory for abuse limits, not saved in the stats database.

Node 24.20+ is required for the built-in SQLite API ([official documentation](https://nodejs.org/download/release/v24.20.0/docs/api/sqlite.html)). Run npm install, npm run build, then npm start. The default private data file is server/data/pressure-drop.sqlite, outside the served client directory. See [DEPLOYMENT.md](DEPLOYMENT.md) for container setup, environment options, backups and operator commands. New checks: npm run test:online and npm run test:online:visual.


### Visible first-person work

Holding the interaction key now raises industrial diving gloves and suit sleeves for real server-confirmed work. Repairs show a wrench; applying Engineering's welder switches to a visible torch after the server accepts it. Valve/filter work, treatment, switches and supply recovery use simple poses without a tool. Hands disappear immediately when you release interaction, and are hidden during pause menus, calibration puzzles, spectator views and vehicle seats. They never lock the camera or extend a hold. Reduced effects keeps the wrists steady and the welding tip constant, with no flashing light.

The original procedural view model uses an isolated, depth-cleared first-person pass. It adds no world lights or shadows and skips the pass completely when idle. Both gloves now have four independently animated three-joint fingers and a two-joint thumb. Two fixed-length arm segments solve elbow placement against reachable equipment: the supporting fingertips and wrench jaw, welding tip or pointing fingertip each use their own contact anchor. Station, emergency-panel and supply contact comes from the rendered mesh surface; breach/circuit contact uses the visible floor face. A lower arm working stance handles nearby floor repairs without moving the camera or changing player collision, breathing or repair rules.

Contact rendering matches the world camera's FOV, yaw, pitch and roll, including narrow windows. If a target lies beyond arm reach, work still succeeds under the existing server rules using the free work pose; the arms do not stretch to fake contact. Treatment and unsupported interaction props retain their animated gestures rather than body/prop collision IK. Reduced effects keeps the necessary contact pose but freezes finger/wrist cycling and entry motion. The rig stays within ten mesh draws, with all finger segments and sleeves in two instanced draws. There are no idle weapon arms. Existing repair/welder cues and captions remain in use. Run `npm run test:hands` and, after building, `node test/review-current-ui.mjs --hand-contact-only` for contact checks and screenshots; `npm run test:hands:visual` checks the free work poses.

Keyboard accessibility: the focused SKIFF-2 DOCK button accepts held Enter or Space. Releasing the key or moving focus cancels the docking request. Reconnect restores the ordinary connection-warning text after a server notice.

Interaction presentation: active work shows a numeric progress readout, suppresses redundant look/control hints and dims the equipment panel until hovered or focused. Tool shortcuts remain available. Hands ease into their working pose; treatment and console work have distinct movements. Reduced effects disables entry motion and UI transitions. Keyboard focus indicators and compact title-screen spacing improve menu navigation.

Station boards: room plaques are fixed to backed overhead frames facing the approach. Equipment labels are fixed plates on their panels/pylons, without camera-facing rotation or distance scaling. Evidence terminals have floor/seabed-anchored stands at their existing interaction positions. Run npm run test:boards for the mounting checks.

Creature/exterior presentation: the station Leviathan now turns through the shortest arc with bounded angular speed and restrained banking (disabled by reduced effects). Decorative height clearance blends gradually near exterior structures instead of stepping at their edge. Survey posts have grounded protective feet and a second reflective band for approaches from below, using existing material batches without added lights. Predator decisions and damage remain server-owned.

Escape corridor refinement: paired reflective dashes follow the shared route bends, with secondary posts, torn deck sections and exposed framing through the collapse field. They identify corridor edges, not guaranteed safe lanes. All added static dressing stays clear of the three steering lanes; server-selected obstacles remain the real hazards. The additions reuse the five existing material batches and add no lights or shadows. Run npm run test:route-polish and npm run test:route-polish:visual for geometry/lane checks and isolated route renders.

Audio mix refinement: non-positional suit warnings, radio-chat cues and sonar readouts use a clear communications path controlled by Effects volume; positional creature and machinery sounds keep underwater filtering. Important warnings ease propulsion and water-rush levels back temporarily, alongside ambience, then recover automatically. Overlapping warning windows cannot shorten each other. Initial audio unlock now respects the current EVA/underwater environment. Captions, master mute, hidden-tab muting and existing volume controls remain available. This changes mixing of the local authored bank, without adding spoken voice lines or external audio.

Work alignment: reachable equipment uses surface contact and two-bone arm IK; distant work retains bounded camera-relative poses. Looking away from the target or opening the wrist computer hides the hands. This is presentation only; server holds still determine progress and completion.

Control guidance now follows saved key bindings in the suit HUD, pause and briefing hints, current objectives and survey-sub help. Swapped keys are substituted once, and reset restores original labels while preserving hint formatting. World-mounted signs may still show default controls.

Release diagnostics: Display & Controls shows rolling measured FPS and 95th-percentile frame time during a match. Measurements stay in this browser and are not telemetry or a hardware performance guarantee. New browser installations inherit the system reduced-motion preference unless an explicit preference is saved. Supply-locker plates refresh when the interaction binding changes.

### Flooding and helmet air

The flood pump has one shared station drainage budget, scaled by the existing crew breach tier, rather than independently draining each room at full capacity. It distributes drainage across the water actually present; dry rooms waste no capacity. Multiple leaks can overwhelm it. Filter servicing and the wreck regulator improve that shared capacity. Isolating a flooded compartment stops equalisation into open rooms, but does not patch its breaches.

Leaks stay at their initial rate for 45 seconds, then grow gradually to 2.5 times that rate over the next 90 seconds. Patching removes the leak; pipe clamps stop inflow temporarily while the underlying rupture continues to age. The HUD warns when incoming water exceeds an operating pump and when an old leak worsens. Boarding still increases inflow.

Water above the standing helmet height (1.65m) drains a separate 12-second breath reserve before drowning damage starts. Station oxygen cannot replace that trapped reserve underwater. Dry space restores it at three seconds per second; it is not instantly refilled by crossing a doorway. EVA suit air and sub air remain separate systems. A dedicated meter, critical banner and captioned suit warning identify low helmet air. Practice retains its existing safety protections.

Run npm run test:flooding for pure and real-network checks, including client-forged breath refusal, and npm run test:flooding:visual for warning layout/recovery review. The twelve-seed balance sample wins 100% for crews 1-3, 5 and 7, and 92% for crews 4, 6 and 8; human tests still need to assess the difficulty.

### Balance audit and close-contact counterplay

The balance audit now supports BALANCE_REPORT=1 to print loss reasons and observed down contexts, in addition to win rates. These contexts are diagnostic estimates, not authoritative cause-of-death labels. The test crew no longer sends every available member toward the same casualty or attempts inside-only treatment on a downed diver outside. Divers use finite carried lures and attempt to return when contact or suit air becomes dangerous. This remains an approximate travel-time simulation, not a replacement for human playtests.

Continuous Leviathan grab damage now requires sustained close contact: a 6m radius and a three-second warning window. A persistent personal warning/countdown and captioned suit cue announce that danger. Breaking contact decays exposure; quick boundary taps do not instantly reset it. The separate strike impact remains dangerous and keeps its original damage/range. No client can supply an accepted grab timer.

Hearing gain scales gently downward above four crew (1.0 / 0.95 / 0.9 / 0.85 / 0.8 for 4-8), accounting for simultaneous crew noise while preserving the need for quiet. Pump, breach-growth, helmet-air and station oxygen settings were not weakened in this pass.

The 60-seed-per-size audit with the improved test crew wins 100%, 100%, 100%, 98%, 97%, 98%, 88% and 92% for crews 1-8. A deliberately slow/noisy eight-player crew won 0/12 stress runs, usually losing to flooding. These results update the earlier smaller samples and do not imply every player escapes in a winning match.

To reproduce one reported balance failure, set START_SEED to its printed seed and run the simulator with that crew size and one run. Leave START_SEED unset for the standard sample. BALANCE_REPORT prints up to three example failure seeds per crew size.

The final balance audit also reports actual lost players, average escaped crew and full-crew escape rates, and includes preventative treatment in the scripted Medical decisions. See BALANCE-REPORT.md for the final standard and separate-seed results, remaining survival concerns and reproduction steps. These final samples supersede earlier percentages above.
