import type { Preview } from '@storybook/react-vite';
import { AssetPreview } from '../src/asset-preview';
import '@mcgui/react/styles.css';
import '../src/style.css';

const preview: Preview = {
  globalTypes: {
    scale: {
      description: 'GUI scale',
      toolbar: { title: 'GUI scale', dynamicTitle: true, items: [1, 2, 3, 4].map(value => ({ value, title: `${value}×` })) },
    },
    bundle: {
      description: 'Locally extracted asset bundle',
      toolbar: { title: 'Asset bundle', dynamicTitle: true, items: [
        { value: 'mcgui', title: 'Vanilla (local)' },
        { value: 'mcgui-pack', title: 'Test pack (local)' },
      ] },
    },
  },
  decorators: [(Story, context) => context.parameters.standalone
    ? <Story />
    : <AssetPreview scale={Number(context.globals.scale)} bundle={String(context.globals.bundle)}><Story /></AssetPreview>],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    backgrounds: { options: { dark: { name: 'Dark', value: '#242424' }, light: { name: 'Light', value: '#ffffff' } } },
    options: { storySort: { order: ['Primitives', 'Controls', 'Inventory', 'Screens', 'Items', 'Examples'] } },
  },
  initialGlobals: { scale: 2, bundle: 'mcgui', backgrounds: { value: 'dark' } },
};
export default preview;
