# DEAD RECKONING
**Offline survival navigator for people moving through a fallen Bengaluru on foot.**

Zero Hour hackathon · Theme 02 Apocalypse · *The Last Beacon*

Aarav and Mira (and any group of 2+) must reach the **Last Beacon**, a fortified survivor settlement at
Palace Grounds that broadcasts on FM. There are no cell towers, no internet, no open hospitals or shops,
no flights. A handful of survivors are hiding. The app runs entirely on the phone.

## Run it
```bash
node tools/serve.mjs 5290
```
Open http://localhost:5290 and register a survivor (demo: *Fill demo: Aarav & Mira*, PIN 1919). Anyone can register,
alone or with a partner. Each survivor on each phone has their own ID, data and map marker.

### On phones (same Wi-Fi as the laptop)
1. Once only: create a certificate (Git Bash):
   `openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout tools/cert/key.pem -out tools/cert/cert.pem -subj "/CN=dead-reckoning" -addext "subjectAltName=IP:<your-laptop-ip>"`
2. `node tools/serve.mjs 5290`. It prints `Phones on the same Wi-Fi: https://<ip>:5443`.
3. On each phone, open that address in Chrome, tap **Advanced → Proceed**, and register. If Windows asks, allow Node on private networks.
4. Each phone is its own survivor. Use 📍 "I'm here" or GPS to set your position.

HTTPS is required: survivor keys, camera (QR) and microphone (sound) only work in a secure context.
For a permanent, installable offline app, put the folder on any HTTPS static host (GitHub Pages, Netlify), open it once,
and use *Add to Home screen*. It then works in airplane mode.

### Permissions (asked right after registering, also in ⚙ Settings)
- **📍 Location:** GPS. Phones use satellites, which work with no internet. Laptops have no GPS chip and need internet to guess, so on a laptop set your position with 📍. The ROUTE tab always says what the GPS is doing (searching / fix ±m / outside the map / blocked, and how to fix it).
- **📶 Bluetooth / nearby devices:** lets phones within ~200 m find each other automatically.

### Teaming up
1. Two phones come within ~200 m. Both get a one-time notice, *"📡 Survivor nearby: Kiran (88 m)"*.
2. CREW → Crew → **📡 Nearby now** lists them with status, distance and blood group. Tap **🤝 Team up**.
3. Their phone shows *"wants to team up with you · ✓ Accept"*. Once accepted, it's mutual: you're a crew. Each of you gets silence alerts and "Go find" for the other, and the other is on your map.
4. People you meet but haven't teamed up with stay under "met". Scanning a 🪪 ID card QR also adds someone to your crew.

### Scanning each other (two-way, works at any distance afterwards)
1. Allow the **📷 Camera** (asked after registering, or ⚙ Settings → permissions).
2. Sriki taps **▣** on the map (or CREW → Crew → *Scan an ID card*) and points the camera at Neha's **🪪 ID card**.
3. Neha joins sriki's crew and appears on sriki's map at the location in her card. Sriki's phone then shows **"Now let Neha scan you"** with sriki's own card.
4. Neha scans it back. Now both are in each other's crew and see each other on the map.
5. After that, positions keep updating live whenever they're within ~200 m, and through relayed check-ins when apart. A forged card (someone else's name, wrong key) is rejected.

### Report, re-report, clear
- **⚠ REPORT** a horde, walkers, blocked road or fire. It changes your routes at once and is shared as a signed post, so every phone you sync with gets it and passes it on.
- Tap any threat (map marker, or INTEL → Field reports) and choose:
  - **✅ It's clear now**: removes it for everyone it reaches ("✅ Kiran: All clear: 🧟 Horde"), and their routes reopen.
  - **⚠ Still there**: re-reports it. This refreshes the time, counts the confirmation, and others keep avoiding it.
- Cached intel can be cleared the same way (e.g. the overturned bus on Seshadri Road), and set back with "Still there".
- Newer information wins: a clear made after the last sighting removes it, and a sighting after a clear brings it back. Reports nobody confirms expire on their own (12 h; roads 48 h).

