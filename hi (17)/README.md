# LUMEN REACH — a fantasy platformer prototype

Recover the shattered **Lumen Heart** across ancient ruins, forests, caves and floating islands.
Tight movement (run, variable jump, coyote/buffer, double jump, wall slide/jump, 8-way dash), melee + ranged combat,
bosses, secrets, NPCs, upgrades, day/night + weather, parallax, particles, procedural audio — all in plain TypeScript
on a canvas, wrapped in a tiny React shell. No external assets are required.

## Setup

```bash
npm install
npm run dev        # development server
npm run build      # production build → dist/index.html (single file)
node tools/build-levels.mjs   # regenerate the sample level JSON files
```

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | A/D or ←/→ | Left stick / D-pad |
| Jump / double jump | Space, Z | A |
| Wall slide / wall jump | hold toward wall, then Jump | same |
| Dash (8-way, invulnerable, passes spikes) | Shift, X, L | B / RB / RT |
| Sword (↑ strike up, ↓ in air = pogo) | J, C | X |
| Aether bolt | K, V | Y / LB |
| Drop through ledges | ↓ + Jump | ↓ + A |
| Talk / enter portal | E, Enter | D-pad ↑ / Select |
| Pause | Esc, P | Start |
| Debug overlay / god / skip level | F3 / F4 / N (with overlay) | |

Touch devices get on-screen buttons automatically (Settings → Touch controls).

## Features

- **Movement**: coyote time, jump buffering, variable jump, apex float, corner correction, squash & stretch, ledge drop-through.
- **Combat**: sword with hit-stop and pogo, aether bolts (energy meter), deflecting enemy bolts, stomping, dash damage.
- **Enemies**: Slime (patrol/hop), Bat (hang → telegraph → dive), Sentinel (telegraphed aimed turret), Knight (shield, wind-up charge, wall-stun), Shy Wisp (only moves when you look away).
- **Bosses**: Stone Warden (slam waves, rock rain, charging) and Hollow King (teleport volleys, rings, sweeps, light beams, summons; 3 phases). Gates seal, camera locks to the arena.
- **Hazards**: spikes, lava, bottomless pits (hurt → return to last safe ground), moving platforms, collapsing floors, dart traps, falling stalactites, springs.
- **Collectibles**: coins, crystals (currency), hearts, Aether Surge power-up, dash gems, secret relics.
- **Progression**: checkpoints (heal + autosave), 4 campaign levels, 2 optional challenge rooms (secret portals), skill tree (pause → Upgrades), quests, 14 achievements, ranks, best times, speed-run timer option.
- **Atmosphere**: day→dusk→night driven by progress, rain/leaves/fireflies/embers/wind, lightning, dynamic darkness & light in caves, 3-layer parallax per biome, procedural music per biome + boss themes.
- **Accessibility**: assist (no damage), game speed 70/85/100 %, reduced flashing, screen-shake slider, particles off/low/high, high contrast, touch controls.
- **Tools**: F3 debug overlay (FPS, pool usage, state, hitboxes, death heat-map from local analytics).

## Project layout

```
src/App.tsx            React shell (mounts canvas + Game)
src/game/game.ts       loop, scene/screen stack, saving, progression, render pipeline
src/game/play.ts       PlayScene: level runtime, camera, combat resolution, bosses, dialogue
src/game/player.ts     player controller + drawing
src/game/enemies.ts    Enemy base + regular enemies      bosses.ts   boss encounters
src/game/objects.ts    prefabs: pickups, checkpoint, exit, portal, platforms, traps, spring, NPC
src/game/projectiles.ts  pooled projectiles             fx.ts   pooled particles + screen shake
src/game/world.ts      tile map, collision, secrets, collapse, rendering
src/game/background.ts parallax, weather, lighting       themes.ts palettes + tileset generator
src/game/audio.ts      procedural SFX + music            input.ts keyboard/gamepad/touch
src/game/ui.ts, screens.ts   HUD, menus, settings, skill tree, achievements, cutscenes
src/game/save.ts, achievements.ts, debug.ts, levels.ts, config.ts (tuning constants)
src/game/data/levels/*.json   sample levels            tools/build-levels.mjs  level builder
public/assets/*        placeholder docs for audio / sprites / UI
```

Object pooling: `Pool<T>` (`util.ts`) backs particles (900), projectiles (96) and floating texts.

## Level format (JSON) / mods

Each level is JSON: `{ id, name, theme, time:[start,end], weather, music, par, tiles:[...rows], npcs?, portals?, boss?, optional?, reward? }`.
`theme`: forest | ruins | caves | sky. `time`: 0 day, 1 dusk, 2 night (interpolated along the level).
`weather`: none | leaves | rain | fireflies | embers | wind | motes. `music`: menu forest ruins caves sky boss final.

Tile legend (one character per 16 px tile):

```
. air        #  solid        =  one-way platform   C  collapsing floor   S  secret wall (passable)
^  spikes    p  ceiling spikes   ~  lava            j  spring            M/N  moving platform (horiz/vert)
P  player start   K  checkpoint   E  exit gate      O  secret portal (see "portals")
c  coin   g  crystal   h  heart   u  Aether Surge   d  dash gem   q  secret relic
s slime   b bat   r sentinel   k knight   w wisp    < >  dart traps (fire left/right)
v  falling stalactite   1-4  NPCs (see "npcs")      B  boss spawn   !  boss trigger (arena = 24 tiles to the right)
```

**Play your own level**: use *Main menu → Load Custom Level* or drag-and-drop a `.json` file onto the window.
Rows may differ in length (padded with air); a `P` tile is required. Boss arenas: place `!` 24 columns from the level end,
a `B` on the floor row, and an `E` inside the arena.

## Notes / not included

Co-op multiplayer and procedural level generation are not implemented in this prototype (the JSON level pipeline and
`registerCustomLevel()` in `levels.ts` are the intended hook for a generator).
Analytics are stored locally only (`localStorage`) and never transmitted.
