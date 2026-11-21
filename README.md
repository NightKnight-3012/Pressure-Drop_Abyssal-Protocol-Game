# Pressure Drop: Abyssal Protocol

**1–8 players · First-person co-op survival horror · Browser**

**1,800 metres below the surface, NEREID-9 sends a sonar pulse into a fracture beneath the seabed. Something answers.**

The station is flooding, and a blind Leviathan is circling the hull. It hunts by sound. Your crew has to bring the station back online long enough to launch. If there are more survivors than pod seats, who stays behind?

## Your first shift

Pick a department in the lobby, or start with **Solo Training** to learn the controls. In a crew, you can split up to restore the station faster, but an alarm or a flooded passage can change the plan mid-repair.

1. **Bring the station back online.** Restore power first, then get the flood pump, life support and Command console running. Follow the calibration prompts on major instruments, then hold the interact key to finish the repair.
2. **Keep the hull quiet.** Sprinting makes noise, and the Leviathan follows it. Walk when you have time, patch leaks before they spread, and use the wrist computer to see which rooms are flooding.
3. **Go outside.** Take the airlock to reconnect the launch cables. Keep an eye on your suit oxygen and leave enough air for the return trip.
4. **Make the call.** If the crew outnumbers the pod seats, vote on who stays behind. The pilot steers through wreckage and lines up with the recovery cradle. Anyone left aboard can draw the Leviathan away or try to launch a maintenance capsule.

For a longer run, select **Deep overhaul** in the lobby. The east service corridor off Engineering leads to the compressor and pressure-test bays. Bring the annex machinery online before you can launch.

### Controls at a glance

| Input | Action |
| --- | --- |
| **WASD** / **Mouse** | Move / look. Click the game to capture the mouse. |
| **Shift** | Sprint. Use it when the time you save is worth the noise. |
| **E** | Interact with equipment. Hold to repair, patch or revive. |
| **F** / **Tab** | Toggle your flashlight / open the wrist computer. |
| **Enter** | Open crew chat. |

During the pod escape, use **A/D** to steer, **S** to brake for docking and **Shift** to boost.

## Run locally

From the project folder with **Node.js 24.20 or newer** installed, run

```sh
npm install
npm run dev
```

- **Windows PowerShell** → use `npm.cmd` in place of `npm`.
- **First dive** → open [localhost:5173](http://localhost:5173) → enter a name → **Solo Training**.
- **Host a crew** → **Create Room** → share the five-letter code → choose departments → **Ready** → host starts.
- **Same Wi-Fi** → friends open the **Network** URL printed in the terminal → enter the room code.
- **Different locations** → everyone opens the same public server URL → enter the room code. [Hosting guide](DEPLOYMENT.md)

## Go deeper

- **Playing** → [Mission walkthrough and controls](TACTICAL-HORROR.md) · [Systems, gear and hazards](FIELD-MANUAL.md)
- **Developing** → [Project structure](FIELD-MANUAL.md#project-structure) · [Test commands](FIELD-MANUAL.md#testing) · [Balance results](BALANCE-REPORT.md)
- **Release** → [Hosting and persistence](DEPLOYMENT.md) · [Release status](RELEASE-STATUS.md) · [Asset credits](ASSETS.md)
