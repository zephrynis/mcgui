import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slot, ItemIcon } from '@mcgui/react';

const meta = {
  title: 'Inventory/Slot', component: Slot, tags: ['autodocs'],
  args: { label: 'Diamond', tooltip: 'Diamond', disabled: false },
  argTypes: { children: { control: false }, count: { control: { type: 'number', min: 1, max: 999, step: 1 } } },
} satisfies Meta<typeof Slot>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { label: 'Empty slot', tooltip: undefined } };
export const Occupied: Story = { args: { children: <ItemIcon stackKey="minecraft:diamond" />, count: 32 } };
export const FullStack: Story = { args: { children: <ItemIcon stackKey="minecraft:diamond" />, count: 64 } };
export const Disabled: Story = { args: { children: <ItemIcon stackKey="minecraft:diamond" />, disabled: true } };
