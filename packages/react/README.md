# @mcgui/react

React 19 components backed by assets extracted locally with `@mcgui/assets`. Initial game profile: Minecraft Java 26.2.

```tsx
import { Button, MinecraftProvider } from '@mcgui/react';
import '@mcgui/react/styles.css';

<MinecraftProvider assets={manifest} baseUrl="/mcui" scale={2}>
  <Button onClick={onResume}>Back to Game</Button>
</MinecraftProvider>
```

Also exports `Checkbox`, `Slider`, `ProgressBar`, `FurnaceScreen`, `Sprite`, `MinecraftText`, `Slot`, `InventoryGrid`, `ChestScreen`, `Tooltip`, `useMinecraft`, and `parseManifest`. Dimensions use logical GUI units. Static text accepts strings or colored text runs and uses extracted bitmap glyphs with an accessible text equivalent. React client directives are preserved for framework integration.

## Creative inventory

`CreativeInventoryScreen` uses the locally extracted 26.2 sheets, tab sprites and scrollbar. Re-extract assets when upgrading. Supply your own catalogue or use `useItemCatalogue()` with a bundle extracted using `--items`. It reserves a 195×192 logical area, including its top/bottom tabs; narrow containers should allow horizontal scrolling instead of fractional GUI scaling.

```tsx
import { CreativeInventoryScreen, useInventory, type CreativeItem } from '@mcgui/react';

const catalogue: CreativeItem[] = [{
  stackKey: 'my:gem', label: 'Gem', count: 1, categories: ['ingredients'],
  tags: ['my:gems'], content: <img src="/my-icons/gem.png" alt="" />,
}];
const initialSlots: (CreativeItem | null)[] = Array(41).fill(null);
const hotbar = Array.from({ length: 9 }, (_, index) => 27 + index);

function CreativeMenu() {
  const inventory = useInventory({ initialSlots });
  return <>
    <CreativeInventoryScreen items={catalogue} defaultTab="ingredients"
      inventory={inventory.slots.slice(0, 36)} armor={inventory.slots.slice(36, 40)}
      offhand={inventory.slots[40]}
      getCreativeSlotProps={item => inventory.getCreativeSlotProps(item, hotbar)}
      getSlotProps={({ section, index, view }) => inventory.getSlotProps(
        section === 'inventory' ? index : section === 'armor' ? 36 + index : 40,
        { quickMoveTargets: view === 'catalogue' ? 'discard' :
          section === 'inventory' && index < 27 ? hotbar : Array.from({ length: 27 }, (_, i) => i) }
      )}
      onDiscard={clear => inventory.discard(clear ? Array.from({ length: 41 }, (_, i) => i) : [])}
    />
    {inventory.cursor}
    <output aria-live="polite">{inventory.carried ? `Carrying ${inventory.carried.label}, ${inventory.carried.count}` : 'Nothing carried.'}</output>
  </>;
}
// Render inside MinecraftProvider. Add canPlace/maxCount rules for equipment.
```

`CreativeItem` extends `InventoryItem` with `categories: readonly string[]` and optional `tags`. The default catalogue `count` is normally 1. Categories match the IDs in exported `DEFAULT_CREATIVE_TABS`: `building`, `colored`, `natural`, `functional`, `redstone`, `tools`, `combat`, `food`, `ingredients`, `spawn`; `saved`, `search`, and `inventory` are special tabs. Default tabs use Java 26.2's designated item icons from the active asset bundle. Override `tabs` to provide icons, localized labels, custom categories or optional operator tabs. Each `CreativeTab` specifies its unique `id`, `label`, `row`, `column` (0–6), optional `alignedRight`, `iconStackKey`, `icon` and `kind` (`category` by default). `iconStackKey` resolves a catalogue icon, while an explicit `icon` takes precedence. Tabs without an available icon use short text labels. `selectedTab`/`onTabChange` support controlled selection; `defaultTab` supports uncontrolled use.

