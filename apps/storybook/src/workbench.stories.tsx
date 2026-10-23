import type { Meta, StoryObj } from '@storybook/react-vite';
import { InventoryWorkbench } from './inventory-workbench';

const meta = {
  title: 'Examples/Inventory workbench',
  component: InventoryWorkbench,
  parameters: { standalone: true, controls: { disable: true } },
  render: (_args, context) => <InventoryWorkbench scale={Number(context.globals.scale)} bundle={String(context.globals.bundle)} />,
} satisfies Meta<typeof InventoryWorkbench>;
export default meta;
export const Interactive: StoryObj<typeof meta> = {};
