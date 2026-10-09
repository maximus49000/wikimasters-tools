INTERIOR LIGHTING LOT (after the weather plan, separate spec+plan) — decisions validated by the user on mockups:
 - per-window beams: parallel sun elevation (global) + azimuth PER WINDOW from (sun x in the shared panorama − window centre x); every window gets a beam as long as the sun is up, no gating by sun visibility in the glass; patch = exact projection of the glass (starts at distance Hb/tan(e) from the wall, parallelogram, grazing rays weaker); clouds anywhere in the panorama dim all beams; sun partly hidden → proportional beam; gap in light-rain clouds → shafts + beam
 - ambient: eye adaptation (day clear: lamps negligible; overcast/rain/storm/night: lamps useful); skylight falls off with distance to the window; ceiling lamp softer (no blown white base), floor lamp as validated
 - lights toggled by clicking on the light; inverse-square falloff per surface with incidence angle, not a circle
 - furniture: multi-primitive boxes (table = slab + 4 thin legs, lamp = base + stem + shade); exact ray–AABB occlusion; soft edge (5 jitters); furniture faces lit by their own orientation (top lit if the ray reaches it through the glass, front face in shade = ambient only), NOT by the floor patch
 - ANIMALS (user request): they cast shadows with the same rules as furniture (occluder boxes/ellipsoids per pose) but MOVE: occluders recomputed per frame from the pet motion `stateAt`, same faces logic, at most 3 pets
 - night: clouds darkened (cloud colour from daylight); no halo around the window on the wall
 - rendering approach for the real app: low-res canvas light map computed few times per second over the SVG room (SVG has no per-pixel lighting)

Task 7: fix round 1 done (1da804f, 9e5b092); deferred minors: node counts wide rooms (7), Date.now drift init (9), reduced-motion live toggle (10), rainy passed to static decor (11), gradient darkness by eye (12). Awaiting scoped re-review.

Task 7: complete (commits 49c41ec..9e5b092, re-review clean; deferred minors 7,9,10,11,12 + rayWindow test thin)

Task 8: complete (4caa049, review clean). Ruling: keep "(simulée)" text note as the brief mandates — a glyph-only note would be unreachable on touch and ambiguous — costs a small glyph-convention deviation if wrong.

Task 9 steps 1-2: complete (a764d60). Steps 3-4 (push/PR/merge/preprod/memory) after final review.
