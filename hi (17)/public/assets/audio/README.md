# Audio placeholders

LUMEN REACH currently synthesises **all** music and sound effects at runtime with WebAudio
(`src/game/audio.ts`), so no audio files are required.

To replace the placeholders with authored audio:

1. Drop `.ogg` / `.mp3` files here, e.g. `music_forest.ogg`, `sfx_jump.ogg`.
2. In `src/game/audio.ts`, load them with `fetch` + `decodeAudioData` in `init()` and play them from
   `sfx(name)` / `playMusic(name)` (keep the procedural version as the fallback).

Track names used by the game: `menu forest ruins caves sky boss final victory`.
SFX names: `jump doublejump walljump land dash slash bolt hit clink enemydie hurt coin crystal heart powerup
checkpoint spring collapse dart warn select confirm back talk death respawn roar slam bossdie teleport
achievement victory portal thunder pogo gate`.
