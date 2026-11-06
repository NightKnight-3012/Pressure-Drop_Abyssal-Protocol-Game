# Tactical horror update: playing the new mission

## Start the game on Windows

1. Open a terminal in `C:\Users\Ananya\Downloads\pressure-drop-complete-game`.
2. Run `npm.cmd install` if dependencies have not been installed.
3. Run `npm.cmd run dev` and leave that terminal running.
4. Open **http://localhost:5173**. Refresh an already open game tab after restarting the server.
5. Create a room, choose a department and mission variation. Other players join the room code and press Ready. The host starts the mission.

The existing local models work without another download. For a production build, run `npm.cmd run build`, then `npm.cmd start` and open **http://localhost:3000**.

## First act: restore the station

The host chooses Blackout, Pressure or Silence. Pressure increases flooding; Silence starts with less oxygen and a more sensitive hunter. The briefing lasts ten seconds.

The suit display prioritizes health, oxygen and your own noise. **Tab** opens the wrist computer for systems, crew, stamina and room flooding. Command retains detailed sonar information. Spatial groans, impacts and warning captions provide clues without exposing an exact global monster threat meter.

**Escape** closes an open panel or opens the suit menu. From there you can resume, leave or change brightness and rendering quality. Multiplayer keeps running while the menu is open. Low reduces rendering resolution and ocean particles; High provides sharper rendering on capable hardware. Reduced effects also freezes water ripple movement and removes emergency light pulsing.

Move with **WASD**, look with the mouse, sprint with **Shift**, toggle the flashlight with **F**, and use **Enter** for text radio. Click the scene to capture the mouse; **Esc** releases it for panels. Aim at an interaction and use **E**. Major repairs first require a calibration: power circuits, pump pressure, console routing or life-support airflow. Follow the panel instructions, then hold E to finish the physical work. Patching, reviving and other sustained tasks also use hold E.

Rooms have clearer station markers, pipes and route colours. Maintenance passages provide alternate routes, but cannot bypass an active lockdown. Department-specific objectives explain what to do next. Contributions credit useful work and limit repeat-action farming.

## Vote and physical boarding

When there are more survivors than pod seats, selections remain drafts until **Confirm**. Players may explicitly abstain. A confirmed self-vote volunteers to stay behind and counts double. Ties use contributions. Confirmed ballots cannot be rewritten. The announced survivors must reach and use the actual boarding hatch before the countdown ends; standing anywhere in the pod room does not board the vehicle.

Being left behind does not end that player's game. They can still move, repair and communicate.

## Second act: two simultaneous routes

### The pod

One player pilots through wreckage while the others support the escape. Hull, cabin air and boost are real reserves. Collisions and the pursuing Leviathan can destroy the pod. Escape resolves for the pod independently of the station.

The escape now stages the route as a long, fast corridor: close wreckage ribs and particles rush past, steering banks the cockpit, and boosting widens the field of view while the engine and water noise rise. Speed is shown on the cockpit readout; an illuminated extraction gate marks the final approach. Near misses give a passing rush and impacts jolt the cockpit. Reduced effects removes the camera banking, vibration, speed streaks and changing field of view. Escape timing and the survivor's available window are unchanged.

| Control | Action |
|---|---|
| A / D | Steer |
| W / S | Adjust throttle |
| Shift | Boost: faster, louder, consumes reserve |
| R | Rear view to check the pursuer |
| T | Pilot hands controls to the next crew member |
| Hold E | Repair hull and restore air; supporting crew handle this when a separate pilot is available |
| Q | Sonar; Command operates it when Command is aboard |
| X | Deploy one of two countermeasures; cooldown applies |
| V | Propose attracting the monster to help the station survivor |

An intentional diversion needs a majority of the active, connected pod crew. It consumes boost reserve and emits a temporary distress pulse. Each player's agreement is recorded individually. Sonar and countermeasures provide tactical options; they do not guarantee escape.

### The station survivor

The Control Room contains an **emergency acoustic beacon** and a damaged **maintenance capsule rack**. There are two one-person capsules, enough for the maximum normal sacrifice group, not a replacement for the main pod.

- Toggle the beacon with E at its panel. It attracts the Leviathan toward the station, buying the pod time, but drains the same reserve needed for capsule repairs.
- At the rack, hold E through three repairs, each consuming reserve power. Engineering works faster. Walking away cancels the current repair.
- Once repaired, use E at the rack to launch a personal capsule. Each launch consumes one seat.
- The station floods and suffers escalating attacks until its collapse deadline. Staying to run the beacon can become a deliberate final stand; attempting escape quiets the station and may expose the pod.

The Leviathan compares actual signals from both routes and commits to a target for a minimum interval, so it cannot instantly flip on every input. Boost, repairs, beacon transmission and accepted distress pulses affect the contest. Both groups can escape, either group can be lost, or nobody can make it. A resolved route can spectate the remaining players; the overall match waits for both routes.

## Endings and records

After all routes resolve, a short in-engine cinematic reflects the individual player's fate: pod extraction, capsule escape, beacon sacrifice, voluntary final stand or loss. It can be skipped to the crew report. Personal commemorations are saved under **Expedition records** in that browser; they provide no gameplay advantage. Clearing browser storage removes those records.

The scenes use animated cameras, locally authored geometry, the existing creature and captions. They are not prerecorded or voiced movies. Communication remains text radio. The station keeps its existing footprint with improved dressing and alternate passages.

## Verification

`npm.cmd test` checks rules, tactical outcomes and multiplayer validation. `npm.cmd run test:client` exercises the client against a real server with simulated rendering. `npm.cmd run test:models` validates model integration. After a build, `npm.cmd run test:browser` runs actual Chrome/WebGL checks and saves screenshots under `test/artifacts` (Chrome required; `BROWSER_BIN` may override its location). `npm.cmd run balance -- 0 12` simulates twelve seeds across every crew size. Scripted crews are useful regression checks; human playtesting is still needed to tune difficulty.