Catalogue clicks copy without consuming the source. With a matching stack carried, left-click adds one, right-click removes one, and Shift-left-click fills the stack. Middle-click with an empty cursor clones the maximum stack. Clicking a different catalogue item while carrying discards the held stack (right-click discards one). Empty catalogue cells follow the same discard behaviour. Number keys 1–9 copy a full stack into the supplied hotbar indices. Ordinary inventory/hotbar cells retain pickup/place/split/drag behaviour; pass `quickMoveTargets: 'discard'` for the creative catalogue's Shift-click hotbar deletion. The inventory tab can use normal transfer destinations.

Search matches labels and stack IDs, or resource tags with `#`. Press `/` outside an input to open search; Escape clears it. The native input handles editing and clipboard access while extracted glyphs render its text, caret and selection. Unicode rendering is limited by the bundle's glyph coverage. Category changes reset search/scroll. Wheel, scrollbar drag/touch, arrow/Home/End keys on the scrollbar and PageUp/PageDown in the catalogue navigate rows. Tab buttons support arrow/Home/End navigation; slots keep their normal keyboard focus behaviour.

Saved hotbars are controlled: pass `savedHotbars` (up to nine snapshots of nine items), `onSaveHotbar(index)` and `onLoadHotbar(index)`. While focus is in the screen outside search, C + 1–9 invokes save and X + 1–9 invokes load. Saved rows also act as catalogue sources. Store snapshots in your app and load them with `inventory.replaceSlots(hotbarIndices, snapshot)`, which preserves the carried stack and obeys placement/removal/capacity restrictions. Storage lifetime and persistence belong to the app; the playground retains snapshots while changing textures but clears them on page reload.

`onDiscard(false)` handles the delete slot; Shift-click calls `onDiscard(true)`. `inventory.discard()` clears the carried stack, and `discard(indices)` also clears those removable inventory slots. Equipment/recipe rules remain app-owned. `playerPreview` accepts noninteractive app-rendered character artwork in the 32×43 preview area; otherwise it remains empty.

Creative tab changes reuse category ordering, unchanged tab buttons, slot surfaces and hotbar artwork. Mouse selection happens on press; keyboard activation and touch taps remain supported. A fixed pool of 45 catalogue cells reuses the 36 overlapping items when scrolling one row. Keyboard focus stays at the same visible cell and tooltips follow the item under the pointer. First-page and nearby-row icons are prepared during idle time, with at most four concurrent loads, 512 retained images and an 8 MiB estimated decoded-pixel budget per screen. The queue updates its priorities as you scroll and is cancelled on bundle changes or unmount. Set `preloadIcons={false}` to load icons only when displayed. Keep `items` and custom `tabs` references stable to retain their caches; `useItemCatalogue()` does this for extracted items. Closed tooltips defer text layout until opened. `InventoryGrid.startIndex` supplies absolute cell indices for apps rendering their own window into a larger inventory.

Chest screens support 1–6 rows plus player inventory and hotbar slots. Slots do not select themselves when clicked. Tooltips support hover, keyboard focus, Escape, multiline wrapping and viewport clamping.

`CreativeInventoryScreen renderer="canvas"` enables an experimental hybrid renderer for the catalogue and hotbar. It draws extracted `ItemIcon` content, stack counts and highlights into a canvas per grid. Buttons, keyboard navigation, search editing, tooltips and inventory state remain in HTML/React; the container background and tab artwork also retain their existing renderer. Arbitrary React item content stays in the DOM. The default remains `renderer="dom"`, and you can compare both in the playground's **Inventory renderer** selector.

Server-rendered markup retains DOM artwork until canvas images are decoded. Missing canvas support, image failures and forced-colors mode use the DOM fallback. Drawing happens after state changes, image completion and interaction events; there is no continuous animation loop. Decoded image caches target 512 entries / 16 MiB per grid, retaining any additional resources needed by the visible frame. Caches are discarded when the asset bundle changes or the grid unmounts. Both renderers use the same extraction bundle and need no new game assets.

Pixel checks cover both local bundles, GUI scales 1–4, DPR 1/2, counts and highlights. Translucent highlights can differ by one RGB level due to compositing rounding. At GUI scale 3, 64px baked icons become 48px and canvas/CSS nearest-neighbour boundary sampling differs slightly. This is a prototype for comparing rendering costs, not a claim of full in-game pixel parity.

