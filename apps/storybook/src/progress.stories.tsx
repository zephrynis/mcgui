import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from '@mcgui/react';

const meta = {
  title: 'Controls/ProgressBar', component: ProgressBar, tags: ['autodocs'],
  args: { label: 'Experience', value: 0.5, variant: 'experience' },
  argTypes: { value: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }, variant: { control: 'select', options: ['experience', 'furnace-arrow', 'furnace-flame'] } },
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { value: 0 } };
export const Full: Story = { args: { value: 1 } };
export const Smelting: Story = { args: { label: 'Smelting', variant: 'furnace-arrow' } };
export const Fuel: Story = { args: { label: 'Fuel', variant: 'furnace-flame' } };