### Seeing other survivors
Everyone with **📍 Share my location** on (⚙ Settings, on by default) shows on other phones' maps as a green dot with their
name, status and "LIVE" while within radio range (~200 m), then their last position with its age. Out of range, positions
still travel phone to phone inside check-ins. Press **?** on the map for the colour legend.

**Two-phone demo on one laptop:** open two browser windows. Log in as Aarav in one, and register Mira (partner: Aarav)
in the other. They share positions, plans and the board while within 200 m. Move one away with 📍 to see the live link drop
and the dead-reckoning estimate take over.

## The brief, point by point
| Brief | What the app does |
|---|---|
| **Plan a route** through a zombie-infested city | A* over the real Bengaluru road network (OpenStreetMap, bundled). Three routes: Fastest / Safest / Resupply, each scored on danger, open-road exposure, water left on arrival, and arrival before the 20:30 gate close. Turn-by-turn on real street names. |
| **Track essential supplies** | PACK: every person's items with weight (72 item types, 10 categories), group totals, "supplies last X h on the move", "hold out X days", a home **stash**, a **missing-essentials** checklist with *Find* (nearest abandoned shops likely to still hold it), and a supply log of every add/use/loot/hand-over. |
| **Identify dangerous zones** | Danger field from cached pre-blackout intel (outbreak origins never fade, reports decay), field reports, survivors' posts and night. Most-affected-zones ranking in INTEL. |
| **Coordinate next moves without connectivity** | Phone-to-phone radio link, QR stream, sound packets, Morse light. Shared community board, **move broadcasts** ("going to X at T, join us"), partner location (live or estimated), rendezvous with fallback time, crew alerts, inactivity check-in. |
| **Update / simulate changing threats** | REPORT (horde, walkers, blocked road, fire, safe house, supplies) changes routes at once; sightings expire (12 h, roads 48 h). **Drill mode** simulates time, walking, drifting hordes and supply burn for training and demos. |
| **Survival decisions on limited resources** | When a horde blocks the route, walking stops and three options are re-planned from your position *with what you have left*: detour, detour + restock, or hide in a rated shelter. The best viable one is starred. |
| **Constraint: horde blocks the safest route** | Exactly the above. A plain detour that runs out of water is rejected in favour of a detour through a store that likely still has water. |

## Realistic by design
- **Real time.** The phone clock, real Bengaluru sunrise/sunset for the date, GPS (works without internet) or tap 📍 to set your position. In live mode supplies change **only when you log them**; nothing drains behind your back.
- **Nothing is open.** Places are *abandoned* shops and buildings where supplies may remain, with the stock last recorded and by whom. Shelters are rated by walls, gates and exits.
- **On foot first.** 🚶 Foot (default) · 🚲 Bicycle (needs one per person, quiet, faster) · 🚗 Car only for 6+ people or trips over 8 km; it needs siphoned fuel and avoids jammed lanes, and the engine noise pulls hordes in (higher route danger).
- **The settlement takes walkers until 20:30 every evening**, and the beacon keeps broadcasting for 3 more days. The gate time is editable, from the FM broadcast.
- **Calm alerts.** Only real dangers interrupt, at most once per 3 hours each. Advice waits in the SENTINEL strip. There's no nagging about supplies you haven't logged yet.
- **Groups of 2+.** Add people (role, body weight, health, medical notes), balance loads across everyone, and get a night watch rota.

## How do people communicate with no network?
**Not satellite.** A phone can't transmit to satellites; GPS only *receives*. The app uses what every phone already has:

| Channel | Range | How |
|---|---|---|
| 📶 Radio link (Bluetooth / Wi-Fi Direct) | ~30–200 m | Automatic. Phones in range swap position, route plan and the whole board. *(Web prototype: runs between browser windows; the Android build uses Bluetooth.)* |
| ▣ QR stream | ~1 m | Whole board incl. photos, multi-frame, any order |
| 〰 Sound packets | 3–8 m, through doors | Short alerts and locations, speaker → mic |
| ✦ Light | line of sight | SOS / short words in Morse (screen + torch) |
| LoRa / satellite messenger | km | Extra hardware; packets wait in the outbox |

