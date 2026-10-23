import type { Meta, StoryObj } from '@storybook/react-vite';
import { CreativeInventoryScreen, useItemCatalogue, useInventory, type CreativeItem } from '@mcgui/react';

function CreativeStory({ renderer }: { renderer: 'dom' | 'canvas' }) {
  const catalogue = useItemCatalogue();
  const items = useInventory<CreativeItem>({ initialSlots: Array<null>(41).fill(null),
    maxCount: (index, item) => index >= 36 && index < 40 ? 1 : item.maxStackSize ?? 64,
    canPlace: (index, item) => index >= 36 && index < 40 ? item.stackKey.endsWith(['_helmet', '_chestplate', '_leggings', '_boots'][index - 36]!) : true,
  });
  const hotbar = Array.from({ length: 9 }, (_, index) => 27 + index);
  return <>
    <CreativeInventoryScreen items={catalogue} renderer={renderer} inventory={items.slots.slice(0, 36)} armor={items.slots.slice(36, 40)} offhand={items.slots[40]}
      getCreativeSlotProps={item => items.getCreativeSlotProps(item, hotbar)}
      getSlotProps={address => items.getSlotProps(address.section === 'inventory' ? address.index : address.section === 'armor' ? 36 + address.index : 40)}
      onDiscard={clear => items.discard(clear ? Array.from({ length: 41 }, (_, index) => index) : [])} />
    {items.cursor}
  </>;
}
const meta = {
  title: 'Screens/CreativeInventoryScreen', component: CreativeStory,
  args: { renderer: 'dom' }, argTypes: { renderer: { control: 'select', options: ['dom', 'canvas'] } },
} satisfies Meta<typeof CreativeStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const Canvas: Story = { args: { renderer: 'canvas' } };
