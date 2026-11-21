# Sprite placeholders

All art is drawn procedurally in code (pixel-art style, integer rects on a 384x216 buffer):

| What            | Where                                   |
|-----------------|-----------------------------------------|
| Hero + scarf    | `src/game/player.ts` → `draw()`         |
| Enemies         | `src/game/enemies.ts` → `draw()`        |
| Bosses          | `src/game/bosses.ts` → `draw()`         |
| Tiles / themes  | `src/game/themes.ts` → `buildTileset()` |
| Parallax        | `src/game/background.ts`                |
| Pickups, NPCs…  | `src/game/objects.ts`                   |

To use sprite sheets instead, load an `Image`, and replace the body of a `draw()` method with
`ctx.drawImage(sheet, sx, sy, w, h, x, y, w, h)`. Image smoothing is already disabled for crisp pixels.
