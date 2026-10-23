import { useState } from 'react';
import { FurnaceScreen, ProgressBar, Slider, type FurnaceScreenProps, type InventoryItem } from '@mcgui/react';

export function FurnaceLab({ items, inventory, getSlotProps, carriedLabel }: { items: readonly (InventoryItem | null)[]; inventory: FurnaceScreenProps['inventory']; getSlotProps: FurnaceScreenProps['getSlotProps']; carriedLabel: string }) {
  const [progress, setProgress] = useState(50), [remaining, setRemaining] = useState(75);
  return <section className="furnace-lab" aria-label="Furnace workbench">
    <h2>Furnace</h2>
    <div className="furnace-viewport"><div className="furnace-demo">
      <FurnaceScreen input={items[0]} fuel={items[1]} output={items[2]} inventory={inventory} progress={progress / 100} fuelRemaining={remaining / 100} getSlotProps={getSlotProps} />
      <div className="furnace-controls">
        <Slider label="Smelting" value={progress} onValueChange={setProgress} valueLabel={`Smelting: ${progress}%`} />
        <Slider label="Fuel" value={remaining} onValueChange={setRemaining} valueLabel={`Fuel: ${remaining}%`} />
        <ProgressBar label="Experience" value={progress / 100} />
      </div>
    </div></div>
    <output className="furnace-output slot-output" aria-live="polite">{carriedLabel}</output>
    <p className="inventory-note">The player inventory is shared with the chest. Raw iron goes in the input, coal in the fuel slot; iron ingots can only be taken from the output. Progress is controlled by the sliders.</p>
  </section>;
}
