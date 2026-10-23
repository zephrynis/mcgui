import type { Meta, StoryObj } from '@storybook/react-vite';
import { VillagerScreen } from '@mcgui/react';
import { minecraftItem } from './items';

const emerald = minecraftItem('emerald', 'Emerald');
const trades = [
  { input: minecraftItem('wheat', 'Wheat', 20), output: emerald },
  { input: emerald, output: minecraftItem('bread', 'Bread', 6) },
  { input: minecraftItem('carrot', 'Carrot', 22), output: emerald, outOfStock: true },
  { input: minecraftItem('emerald', 'Emerald', 4), secondaryInput: minecraftItem('book', 'Book'), output: minecraftItem('bookshelf', 'Bookshelf') },
];
const meta = {
  title: 'Screens/VillagerScreen', component: VillagerScreen, tags: ['autodocs'],
  args: { title: 'Farmer - Novice', trades, experience: 0.35,
    inventory: [minecraftItem('wheat', 'Wheat', 64), minecraftItem('emerald', 'Emerald', 16)] },
  argTypes: {
    trades: { control: false }, inventory: { control: false }, input: { control: false },
    secondaryInput: { control: false }, output: { control: false },
    experience: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
} satisfies Meta<typeof VillagerScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const ReadyToTrade: Story = { args: { input: trades[0]!.input, output: emerald } };
export const OutOfStock: Story = { args: { selectedTrade: 2 } };
export const TwoInputs: Story = { args: { selectedTrade: 3, input: trades[3]!.input, secondaryInput: trades[3]!.secondaryInput, output: trades[3]!.output } };
export const Scrolling: Story = { args: { trades: Array.from({ length: 12 }, (_, i) => trades[i % trades.length]!) } };
export const Empty: Story = { args: { trades: [], experience: undefined } };
