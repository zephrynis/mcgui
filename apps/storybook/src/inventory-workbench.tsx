import { useEffect, useState } from 'react';
import { Button, ChestScreen, InventoryGrid, Slot, Tooltip, MinecraftProvider, Sprite, parseManifest, useInventory, type AssetManifest, type InventoryItem, type CreativeItem } from '@mcgui/react';
import { SettingsLab } from './settings-lab';
import { FurnaceLab } from './furnace-lab';
import { CreativeLab } from './creative-lab';
import { ItemDetailsLab } from './item-details-lab';
import { minecraftItem, furnaceItems } from './items';

const chestItems: InventoryItem[] = [
  minecraftItem('diamond', 'Diamond', 32),
  minecraftItem('copper_ingot', 'Copper Ingot', 64),
  minecraftItem('amethyst_shard', 'Amethyst Shard', 1, true),
];
const playerInventory = Array.from({ length: 36 }, (_, index) => index === 0 || index === 27 ? minecraftItem('emerald', 'Emerald', index === 0 ? 16 : 4) : null);
const standalone: (InventoryItem | null)[] = [null,
  minecraftItem('echo_shard', 'Echo Shard', 8),
  minecraftItem('gold_ingot', 'Gold Ingot', 1, true),
];
const initialItems = [...Array.from({ length: 54 }, (_, index) => chestItems[index] ?? null), ...playerInventory, ...furnaceItems, ...standalone, ...Array<null>(5).fill(null)];
const playerTargets = Array.from({ length: 36 }, (_, index) => 89 - index);

