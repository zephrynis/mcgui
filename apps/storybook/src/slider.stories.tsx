import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useArgs } from 'storybook/preview-api';
import { Slider, type SliderProps } from '@mcgui/react';

function InteractiveSlider({ commitValue, ...args }: SliderProps & { commitValue: (value: number) => void }) {
  // Render drag feedback locally; the manager's args channel is asynchronous.
  const [current, setCurrent] = useState(args.value);
  const [previousValue, setPreviousValue] = useState(args.value);
  if (args.value !== previousValue) {
    setPreviousValue(args.value);
    setCurrent(args.value);
  }
  const commit = () => commitValue(current);
  return <Slider {...args} value={current} onValueChange={setCurrent}
    onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} />;
}

const meta = {
  title: 'Controls/Slider', component: Slider, tags: ['autodocs'],
  args: { label: 'Music', value: 50, min: 0, max: 100, step: 1, width: 150, disabled: false },
  argTypes: { value: { control: { type: 'range', min: 0, max: 100, step: 1 } }, width: { control: { type: 'number', min: 16, max: 2048, step: 1 } } },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <InteractiveSlider {...args} commitValue={value => updateArgs({ value })} />;
  },
} satisfies Meta<typeof Slider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Stepped: Story = { args: { label: 'Brightness', value: 75, step: 5 } };
export const Disabled: Story = { args: { disabled: true, value: 25 } };
