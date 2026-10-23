import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChestScreen } from '@mcgui/react';
import { minecraftItem } from './items';

const meta = {
  title: 'Screens/ChestScreen', component: ChestScreen, tags: ['autodocs'],
  args: { rows: 3, slots: [minecraftItem('diamond', 'Diamond', 32)] },
  argTypes: { rows: { control: { type: 'range', min: 1, max: 6, step: 1 } }, slots: { control: false }, inventory: { control: false } },
} satisfies Meta<typeof ChestScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const OneRow: Story = { args: { rows: 1 } };
export const SixRows: Story = { args: { rows: 6 } };
export const Empty: Story = { args: { slots: [] } };
