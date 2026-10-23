'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, CreativeInventoryScreen, FurnaceScreen, InventoryGrid, ItemIcon, Slot, MinecraftProvider, ProgressBar, Slider, Tooltip, useInventory, useItemCatalogue, type AssetManifest, type CreativeItem, type InventoryItem } from '@mcgui/react';

const creativeItems: CreativeItem[] = [{ stackKey: 'sample-block', label: 'Sample block', count: 1, categories: ['building'], tags: ['sample:blocks'],
  content: <svg viewBox="0 0 16 16"><path fill="#91b86e" d="M1 1h14v14H1z" /></svg> }];

function ExtractedItem() {
  const catalogue=useItemCatalogue();
  return <div data-extracted-count={catalogue.length} aria-label="Extracted item example" style={{width:32,height:32}}><ItemIcon stackKey="minecraft:diamond" fallback={<span>No item bundle</span>}/></div>;
}

export function Controls({ assets }: { assets: AssetManifest }) {
  const [checked, setChecked] = useState(false), [volume, setVolume] = useState(50), [scale, setScale] = useState(2);
  const [fine, setFine] = useState(0.26);
  const [hydrated, setHydrated] = useState(false), [submitted, setSubmitted] = useState('Not submitted');
  const checkbox = useRef<HTMLInputElement>(null), slider = useRef<HTMLInputElement>(null);
  const inventory = useInventory<InventoryItem>({ initialSlots: [
    { stackKey: 'sample-gem', label: 'Sample gem', count: 9, tooltip: 'Sample gem', content: <svg viewBox="0 0 16 16"><path fill="#55ffff" d="M4 2h8v2h2v8h-2v2H4v-2H2V4h2z"/></svg> }, null, null,
    ...Array<null>(41).fill(null),
  ] });
  useEffect(() => setHydrated(true), []);
  return <main data-hydrated={hydrated}>
    <h1>MCUI consumer</h1>
    <MinecraftProvider assets={assets} baseUrl="/mcui" scale={scale}>
      <ExtractedItem />
      <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setSubmitted(`${data.get('subtitles') ?? 'off'}:${data.get('volume')}`); }}
        onReset={() => { setChecked(false); setVolume(50); }}>
        <Tooltip content="Enable subtitles"><Checkbox ref={checkbox} name="subtitles" checked={checked} onCheckedChange={setChecked}>Subtitles</Checkbox></Tooltip>
        <Slider ref={slider} name="volume" label="Volume" value={volume} onValueChange={setVolume} />
        <Button type="submit" width={150}>Save</Button>
        <Button type="reset" width={150}>Reset</Button>
      </form>
      <ProgressBar label="Experience" value={volume / 100} />
      <Slider label="Fine adjustment" min={-1} max={1} step={0.1} value={fine} onValueChange={setFine} />
      <FurnaceScreen progress={volume / 100} fuelRemaining={0.5} />
      <InventoryGrid label="Movable items" columns={3}>{inventory.slots.slice(0, 3).map((item, index) => <Slot {...inventory.getSlotProps(index)} key={index}
        label={item ? `${item.label}, ${item.count}` : `Empty movable slot ${index + 1}`} count={item?.count} tooltip={item?.tooltip}>{item?.content}</Slot>)}</InventoryGrid>
      {inventory.cursor}
      <CreativeInventoryScreen items={creativeItems} inventory={inventory.slots.slice(3, 39)} armor={inventory.slots.slice(39, 43)} offhand={inventory.slots[43]}
        getCreativeSlotProps={item => inventory.getCreativeSlotProps(item, Array.from({ length: 9 }, (_, index) => 30 + index))}
        getSlotProps={address => inventory.getSlotProps(address.section === 'inventory' ? 3 + address.index : address.section === 'armor' ? 39 + address.index : 43)}
        onDiscard={clear => inventory.discard(clear ? Array.from({ length: 41 }, (_, index) => index + 3) : [])} />
    </MinecraftProvider>
    <button onClick={() => checkbox.current?.focus()}>Focus checkbox</button>
    <button onClick={() => slider.current?.focus()}>Focus slider</button>
    <button onClick={() => setScale(value => value === 2 ? 1 : 2)}>Change scale</button>
    <output aria-live="polite">{submitted}</output>
  </main>;
}
