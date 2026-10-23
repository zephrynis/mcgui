import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '@mcgui/react';

const meta = {
  title: 'Primitives/Button', component: Button, tags: ['autodocs'],
  args: { children: 'Back to Game', width: 150, height: 20, disabled: false, onClick: fn() },
  argTypes: {
    children: { control: 'text' },
    width: { control: { type: 'range', min: 80, max: 200, step: 1 } },
    height: { control: { type: 'number', min: 12, max: 512, step: 1 } },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const LongLabel: Story = { args: { children: 'Disconnect from Server', width: 200 } };
