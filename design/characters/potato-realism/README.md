# Potato realism pilot

Steve requested more realistic potato guys on 2026-10-17, approved one 30-credit ($0.30) Hunyuan pilot with "go", and asked to keep the dense version as a high-detail option.

The standard potato body now uses this pilot. Round bodies, staff models and meeting portraits retain their previous designs pending review of this pilot; no additional paid cast variants were generated. The previous standard body is preserved unchanged at `assets/chars/old-potato/bean.glb`.

## Playing and reviewing

Open Graphics → Potato detail → High (original mesh), or select Ultra. Standard keeps the 24,000-triangle body with baked 2048 px color, normal and roughness maps. High downloads the 66.24 MB dense asset once on demand and uses its original 1,500,000 triangles and 4096 px maps for the nearest visible standard-body potato within about 1.55 m (retained to 1.8 m). All other potatoes retain their crowd meshes. The option persists, applies without reloading and has an isolated loading manager: a failed optional download cannot fail game startup.

Look at Red, Mint or Lola up close, then step away. Check inset eyes, skin texture, mouth, waistcoat seams, gloves and shoes; walk, sit and hold a drink. Hats, player colors, potato varieties, poisoning tint and the existing 16-bone animations remain supported. Both meshes retain the shipped 1.41 m height. The rig script's 1.2 m default was not the shipped height.

## Source and preparation

[Reference preview](pilot-front.png): built-in image generation edited the existing v5 concept toward a photographed practical creature: dry russet skin, cork texture, small sprouts, inset hazel eyes, small uneven teeth, woven burgundy waistcoat, cotton gloves and worn leather shoes. This reference is a concept, not an in-game screenshot.

One Sorceress `model_generate` / `hunyuan3d-3.1` job succeeded: `52d31aa5-a2f5-42d1-9c28-353b49843873`. [Generation receipt](generation-receipt.json) retains the request and result. Live catalog price was 30 credits; the API result did not expose `creditsCharged`. This is one shared generation for both derived meshes, not two purchases. No paid rigging or animations were used.

Raw 92 MB source remains at `runs/sorceress/v6-potato-realism/mesh/assets/01-url-d84f5ef3.glb` locally (runs are ignored). The full source triangle count is retained in the shipped dense asset. `assets/chars/provenance.json` records shipped hashes and sizes.

Preparation tools:

- `tools/prepare-potato-realism.py`: weld source UV seam duplicates in a separate low-mesh copy, reduce to 24K triangles, create new UVs and bake PBR maps from the untouched dense source. A first attempt retaining the original tiny UV islands produced artifacts and was rejected. Source must be deselected during multi-object edits.
- `tools/rig_bean.py`: rig the prepared mesh at 1.41 m with 2048 px maps, keeping the existing runtime skeleton and poses. Pass `1.41 - 2048 1 realism-pilot` after the two paths. The pilot profile fits symmetric shoulder/elbow/wrist joints and extends weights through the shoulders; generic width fitting had put the right shoulder 27 cm above the left and cut off the upper arm. It also keeps the spine ascending through the chest.
- `tools/rig-potato-detail.py`: transfer the exact playable skeleton and interpolated skin weights to the dense source, preserving every triangle and 4K maps. Select the imported skinned mesh by its armature modifier; Blender also creates an unweighted bone-display Icosphere. Inverse bind matrices match within 0.000005.

Use Blender 5.2 with `-b --factory-startup --python-exit-code 1 --python <tool> -- <arguments>`; each tool documents its arguments. Rigging and texture baking were local, without further generation charges.

## Verification

`tools/potato-realism-check.mjs` runs headless on ml350 with actual casino lighting and runtime materials. It checks 42 views across normal/fallback graphics, matching shoulder heights, ascending chest joints, both side views idle/walking in both detail levels, finite bounded idle/walk/sit/hold/death poses, existing wave/cheer/chips clips, real settings input, no dense download at Standard startup, one dense asset request, distance switching, Ultra selection, persistence, three hat/color/variety combinations and 32 pilot actors sharing one crowd geometry with exactly one dense draw. A separate aborted optional download still permits startup and play.

Evidence: `docs/performance/2026-10-17-potato-realism.json`. CPU submission samples are diagnostic, not a claim about GPU frame rate. The dense option costs more GPU work and memory; it is intentionally optional. Actual visual acceptance of this pilot remains Steve's review before further paid cast expansion.
