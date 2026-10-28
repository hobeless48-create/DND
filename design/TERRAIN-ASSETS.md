# Terrain atlas provenance

- Project asset: [public/assets/terrain-atlas.png](../public/assets/terrain-atlas.png).
- Generated with the built-in imagegen tool, new-image generation mode, opaque background; no reference image or third-party sprite sheet.
- Original generated file: `C:/Users/s0846/.codex/generated_images/01a1767f-2105-7fd2-88ec-d1dcfd0bc77e/exec-9c038d9d-f93e-4272-8b88-bf3f9b7f972f.png`.
- Copied into the project without raster editing. PNG dimensions 1254 x 1254, 3,881,996 bytes. The renderer divides it into four rows and columns and crops two pixels inside each frame to avoid visible cell seams.
- Ground sprites may flip deterministically to reduce repetition. The original grid artwork remains intact.

| Row | Frames (zero-based) | Content |
| --- | --- | --- |
| 1 | 0, 1, 2, 3 | Dungeon flagstone, masonry wall, stone rubble, wooden crate |
| 2 | 4, 5, 6, 7 | Asphalt, concrete barrier, rusty debris, industrial supplies |
| 3 | 8, 9, 10, 11 | Moss/grass, bush/rocks, mud, logs/supplies |
| 4 | 12, 13, 14, 15 | Dungeon stair, bunker hatch, campsite, ladder exit |

## Final generation prompt

```text
Create a production-ready 2D TOP-DOWN GAME TERRAIN SPRITE ATLAS for a tactical browser board game. One square image, exactly a uniform 4-column by 4-row grid, sixteen equal square cells, each cell filled edge-to-edge with its own terrain tile. No text, no labels, no numbers, no watermark, no gutters, no grid lines, no borders. Strict flat overhead orthographic view, NOT isometric, no perspective horizon. Painterly pixel-art-inspired detailed textures, readable when each tile is displayed at 32 pixels. Muted cinematic colors, subtle ambient top-left light, rich material detail. Precise layout reading left-to-right then top-to-bottom: row 1 dark fantasy stone dungeon: (1) worn warm gray flagstone floor with subtle cracks, (2) thick dark charcoal masonry wall block viewed from above, (3) scattered broken stones and rubble on stone floor, (4) wooden supply crate with iron corners on stone floor. Row 2 post-apocalypse: (5) cracked cold gray asphalt with faded paint flecks, (6) broken dark concrete barricade slab viewed from above, (7) rusted metal debris and broken pavement, (8) weathered industrial supply container on asphalt. Row 3 wilderness survival: (9) rich forest moss and short green grass ground with tiny earth patches, (10) dense evergreen bush and rock cluster acting as impassable obstacle, (11) damp brown mud with small stones and sparse grass, (12) fallen wooden log and survival supply bundle on forest ground. Row 4 landmark tiles: (13) old stone stairwell leading down with soft amber light surrounded by dungeon flagstones, (14) rusty circular bunker access hatch surrounded by cracked asphalt, (15) small olive canvas campsite tent on forest moss with a little camp light, (16) upright-looking overhead wooden ladder exit hatch framed in stone, soft ivory highlight. All cells must occupy precisely the same dimensions and stay confined to their own cell; no artwork crosses cell boundaries. Ground cells should be visually seamless or unobtrusive at edges when repeated. Keep every tile calm and visually legible beneath character tokens.
```
