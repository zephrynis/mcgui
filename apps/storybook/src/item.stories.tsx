import type { Meta, StoryObj } from '@storybook/react-vite';
import { ItemIcon, Slot } from '@mcgui/react';

const meta = {
  title: 'Items/ItemIcon', component: ItemIcon, tags: ['autodocs'],
  args: { stackKey: 'minecraft:diamond_sword', damage: 0, maxDamage: 1561, glint: false },
  argTypes: { damage: { control: { type: 'range', min: 0, max: 1561, step: 1 } } },
  render: args => <Slot label={args.stackKey}><ItemIcon {...args} /></Slot>,
} satisfies Meta<typeof ItemIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Damaged: Story = { args: { damage: 700 } };
export const Enchanted: Story = { args: { damage: 700, glint: true } };
