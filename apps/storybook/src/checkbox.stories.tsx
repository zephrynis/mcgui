import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';
import { Checkbox } from '@mcgui/react';

const meta = {
  title: 'Controls/Checkbox', component: Checkbox, tags: ['autodocs'],
  args: { children: 'Show Subtitles', checked: false, disabled: false },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <Checkbox {...args} onCheckedChange={checked => updateArgs({ checked })} />;
  },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { checked: true, disabled: true } };
