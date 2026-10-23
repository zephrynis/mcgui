# @mcgui/assets

Offline extraction of locally supplied Minecraft Java 26.2 GUI assets. Requires Node.js 22.18+.

```sh
mcui-assets list
mcui-assets extract --version 26.2 --out ./public/mcui
mcui-assets validate ./public/mcui
```

Use `--client-jar` or `--minecraft-dir` for explicit installation selection. Repeat `--pack` for ordered ZIP/directory resource packs; later packs win. Use `--characters` to replace the default printable ASCII character set.

The extractor includes 50 sprites, chest/furnace/creative sheets, and bitmap fonts. Container sheets preserve a 256×256 logical coordinate system at higher texture resolutions. Compatible format-88 overlays are supported. Unsupported required font providers, animated GUI resources, resource filters, and custom GUI atlas definitions produce errors. The tool does not download game files or access accounts.

Add `--items` to export the Java 26.2 creative catalogue and bake item icons:

```sh
mcui-assets extract --version 26.2 --items --java /path/to/java --out public/mcui
```

This optional step requires Java 25+ and the dependencies from an installed game. It runs our small Java source helper against your local client JAR without opening a game window. Prism and official-launcher metadata are discovered beside the installation. Custom launchers can provide `--version-metadata <version.json>` and `--libraries <Maven-library-directory>`. Missing dependencies produce an export error; nothing is downloaded. GUI-only extraction does not require Java.

The catalogue contains default-feature creative entries, names, tooltip text, item tags, stack limits, component-specific identities and category order. Operator-only entries are excluded. Dynamic registry variants use deterministic identifier order; tag members retain their data-file order. English names come from the game; pack `en_us.json` overrides apply to ordinary item names. Variant tooltip translations remain the game's English text. Resource packs change visuals, not gameplay registries or tags; data packs and mods are outside this version's scope.

The static icon baker resolves model parents, texture references (including bare slots), generated layers, constant/potion/dye/grass/firework tints, cuboids, element/GUI transforms, item-definition quaternion transforms and face UV rotations. Composite layers share depth testing, allowing complete beds and other multi-part icons. Resting use-state, component, block-state, trim and GUI-context selectors are supported. Animated textures show their first declared frame; clocks and compasses show a fixed dial. These snapshot choices are listed in `icon.notes` and `diagnostics.json`.

The Java helper also exports the installed client's mesh layers for chests, shulker boxes, banners, skulls, shields, conduits, decorated pots and copper golem statues. The baker combines that local geometry with effective resource-pack textures. Banner dye and pattern layers include the ominous banner. Plain player heads use the local default Steve texture; no skins are downloaded. Re-export older catalogue JSON files to include the new mesh data.

Models bake at 64×64; untransformed generated textures retain their resolution up to 1024px. Later packs and compatible overlays win at each lookup, including special-model materials, models and item definitions. Unsupported selectors/renderers, missing resources, invalid animation frames and old exports lacking mesh data produce an `iconWarning`. Arbitrary atlas remapping, live animation/world state, custom player profiles, patterned shields, decorated-pot sherd variants and open-container poses remain unsupported. Icons are static; glint is applied separately by React. Exact pixel parity with the running game remains unverified.

`manifest.catalogue.items` contains each entry's `icon` or `iconWarning`; `diagnostics.json` lists unsupported entries and static preview notes. `validate` verifies icon hashes and dimensions alongside GUI resources. A vanilla 26.2 extraction currently exports all 1,895 catalogue entries with nonempty icons. These counts can change with a pack.

Item extraction also packs compatible icons into content-hashed PNG atlas pages, at most 512×512 each. Pages group icons by resolution and preserve catalogue order within each group. Identical images share a rectangle; no source pixels are rescaled. `icon.atlas` records the page's `file`, `pixelWidth`, `pixelHeight`, `x` and `y`; the crop size remains `icon.pixelWidth` × `icon.pixelHeight`. Original files remain available for older consumers. Oversized icons and resolutions that cannot align to 16 logical pixels stay as individual PNGs. Validation checks atlas bounds, hashes and dimensions. Generated pages are local assets, just like the extracted textures.

For repeat builds, `exportCatalogue(clientJar, options)` returns the original JSON export as a Buffer. Save it locally, then pass `--items --catalogue-file <export.json>` to bake without Java. The exported data is part of your local asset workflow and is not shipped with MCUI. Do not use a manifest as the catalogue-file input.

Current exports also retain the game's resolved damage/max-damage values, `hasFoil()` flag, and styled tooltip runs (color, bold, italic, underline, strikethrough). Plain tooltip lines remain available for search and older consumers. The extractor includes the resolved `misc/enchanted_glint_item.png` as `textures['item.glint']`; compatible packs can replace it. Re-export older catalogue JSON files to obtain item state and tooltip styles. Tooltips use the vanilla English language and no player context; item names still honor supported pack language replacements. Click/hover events, obfuscation, custom font providers and tooltip images are not interpreted.

Programmatic exports: `extractAssets`, `exportCatalogue`, `listInstallations`, `validateBundle`, and `DEFAULT_CHARACTERS`. `extractAssets` accepts `items`, `java`, `versionMetadata`, `libraries` and `catalogueFile` in addition to its GUI options. No Minecraft assets are included. See the workspace README for deployment notes.