export function InventoryWorkbench({ scale: globalScale = 2, bundle: globalBundle = 'mcgui' }: { scale?: number; bundle?: string }) {
  const [loadedAssets, setLoadedAssets] = useState<{ manifest: AssetManifest; bundle: string } | null>(null);
  const manifest = loadedAssets?.manifest ?? null;
  const baseUrl = loadedAssets ? `/${loadedAssets.bundle}` : '';
  const [error, setError] = useState('');
  const [bundle, setBundle] = useState(globalBundle);
  const [scale, setScale] = useState(globalScale);
  useEffect(() => setScale(globalScale), [globalScale]);
  useEffect(() => setBundle(globalBundle), [globalBundle]);
  const [width, setWidth] = useState(150);
  const [label, setLabel] = useState('Back to Game');
  const [clicks, setClicks] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [rows, setRows] = useState(3);
  const [savedHotbars, setSavedHotbars] = useState<(CreativeItem | null)[][]>(() => Array.from({ length: 9 }, () => Array<null>(9).fill(null)));
  const items = useInventory({ initialSlots: initialItems,
    hotbarSlots: Array.from({length:9},(_,index)=>81+index), offhandSlot:100,
    collectTargets: index => index >= 90 && index <= 92 ? [90,91,92,...playerTargets] : [...Array.from({length:rows*9},(_,index)=>index),...playerTargets],
    canPlace: (index, item) => index >= 96 && index <= 99 ? item.stackKey.endsWith(['_helmet', '_chestplate', '_leggings', '_boots'][index - 96]!) : index === 90 ? item.stackKey === 'minecraft:raw_iron' : index === 91 ? item.stackKey === 'minecraft:coal' : index !== 92,
    maxCount: (index, item) => index >= 96 && index <= 99 ? 1 : item.maxStackSize ?? 64,
    quickMoveTargets: index => index >= 54 && index < 90 ? Array.from({ length: rows * 9 }, (_, cell) => cell) : playerTargets,
  });
  const carriedLabel = items.carried ? `Carrying ${items.carried.label}, ${items.carried.count}.` : 'Nothing carried.';
  useEffect(() => {
    const controller = new AbortController(); setLoadedAssets(null); setError('');
    fetch(`/${bundle}/manifest.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('Local assets have not been extracted yet.');
      return parseManifest(await response.json());
    }).then(manifest => { if (!controller.signal.aborted) setLoadedAssets({ manifest, bundle }); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [bundle]);
  return <main className="integration-story">
    <h1>Inventory workbench</h1>
    <div className="workbench">
      <section className="preview-panel" aria-label="Component preview">
        <div className="preview-grid">
          {error ? <div role="alert"><p>{error}</p><code>npm run assets -- extract --version 26.2 --items --out apps/storybook/public/mcgui</code></div> : !manifest ? <p role="status">Loading local assets…</p> :
            <MinecraftProvider assets={manifest} baseUrl={baseUrl} scale={scale}>
              <div className="button-sample"><Button width={width} disabled={disabled} onClick={() => setClicks(value => value + 1)}>{label || 'Button'}</Button></div>
            </MinecraftProvider>}
        </div>
        <div className="preview-footer"><output aria-live="polite">{clicks === 0 ? 'No activations' : `Button activated ${clicks} ${clicks === 1 ? 'time' : 'times'}`}</output></div>
      </section>
      <aside className="fixture-controls" aria-label="Integration controls">
        <label htmlFor="label">Button label</label><input id="label" value={label} maxLength={48} onChange={event => setLabel(event.target.value)} />
        <label htmlFor="scale">GUI scale <span>{scale}×</span></label><select id="scale" value={scale} onChange={event => setScale(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value} value={value}>{value}×</option>)}</select>
        <label htmlFor="width">Logical width <span>{width}px</span></label><input id="width" type="range" min="80" max="200" step="1" value={width} onChange={event => setWidth(Number(event.target.value))} />
        <label className="check"><input type="checkbox" checked={disabled} onChange={event => setDisabled(event.target.checked)} /> Disabled state</label>
        <label htmlFor="bundle">Asset bundle</label><select id="bundle" value={bundle} onChange={event => setBundle(event.target.value)}><option value="mcgui">Vanilla · local extraction</option><option value="mcgui-pack">Test pack · local extraction</option></select>
      </aside>
    </div>
    {manifest ? <section className="states"><MinecraftProvider assets={manifest} baseUrl={baseUrl} scale={2}>
      <div className="state-list">{(['normal','highlighted','disabled'] as const).map(state => <article key={state}><p>{state}</p><Sprite name={`button.${state}`} width={120} height={20}/><span>{manifest.sprites[`button.${state}`].pixelWidth} × {manifest.sprites[`button.${state}`].pixelHeight} source pixels</span></article>)}</div>
    </MinecraftProvider></section> : null}
    {manifest ? <section className="inventory-lab" aria-label="Inventory workbench"><h2>Chest and shared inventory</h2>
      <div className="inventory-tools"><label htmlFor="chest-rows">Chest rows <select id="chest-rows" value={rows} onChange={event => setRows(Number(event.target.value))}>{[1,2,3,4,5,6].map(row => <option key={row} value={row}>{row} rows · {row * 9} slots</option>)}</select></label><p>Left-click to move stacks. Right-click to split or place one. Shift-click to transfer.</p><button className="tooltip-example" onClick={() => items.reset()}>Reset items</button></div>
      <MinecraftProvider assets={manifest} baseUrl={baseUrl} scale={scale}>
        <div className="chest-viewport"><ChestScreen rows={rows} slots={items.slots.slice(0, rows * 9)} inventory={items.slots.slice(54, 90)}
          getSlotProps={address => items.getSlotProps(address.section === 'chest' ? address.index : 54 + address.index)} /></div>
        <output className="slot-output" aria-live="polite">{carriedLabel}</output>
        {items.cursor}
        <div className="slot-examples"><div><p className="eyebrow">STANDALONE SLOTS</p><InventoryGrid columns={3} label="Standalone slots">
          {items.slots.slice(93, 96).map((item, index) => <Slot key={index} {...items.getSlotProps(index + 93)} label={item ? `${item.label}${item.count > 1 ? `, ${item.count}` : ''}` : `Empty standalone slot ${index + 1}`} count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}>{item?.content}</Slot>)}
        </InventoryGrid></div><Tooltip maxWidth={180} content={[{ text: 'Long tooltip example\n', color: 'gold' }, { text: 'This text wraps to fit the available viewport while preserving its colors.\n\n', color: 'gray' }, { text: 'Press Escape to dismiss.', color: 'green' }]}><button className="tooltip-example">Try a longer tooltip <span>↗</span></button></Tooltip></div>
      </MinecraftProvider>
       <p className="inventory-note">While carrying, hold and drag across slots to distribute evenly; right-drag places one per slot. Tab and arrow keys navigate; Enter/Space moves stacks, Shift+F10 splits. Item icons come from the active extracted Minecraft bundle.</p>
    </section> : null}
    {manifest ? <MinecraftProvider assets={manifest} baseUrl={baseUrl} scale={scale}><SettingsLab /><FurnaceLab items={items.slots.slice(90, 93)} inventory={items.slots.slice(54, 90)} carriedLabel={carriedLabel}
      getSlotProps={address => {
        const index = address.section === 'inventory' ? 54 + address.index : address.section === 'input' ? 90 : address.section === 'fuel' ? 91 : 92;
        const key = items.state.slots[index]?.stackKey;
        const targets = address.section !== 'inventory' ? playerTargets : key === 'minecraft:raw_iron' ? [90] : key === 'minecraft:coal' ? [91] : index < 81 ? Array.from({ length: 9 }, (_, i) => 81 + i) : Array.from({ length: 27 }, (_, i) => 54 + i);
        return items.getSlotProps(index, { quickMoveTargets: targets, collectTargets:[90,91,92,...playerTargets] });
      }} /><CreativeLab items={items} savedHotbars={savedHotbars} onSave={(index, snapshot) => setSavedHotbars(previous => previous.map((row, rowIndex) => rowIndex === index ? snapshot : row))} /><ItemDetailsLab inventory={items}/></MinecraftProvider> : null}
  </main>;
}
