import type { Meta, StoryObj } from '@storybook/react-vite';
import { MinecraftText } from '@mcgui/react';

const meta = {
  title: 'Primitives/MinecraftText', component: MinecraftText, tags: ['autodocs'],
  args: { children: 'Minecraft Java Edition', shadow: true },
  argTypes: { children: { control: 'text' } },
} satisfies Meta<typeof MinecraftText>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoShadow: Story = { args: { shadow: false } };
export const UnifontFallback: Story = { args: { children: 'Minecraft + Unifont: ∑ ∫ ⊗ ∈ ℝ\n漢字 日本語 한글' } };
export const Styled: Story = { args: { children: [
  { text: 'Diamond Sword\n', color: 'aqua' },
  { text: 'Unbreaking III\n', color: 'gray' },
  { text: 'A trusty companion.', color: 'light_purple', italic: true },
] }, argTypes: { children: { control: 'object' } }, parameters: { docs: { source: {
  // The automatic JSX serializer treats TextRun[] as React children.
  type: 'code',
  code: `<MinecraftText children={[{ text: 'Diamond Sword\\n', color: 'aqua' }, { text: 'Unbreaking III\\n', color: 'gray' }, { text: 'A trusty companion.', color: 'light_purple', italic: true }]} />`,
} } } };
