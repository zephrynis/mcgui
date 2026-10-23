# Consumer integration examples

These source templates exercise MCUI through built npm tarballs, without workspace source aliases. `shared/Controls.tsx` demonstrates controlled native checkboxes/sliders, input refs, forms, tooltips, progress, a furnace, movable slots with a carried cursor, a creative catalogue, and scale changes. Vite loads the manifest in the browser. Next.js reads it in a Server Component and passes it into the shared client component. Both verify inventory pickup/splitting/placement, keyboard movement, creative tag search, full-stack copying and deletion after loading or hydrating.

Run from the repository root:

```sh
npm run build
npm run check:consumers
```

The script creates separate Vite and Next.js projects in a temporary directory, prints that path, copies `shared/` into each project, and writes their package manifests/TypeScript configuration. It installs the actual `@mcgui/core`, `@mcgui/assets`, and `@mcgui/react` tarballs alongside exact dependency versions. It then runs the installed CLI, typechecks, builds, starts production servers on 127.0.0.1 ports 5191/5192, and verifies behavior in Chrome. Servers stop after the checks; the temporary projects remain inspectable.

No Minecraft installation is needed: default assets are original synthetic test fixtures with a deliberately tiny glyph set. Their visual labels are placeholders; accessible labels retain the complete text. To inspect the examples using your locally extracted assets:

```sh
MCUI_CONSUMER_BUNDLE=apps/storybook/public/mcui npm run check:consumers
```

This only copies the supplied bundle into temporary consumer directories. Generated game assets are not added to these templates or package tarballs. `MCUI_CHROME` selects a browser executable. Screenshots are saved as `mcui-consumer-vite.png` and `mcui-consumer-next.png` in the system temporary directory.

The checks need npm registry access and use Next.js 16.3.4's App Router with a Webpack production build, plus the workspace's locked Vite/React versions. The example follows the [Next.js installation/build workflow](https://nextjs.org/docs/app/getting-started/installation) and [React's controlled input API](https://react.dev/reference/react-dom/components/input). No `transpilePackages` or custom MCUI aliases are necessary.

When adapting the templates, import `@mcgui/react/styles.css` once in the Vite entry point or Next.js root layout. In Next.js server code, use `parseManifest` from `@mcgui/core`; import interactive components in a file with `'use client'`. Serve the extracted `files/` beside `manifest.json` under the provider's `baseUrl`.