`useInventory({ initialSlots, canTake?, canPlace?, maxCount?, quickMoveTargets?, hotbarSlots?, offhandSlot?, collectTargets? })` adds pickup/place, splitting, merging/swapping, Shift-click transfers, mouse drag distribution and double-click collection. `InventoryItem` extends `SlotData` with `stackKey`, required `count`, and optional `maxStackSize` (default 64). Include all stacking-relevant data in `stackKey`.

Render the returned `slots`, spread `getSlotProps(index)` onto standalone slots, or map screen addresses through `ChestScreen`/`FurnaceScreen`'s `getSlotProps` prop. Render the hook's `cursor` once inside `MinecraftProvider`, and provide an accessible status for its `carried` item. `state` exposes committed data; `slots`/`carried` include drag previews. `reset()` restores initial items. Use one hook for screens that share a cursor. The optional `selected`/`selectedSlot` props are for explicit application selection modes; omit them for Minecraft-style movement.

Enter/Space moves stacks, Shift+Enter/Space quick-transfers, and Shift+F10 splits/places one. Configure `hotbarSlots` (up to nine flat indices) for keys 1–9 and `offhandSlot` for F. Ordinary slots swap whole stacks, respecting removal/placement rules and destination capacity; insufficient capacity leaves both slots unchanged. Hovered slots take precedence over keyboard focus. Text inputs keep their native keys. Creative cells copy a full stack to the configured offhand with F. Double-click gathers matching items into the cursor, taking partial stacks first; `collectTargets(index)` limits eligible slots (default: every slot). Supply visible-container indices to avoid gathering from hidden containers. Screens sharing one hook can override this with `getSlotProps(index, { collectTargets: visibleIndices })`. Touch taps support pickup/place. Escape cancels drag preview without discarding items; outside clicks retain the held stack. World drops, Shift-double-click mass transfer and touch drag distribution remain unsupported.

## Extracted item icons

```tsx
import { ItemIcon, useItemCatalogue } from '@mcgui/react';

// Inside MinecraftProvider with an --items bundle:
const catalogue = useItemCatalogue();
// Each item has content, tooltip, tags, categories, count and a component-specific stackKey.
// Pass catalogue directly to CreativeInventoryScreen.
<ItemIcon stackKey="minecraft:diamond" />
```

`ItemIcon` renders at 16 logical pixels with nearest-neighbor scaling and resolves the active provider on pack changes, including for carried/saved stacks. `fallback` accepts a custom React node; the default purple checker indicates missing/unsupported icons. The hook returns a memoized empty array for a GUI-only bundle. Category order uses the extracted manifest; search also matches tooltip text, including enchantments. Metadata remains app-owned when placed in inventories. Static flat, cuboid, composite and supported special meshes cover the complete default Java 26.2 catalogue. Animated textures show the first declared frame, and dials show a fixed preview; `icon.notes` describes these choices. Live item-texture animation, personalized skins and full in-game pixel parity remain outside this milestone. See `@mcgui/assets` for precise extraction limits.

New `--items` bundles include shared icon atlases. `ItemIcon` automatically crops these with HTML/CSS; the creative preloader deduplicates requests by sheet and accounts for each sheet's decoded size within its 8 MiB budget. Older bundles continue to use individual images. At fractional resampling ratios (for example, a 64px model at GUI scale 3), HTML keeps the original PNG to preserve its pixel sampling. The experimental canvas renderer also uses atlas crops. Re-extract to enable atlases; no application API changes are needed.

## Item damage, glint and styled tooltips

Fresh catalogue exports include resolved `damage`, `maxDamage`, `glint` and `styledTooltip` values. `ItemIcon` uses these defaults automatically, including intrinsic glint on enchanted books. Override `damage`, `maxDamage` or `glint` for application state; explicit `0`/`false` overrides are respected. Durability uses Java's bar position, rounded 13-pixel width and HSV color calculation. Full durability and nondamageable items have no bar. `durabilityBar(damage, maxDamage)` is also available from `@mcgui/core` for custom renderers. Bundle fullness bars and other item-specific bar overrides are not implemented.

