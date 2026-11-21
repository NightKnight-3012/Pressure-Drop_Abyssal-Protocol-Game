# Pressure Drop: Abyssal Protocol

**1–8 players · First-person co-op survival horror · Browser**

A blind Leviathan hunts your crew by sound. Get a failing deep-sea station ready to launch. If there are more survivors than pod seats, who stays behind?

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

## Survive a shift

- **Station** → restore power → bring pumps and life support online → send a diver to repair the exterior cables.
- **Longer mission** → choose **Deep overhaul** in the lobby → follow the east corridor from Engineering → recommission the compressor and pressure-test bays.
- **Evacuation** → board the pod → steer through wreckage → align with the recovery cradle. Crew still aboard the station can draw the Leviathan away or attempt their own escape.
- **First controls** → **WASD** move · **Mouse** look · **Hold E** work · **F** flashlight · **Tab** wrist computer · **Enter** crew chat.

## Go deeper

- **Playing** → [Mission walkthrough and controls](TACTICAL-HORROR.md) · [Systems, gear and hazards](FIELD-MANUAL.md)
- **Developing** → [Project structure](FIELD-MANUAL.md#project-structure) · [Test commands](FIELD-MANUAL.md#testing) · [Balance results](BALANCE-REPORT.md)
- **Release** → [Hosting and persistence](DEPLOYMENT.md) · [Release status](RELEASE-STATUS.md) · [Asset credits](ASSETS.md)
