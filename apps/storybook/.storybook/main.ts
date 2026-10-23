import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs'],
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(config, {
      resolve: { alias: {
        '@mcgui/react/styles.css': fileURLToPath(new URL('../../../packages/react/src/styles.css', import.meta.url)),
        '@mcgui/react': fileURLToPath(new URL('../../../packages/react/src/index.tsx', import.meta.url)),
        '@mcgui/core': fileURLToPath(new URL('../../../packages/core/src/index.ts', import.meta.url)),
      } },
      optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    });
  },
};
export default config;