**Store-and-forward:** every phone keeps the whole board and passes it on to the next phone it meets, so a post
travels across the city phone by phone, even to people its author never meets.

**How people find each other and become a crew:** posts and move broadcasts reach strangers through other phones.
Meeting face to face, you scan each other's 🪪 ID card QR, and that person is added to your crew as a verified contact.

**How a community forms:** nobody has to create it. Everyone who syncs shares one board, and it grows as survivors meet.
Your *crew* is the people you added; the *community* is everyone whose posts reached you.

**Trust:** each survivor's ID (`DR-XXXX-XXXX`) is the fingerprint of a key pair made on their phone. Every post is signed,
so a forged or edited post shows ⚠ UNVERIFIED, checked offline.

## Tabs
- **ROUTE**: where you are, destination and gate time, travel mode, scored routes, turn-by-turn, "✓ Reached this turn" (manual dead reckoning), arrival checklist.
- **SUPPLY**: 1,969 real places by category, near you or along your route, last recorded stock, loot, update.
- **PACK**: group supplies, essentials, per-person packs, stash, log, low-power and ration modes.
- **CREW**: 📋 Board (supplies/danger/safe/need/offer posts with photos, ✓ still true / ✕ gone) · 📢 Moves (broadcast and join) · 👥 Crew (status, check-in, alerts, partner live/estimated, members) · 📡 Links (radio, QR, sound, light, rendezvous).
- **INTEL**: last online intel, most affected zones, field reports.
- **GUIDE**: offline field manual: 11 emergencies step by step, plus water, food, medicine, power and tech, tools, clothing and shelter, isolation, communication, do's and don'ts.
- **Always on screen:** ⚠ REPORT · SOS (silent Morse/QR or loud siren) · SENTINEL advisor · ⚙ settings (voice, silent, low power, drill mode, add a survivor).

## Identity and safety
- Offline **register / login**: name, partner, blood group, medical notes, emergency contact, PIN. The private key is encrypted with the PIN. Several survivors can share one phone, each with isolated data.
- **Inactivity watchdog:** 6/7/8 h of *daylight* with no movement or touch → "ARE YOU OK?". No answer in 10 min → a signed alert with your last location goes to your crew. Silent crew members raise an alert on your phone with a "Go find" route.
- **Health status:** OK / Injured / Exposed (72 h isolation countdown) / Needs help, shared at every sync.

## Honest limits
- The cached intel feed and the other survivors on the map are **simulated** (real places, real signatures, fictional people).
- Browsers can't use Bluetooth peer-to-peer, so the radio link runs between browser windows here; a native Android build is needed for real Bluetooth / Wi-Fi Direct.
- Sound-packet range must be tested on the actual demo phones. Camera and mic need HTTPS or localhost.
- Map coverage: central Bengaluru (12.955–13.010 N, 77.560–77.620 E).
- First-aid content is lay first aid for when no doctor can be reached.

## Architecture
Plain HTML/CSS/JS, no build step. Libraries are bundled in `vendor/`.
```
js/data/map.js  catalog.js  intel.js  guide.js    bundled data
js/account.js     offline identity (ECDSA keys, PIN-encrypted, signing)
js/geo.js         road graph, danger field, A*
js/state.js       state (live / drill), real sun times, supplies, travel modes
js/route.js       route scoring, directions, horde re-plan
js/community.js   gossip board, broadcasts, alerts, inactivity watchdog
js/comms.js       QR, sound modem, Morse/torch, siren, voice
js/sentinel.js    advisor (calm, cooldowns)
js/app.js         clock, GPS/manual position, radio link, partner estimate
js/ui.js, ui-crew.js, mapview.js   interface
sw.js             offline cache
```
Map data © OpenStreetMap contributors (ODbL).
