import type { Meta, StoryObj } from '@storybook/react-vite';
import { FurnaceScreen } from '@mcgui/react';
import { furnaceItems } from './items';

const meta = {
  title: 'Screens/FurnaceScreen', component: FurnaceScreen, tags: ['autodocs'],
  args: { input: furnaceItems[0], fuel: furnaceItems[1], output: furnaceItems[2], progress: 0.5, fuelRemaining: 0.75 },
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    fuelRemaining: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    input: { control: false }, fuel: { control: false }, output: { control: false }, inventory: { control: false },
  },
} satisfies Meta<typeof FurnaceScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Idle: Story = { args: { progress: 0, fuelRemaining: 0 } };
export const Complete: Story = { args: { progress: 1 } };
