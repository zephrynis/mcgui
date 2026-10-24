# @mcgui/core

Shared manifest validation, resource identifiers, font measurement, and sprite geometry for MCGUI. Initial profile: Minecraft Java 26.2, resource-pack format 88.0.

Exports `parseManifest`, `manifestSchema`, `resourcePath`, `assetUrl`, `measureText`, `spriteSlices`, `normalizeSliderValue`, `progressGeometry`, `chestLayout`, text formatting/wrapping helpers, `JAVA_26_2` resource/layout profiles, and their TypeScript types. New sprite and container roles are optional in the schema so existing manifests still parse; components requiring absent assets request re-extraction. No Minecraft assets are included. See the workspace README for setup and compatibility.

Inventory helpers: `clickInventory`, `quickMoveInventory`, `distributeInventory`, `canDistributeTo`, and `validateInventory`, with `ItemStack`, `InventoryState`, `InventoryRules`, and `InventoryButton` types. They return immutable state for pickup/place/split/merge/swap, ordered quick transfers, and left/right drag distribution. The application supplies stack identity, placement/removal rules, capacities, and transfer destinations. No React, game assets, or game simulation is involved.

Creative helpers: `pickCreativeItem` implements infinite catalogue pickup, Shift-click full stacks, matching-stack increments/decrements and middle-click cloning. `copyCreativeToSlot` copies a full stack into a target hotbar slot without changing the carried item. `filterCreativeItems` filters app-owned names/IDs, category membership and `#tags`. `CREATIVE_LAYOUT`, `creativeTabPosition`, `creativeScrollRows` and `CREATIVE_TAB_SPRITES` describe the 26.2 screen geometry and resource IDs.
