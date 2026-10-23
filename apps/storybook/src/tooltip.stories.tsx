import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Tooltip } from '@mcgui/react';

const meta = {
  title: 'Primitives/Tooltip', component: Tooltip, tags: ['autodocs'],
  args: { content: 'Hover or focus the button.', maxWidth: 180, children: <Button width={150}>Show tooltip</Button> },
  argTypes: { content: { control: 'text' }, children: { control: false }, maxWidth: { control: { type: 'number', min: 40, max: 400, step: 1 } } },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Long: Story = { args: { content: 'Long tooltip example\nThis text wraps to fit the available viewport.\n\nPress Escape to dismiss.' } };
export const Colored: Story = { args: { content: [{ text: 'Diamond Sword\n', color: 'aqua' }, { text: 'Unbreaking III\n', color: 'gray' }, { text: 'A trusty companion.', color: 'light_purple', italic: true }] }, argTypes: { content: { control: 'object' } } };
