import type { Meta, StoryObj } from '@storybook/react-vite';
import { InventoryGrid, Slot, ItemIcon } from '@mcgui/react';

const meta = {
  title: 'Inventory/InventoryGrid', component: InventoryGrid, tags: ['autodocs'],
  args: { columns: 9, label: 'Inventory', children: null },
  argTypes: { columns: { control: { type: 'number', min: 1, max: 9, step: 1 } }, children: { control: false } },
  render: args => <InventoryGrid {...args}>{Array.from({ length: 27 }, (_, index) => <Slot key={index} label={index === 0 ? 'Diamond, 32' : `Empty slot ${index + 1}`} count={index === 0 ? 32 : undefined}>{index === 0 ? <ItemIcon stackKey="minecraft:diamond" /> : null}</Slot>)}</InventoryGrid>,
} satisfies Meta<typeof InventoryGrid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const ThreeColumns: Story = { args: { columns: 3 } };