```tsx
import { ItemIcon, Slot, itemTooltip } from '@mcgui/react';

// entry is a catalogue item from the active manifest.
const tooltip = itemTooltip(entry, {
  name: [{ text: 'Old faithful', color: 'aqua', italic: true }],
  enchantments: ['Unbreaking III', 'Mending'],
  lore: ['A trusty companion.'],
  attributes: [
    [{ text: 'When in Main Hand:', color: 'gray' }],
    [{ text: '+6 Attack Damage', color: 'blue' }],
  ],
});
<Slot label="Old faithful" tooltip={tooltip}>
  <ItemIcon stackKey={entry.stackKey} damage={700} glint />
</Slot>
```

`useItemCatalogue()` supplies styled native tooltips automatically. `itemTooltip(entry)` preserves their order and colors. Its optional `name` replaces the title; specifying any detail section (`enchantments`, `lore`, `attributes`) replaces all native detail sections to avoid duplicates. Enchantments default to gray; lore defaults to italic dark purple. Strings or `TextRun[]` can override those styles. `TextRun` supports `color`, `bold`, `italic`, `underlined` and `strikethrough`; wrapping and measurement include bold advances. Attribute values come from the game's tooltip export without a player context, so they show raw modifiers rather than player-specific totals. Applications supply custom enchantment labels and attribute calculations. Obfuscated text, custom font descriptions and tooltip images are not implemented.

Glint uses the locally extracted `textures/misc/enchanted_glint_item.png`, masked by the icon's alpha (including atlas crops). Each visible icon uses one browser-managed transform animation, without a React frame loop; newly mounted icons join a shared document phase. Animation and media-query listeners are cancelled on unmount. Reduced-motion preferences pause it, and forced-colors mode hides it. This is a screen-space additive approximation: baked icons do not retain per-face glint UVs, and blending does not reproduce the game's full shader. Damaged or glinting cells use DOM artwork even with `renderer="canvas"`; ordinary cells keep canvas rendering. Older bundles omit glint until re-extracted. For stack movement, include damage/enchantments/custom text in your application `stackKey`; the icon's `stackKey` still selects the catalogue artwork.

`Checkbox` uses controlled `checked`/`onCheckedChange` and a single-line string child. `Slider` uses `label`, controlled `value`/`onValueChange`, numeric `min`/`max`/`step`, optional `valueLabel`, and logical `width`. Both wrap native inputs and accept input refs, form attributes, events, and `disabled`. `className`/`style` target their wrappers. Slider values snap to its step grid; labels clip when too long. Native keyboard behavior is preserved.

`ProgressBar` takes an accessible `label`, normalized `value` (0–1), and an `experience`, `furnace-arrow`, or `furnace-flame` variant. `FurnaceScreen` combines the 176×166 background, input/fuel/output slots, player inventory, and normalized `progress`/`fuelRemaining`. Applications own item contents, selection, timers, and smelting logic. Recipe-book UI is not included.

No Minecraft assets are included. The application supplies a generated manifest and serves its asset files. Re-extract assets when upgrading to new components. Production Vite and Next.js App Router consumers are tested from installed tarballs, including SSR/hydration, stylesheet imports, forms, refs, and portals. In server code, import manifest validation from `@mcgui/core`; the React entry point is a client boundary. General editable text remains planned. See the workspace README for setup and current limitations.
## Villager trading

`VillagerScreen` renders a 276×166 Java merchant interface. Supply `trades` with
`input`, optional `secondaryInput`, `output` (`SlotData`), and optional `outOfStock`.
Use `selectedTrade`/`onTradeSelect` for controlled selection, or omit the index for
internal selection (`defaultSelectedTrade` defaults to 0). `null` selects nothing.
Offers scroll and support Up/Down/Home/End focus navigation and Enter/Space selection.
Out-of-stock offers remain selectable so their costs can be inspected.

The actual `input`, `secondaryInput`, `output`, and 36-slot `inventory` props are
independent of those previews. Selecting a trade does not move or create items.
Bind `getSlotProps(address)` to your inventory controller, rejecting output placement
and enforcing payment when taking results. Addresses have `section` equal to
`input`, `secondaryInput`, `output` (index 0), or `inventory` (0–35).
The application owns stock, prices, result generation, and restocking.
`experience` optionally displays normalized villager level progress (0–1).
Re-extract bundles with the current CLI before using this screen.
