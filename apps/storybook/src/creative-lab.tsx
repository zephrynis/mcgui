import { useState } from 'react';
import { CreativeInventoryScreen, useItemCatalogue, type CreativeItem, type InventoryItem, type useInventory } from '@mcgui/react';

const hotbar = Array.from({ length: 9 }, (_, index) => 81 + index);
const player = Array.from({ length: 36 }, (_, index) => 54 + index);
const equipment = Array.from({ length: 5 }, (_, index) => 96 + index);
type Inventory = ReturnType<typeof useInventory<InventoryItem>>;
export function CreativeLab({ items, savedHotbars, onSave }: { items: Inventory; savedHotbars: readonly (readonly (CreativeItem | null)[])[]; onSave: (index: number, snapshot: (CreativeItem | null)[]) => void }) {
  const catalogue = useItemCatalogue();
  const [renderer, setRenderer] = useState<'dom' | 'canvas'>('dom');
  return <section className="creative-lab" aria-label="Creative workbench">
    <h2>Creative inventory</h2>
    <div className="inventory-tools"><p>Click to pick an item. Shift-click or middle-click for a full stack. Use the tabs or press / to search.</p></div>
    <div className="inventory-tools"><label>Inventory renderer <select aria-label="Inventory renderer" value={renderer} onChange={event => setRenderer(event.target.value as 'dom' | 'canvas')}>
      <option value="dom">HTML / SVG</option><option value="canvas">Canvas · experimental</option>
    </select></label></div>
    <div className="creative-viewport"><CreativeInventoryScreen items={catalogue} renderer={renderer}
      inventory={items.slots.slice(54, 90)} armor={items.slots.slice(96, 100)} offhand={items.slots[100]}
      getCreativeSlotProps={item => items.getCreativeSlotProps(item, hotbar)}
      getSlotProps={address => items.getSlotProps(address.section === 'inventory' ? 54 + address.index : address.section === 'armor' ? 96 + address.index : 100,
        { collectTargets:player, quickMoveTargets: address.view === 'catalogue' ? 'discard' : address.section !== 'inventory' ? player : address.index < 27 ? hotbar : player.slice(0, 27) })}
      onDiscard={clear => items.discard(clear ? [...player, ...equipment] : [])}
      savedHotbars={savedHotbars} onSaveHotbar={index => onSave(index, hotbar.map(index => {
        const item = items.state.slots[index]; return item ? { ...item, categories: (item as CreativeItem).categories ?? [] } : null;
      }))} onLoadHotbar={index => items.replaceSlots(hotbar, Array.from({ length: 9 }, (_, slot) => savedHotbars[index]?.[slot] ?? null))} />
    </div>
    <output className="slot-output" aria-live="polite">{items.carried ? `Carrying ${items.carried.label}, ${items.carried.count}.` : 'Nothing carried.'}</output>
    <p className="inventory-note">The hotbar and player inventory are shared with the chest and furnace. Focus a catalogue item and press 1–9 to copy it into the hotbar. C + 1–9 saves a hotbar; X + 1–9 loads it. Search names, IDs, or #tags. Items and GUI textures come from your local extraction. Animated items and dials show static previews. Press 1–9 or F on inventory slots to swap with the hotbar or offhand; double-click to gather matching stacks.</p>
  </section>;
}
