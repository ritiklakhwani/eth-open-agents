# Tiny Town Tile Cheat Sheet

Pack: Kenney Tiny Town (CC0) — 12 cols x 11 rows = 132 tiles, 16x16 px each.

In Tiled, hover any tile in the tileset panel and the bottom status bar shows the
exact ID. Indices below are 0-based as Tiled displays them.

## Layout (read row x col)

```
ROW   COL 0     COL 1     COL 2     COL 3     COL 4     COL 5     COL 6     COL 7     COL 8     COL 9     COL 10    COL 11
0     grass-A   grass-B   grass-C   tree-pin1 tree-pin2 tree-pin3 tree-rnd  tree-rnd2 bush-orL  bush-orM  bush-orR  bush-orB
1     grass-D   path-tl   path-tm   tree-pin4 tree-pin5 tree-rnd3 tree-rnd4 bush-grL  bush-grM  bush-grR  bush-grB  bush-flw
2     grass-E   path-l    path-mid  tree-pin6 tree-rnd5 mush-red  mush-spk  bush-grB2 bush-grB3 bush-grB4 bush-grB5 bush-grB6
3     grass-F   path-bl   path-bm   path-br   path-cn1  path-cn2  fence-tl  fence-t   fence-tr  sign-w    sign-w2   barrel
4     roof-tlA  roof-tA   roof-trA  roof-tlB  roof-tB   roof-trB  fence-l   fence-r   fence-bl  fence-b   fence-br  crate
5     wall-l    wall-m    wall-r    wallB-l   wallB-m   wallB-r   door-A    door-B    win-A     win-B     bell      bag
6     wall-l2   wall-m2   wall-r2   wallB-l2  wallB-m2  wallB-r2  door-C    door-D    win-C     win-D     anvil     hammer
7     stone-tl  stone-t   stone-tr  stoneB-tl stoneB-t  stoneB-tr arch-l    arch-r    sign-mug  sign-pst  axe       pick
8     stone-l   stone-m   stone-r   stoneB-l  stoneB-m  stoneB-r  arch-l2   arch-r2   sign-pet  sign-bow  sword     shield
9     stone-bl  stone-b   stone-br  stoneB-bl stoneB-b  stoneB-br arch-bot  arch-bot2 well-A    well-B    fish      key
10    floor-A   floor-B   floor-C   floorB-A  floorB-B  floorB-C  ladder    ladder2   chest-A   chest-B   ring      gem
```

(The above is a rough map; Tiled will show you the exact ID on hover.
Read Preview.png alongside this for the visual.)

## Quick recipes

**Grass background (every map needs it first):**
- Pick any of row 0 cols 0-2 (grass variants) and bucket-fill the entire `ground` layer.

**Dirt path:**
- Use row 1 col 1 (top-left corner) + row 1 col 2 (middle) + row 1 col 3 corner... etc.
- For a 1-tile-wide vertical path, use row 2 col 1 (left edge) + row 2 col 2 (middle).
- Tiled has a "stamp brush" — multi-select 3x3 of path tiles and stamp.

**House (small, single):**
- Roof: row 4 cols 0-2 (top-left, top-mid, top-right) — 3 tiles wide.
- Walls: row 5 cols 0-2 underneath the roof.
- Door: row 5 col 6 or 7 in the bottom-center wall tile.
- Window: row 5 col 8 in side wall tiles.

**Tree:**
- Pine variants: row 0 cols 3-5.
- Round/leafy: row 0 cols 6-7, row 1 cols 5-6.
- Trees take 1 tile each; sprinkle along map edges.

**Lamppost / well / bench:**
- This pack has no lamppost. Use sign post (row 3 cols 9-10) or well (row 9 cols 8-9) as decor centerpieces.
- The procedural lamps from the old map still render under the tilemap, so they will show through any unpainted decor tile.

**Collision (the invisible layer):**
- Stamp ANY non-grass tile onto `collision` wherever the player should not walk:
  house bodies, tree centers, water (pond), fence lines.
- Do NOT stamp on doors, paths, open ground.
- The collision layer is set to invisible at runtime so what you stamp here
  does not need to look pretty — pick one easy-to-see tile (like the red mushroom
  row 2 col 5) and use it everywhere.

## Layer order in Tiled (top to bottom in the layer panel)

1. **zones** (object layer — already authored, do not touch)
2. **collision** (tile layer — invisible at runtime, mark walls)
3. **decor** (tile layer — trees, fences, signs, lamps)
4. **buildings** (tile layer — house roofs, walls, doors, windows)
5. **ground** (tile layer — grass + dirt paths, paint this FIRST)

## Painting workflow

1. Open `apps/web/public/world.tmj` in Tiled.
2. Add tileset if not already linked: Map > Add External Tileset > point at `tilesets/tiny-town/tilemap.png`, tile size 16x16, margin 0, spacing 1.
3. Select the `ground` layer in the layer panel, pick a grass tile, bucket-fill the whole map (Shift+B).
4. Stamp dirt paths between zones.
5. Switch to `buildings` layer, paint house clusters in `society` zone.
6. Switch to `decor` layer, sprinkle trees + fences + signs.
7. Switch to `collision` layer, stamp the easy-to-see tile over every wall.
8. File > Save (Cmd+S). The .tmj is written in place.
9. Reload `/world` in the browser. Painted tiles appear over the procedural shapes.

## Tip: paint a zone at a time

The map is 72x60 tiles. Painting all at once is overwhelming. Order I would
follow:

1. Grass + paths (whole map, ~20 min)
2. Society houses (top-left, ~25 min — most visual impact)
3. Marketplace + Mailbox (left column, ~15 min)
4. Park trees + fences (center, ~15 min)
5. Breeding hall (top-right, ~15 min — use stone floor + arch tiles)
6. Battlefield (bottom-right, ~10 min — stone floor only, the procedural
   portal still shows through)
7. Pond water (no water tile in this pack — leave procedural)
8. Collision pass over everything walls/water/trees (~15 min)

Total: ~2 hours of focused painting.
