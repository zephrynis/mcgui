# MCGUI

Minecraft Java Edition interfaces for React, built from assets you supply.

MCGUI combines native web controls with Minecraft textures, bitmap text, item icons, and familiar inventory layouts. Extract assets from your local game installation once, then serve the generated bundle alongside your application. Extraction stays out of the browser.

**Experimental · React 19 · Minecraft Java 26.2 · MIT-licensed code**

Version **0.1.0** is published on npm. You can also build and explore the components locally through Storybook.

## Install

In a React 19 application:

```sh
npm install @mcgui/react
npm install --save-dev @mcgui/assets
```

Extract assets from your local Minecraft Java 26.2 installation into your application's public directory:

```sh
npx mcgui-assets extract --version 26.2 --items --out ./public/mcgui
npx mcgui-assets validate ./public/mcgui
```

Item extraction requires Java 25+; omit `--items` for GUI-only extraction. Import `@mcgui/react/styles.css` once and provide the generated manifest to `MinecraftProvider`, as shown below. If your application imports manifest validation or inventory helpers directly from `@mcgui/core`, add it as a direct dependency with `npm install @mcgui/core`.

## Features

- **Controls:** buttons, checkboxes, sliders, and experience/furnace progress indicators.
- **Inventory screens:** chests with 1–6 rows, furnaces, villager trading, and creative inventory.
- **Item interactions:** pickup, placement, splitting, merging, swapping, quick transfers, mouse drag distribution, and configurable inventory rules.
- **Item artwork:** locally extracted static icons, durability bars, styled tooltips, and an approximate enchanted-glint effect.
- **Text and textures:** extracted glyphs, colored and formatted text, nine-slice sprites, nearest-neighbor rendering, and integer GUI scaling.
- **Resource packs:** ordered ZIP or directory packs, compatible overlays, and high-resolution replacements.
- **Web integration:** native control semantics, keyboard navigation, TypeScript declarations, and server rendering with client-side hydration.

MCGUI provides UI and optional inventory state helpers—not a game engine. Your application owns recipes, smelting, trade payments, stock, persistence, and world behavior.

## Packages

| Package | Purpose |
| --- | --- |
| [`@mcgui/react`](packages/react) | React components, provider, item rendering, and inventory hooks |
| [`@mcgui/assets`](packages/assets) | Offline extraction CLI and programmatic asset tools |
| [`@mcgui/core`](packages/core) | Manifest validation, geometry, text metrics, and immutable inventory operations |

Packages use ESM and include TypeScript declarations. The stylesheet is an explicit import; the library does not apply a global CSS reset.

## Try it locally

### Requirements

- Node.js **22.18+** and npm
- A local **Minecraft Java 26.2** installation
- **Java 25+** for optional item-catalogue extraction; GUI-only extraction does not require Java

```sh
git clone https://github.com/zephrynis/mcgui.git
cd mcgui
npm ci
npm run build

# Find installed versions, then extract GUI assets and item icons.
npm run assets -- list
npm run assets -- extract --version 26.2 --items --out apps/storybook/public/mcgui

# Generate the local replacement-pack example and start Storybook.
npm run prepare:demo-pack
npm run dev
```

Open **http://127.0.0.1:5173/**. Browse individual components or open **Examples → Inventory workbench → Interactive** for shared inventories, item movement, and creative search. Storybook Controls and toolbar options let you change props, GUI scale, and asset bundles.

Standard Minecraft and Prism Launcher installations are detected automatically. If discovery is ambiguous, select the client explicitly:

```sh
npm run assets -- extract \
  --version 26.2 \
  --client-jar /path/to/minecraft-26.2-client.jar \
  --items \
  --java /path/to/java \
  --out apps/storybook/public/mcgui
```

Custom launcher setups can use `--minecraft-dir`, `--version-metadata`, and `--libraries`. The demo-pack script accepts `MCGUI_CLIENT_JAR` and `MCGUI_JAVA` environment variables. See the [asset tool documentation](packages/assets/README.md) for extraction details.

## Use in an application

Install the packages from npm using the commands above. The [Vite and Next.js examples](examples/README.md) show complete consumers and include a development script that installs and tests local package tarballs.

Extract an asset bundle into your application's public directory. Load its `manifest.json`, validate it with `parseManifest` from `@mcgui/core`, and pass it to the provider. `baseUrl` points to the directory containing the manifest and its `files/` directory.

```tsx
'use client';

import { useState } from 'react';
import {
  Button,
  Checkbox,
  MinecraftProvider,
  Slider,
  type AssetManifest,
} from '@mcgui/react';
import '@mcgui/react/styles.css';

export function Settings({ assets }: { assets: AssetManifest }) {
  const [subtitles, setSubtitles] = useState(false);
  const [volume, setVolume] = useState(50);

  return (
    <MinecraftProvider assets={assets} baseUrl="/mcgui" scale={2}>
      <Checkbox checked={subtitles} onCheckedChange={setSubtitles}>
        Show Subtitles
      </Checkbox>
      <Slider label="Volume" value={volume} onValueChange={setVolume} />
      <Button onClick={() => setVolume(50)}>Reset Volume</Button>
    </MinecraftProvider>
  );
}
```

Dimensions use logical GUI units; the provider scales the rendered interface. Import the stylesheet once in your application entry point or root layout. With React Server Components, keep interactive components behind a client boundary and validate manifests in server code with `@mcgui/core`.

For movable inventories, use `useInventory` and bind its `getSlotProps` to a screen's slots. Render its `cursor` once inside the provider. Use one hook for screens that share a carried stack, and configure acceptance rules and transfer destinations in your application.

See the [React API and inventory examples](packages/react/README.md) for component usage, extracted item catalogues, and customization.

## Resource packs and fonts

Pass `--pack` more than once to layer resource packs. Later packs take priority; ZIP packs need `pack.mcmeta` at the root. The supported game profile uses **resource-pack format 88.0**.

```sh
npm run assets -- extract \
  --version 26.2 \
  --pack /path/to/base-pack.zip \
  --pack /path/to/overrides-folder \
  --out ./public/mcgui

npm run assets -- validate ./public/mcgui
```

GUI-only extraction includes printable ASCII by default. Use `--characters` to select a different character set; it replaces the default set rather than extending it. Bitmap, space, reference, and Unihex/Unifont providers are supported for requested characters. Characters absent from the extracted bundle render as `?`. Re-extract when adding glyphs or components that need new assets.

Extraction runs offline without downloading the game or reading account credentials. Output contains a validated manifest, diagnostics, and content-hashed images. Identical effective inputs produce identical bundles. The tool validates resource paths and refuses to overwrite nonempty directories it does not manage.

## Compatibility and limitations

- **Game support:** Java 26.2 only. Other releases, Bedrock, and mod-specific GUI extensions are not supported.
- **React support:** React 19. Production Vite and Next.js consumers are tested from package tarballs, including SSR/hydration where applicable.
- **Rendering accuracy:** browser checks compare against extracted images and metrics, not in-game screenshots. Exact in-game pixel parity and other browser engines remain unverified.
- **Item previews:** icons are baked snapshots. Animated textures use a static frame; clocks and compasses use fixed previews. Personalized skins and live item-model animation are not supported.
- **Fonts and packs:** required TTF providers, animated GUI resources, resource filters, and unsupported GUI atlas changes fail explicitly. Bidirectional shaping, obfuscated text, and runtime glyph loading are not implemented.
- **Interactions:** world dropping, Shift-double-click mass transfer, specialized bundle behavior, and touch drag distribution are not implemented. Screen presets are inline components, not modal dialogs.
- **Other UI:** general-purpose text fields, player rendering, and sounds are not implemented. The canvas inventory renderer is experimental; HTML/SVG remains the default.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run check:packages
npm run check:consumers
```

Unit and integration tests generate original synthetic fixtures and do not require Minecraft. Consumer checks install built tarballs in temporary Vite and Next.js projects, build them, and exercise them in Chrome; npm registry access and a working Chrome installation are required. Set `MCGUI_CHROME` if Chrome is not detected automatically.

With Storybook running and both local asset bundles prepared, run the browser suites:

```sh
npm run test:browser
npm run test:inventory-browser
npm run test:item-movement-browser
npm run test:creative-browser
npm run test:canvas-browser
npm run test:controls-browser
npm run test:slider-browser
npm run test:storybook-browser
```

`npm run build` also writes a static Storybook to `apps/storybook/dist`. **That build copies your local assets; it is not an asset-free public demo.**

### Publishing

CI runs on pushes to `main` and pull requests: TypeScript, tests, builds, package-content inspection, and Vite/Next.js production consumers using original synthetic assets. Local Minecraft bundles and the asset-dependent Storybook browser suites are not uploaded or run in CI.

The [publish workflow](.github/workflows/publish.yml) runs those same checks before publishing stable release tags such as `v0.1.1`. It uses npm trusted publishing with provenance, not a stored npm token. All three package versions and the internal core dependencies must match the tag. Already published versions are skipped when rerunning a partially completed release.

**One-time npm setup:** for each of [`@mcgui/core`](https://www.npmjs.com/package/@mcgui/core), [`@mcgui/assets`](https://www.npmjs.com/package/@mcgui/assets), and [`@mcgui/react`](https://www.npmjs.com/package/@mcgui/react), open **Settings → Trusted publishing**, choose **GitHub Actions**, and enter:

- Organization or user: `zephrynis`
- Repository: `mcgui`
- Workflow filename: `publish.yml` (filename only)
- Environment: leave blank
- Allowed actions: enable direct **`npm publish`**, not only staged publishing

npm currently requires the first successful trusted publish within two days of configuring it; if the configuration expires, recreate it before releasing. See [npm's trusted publishing guide](https://docs.npmjs.com/trusted-publishers).

**For a new release:** update the version in all three `packages/*/package.json` files, update the `@mcgui/core` dependencies in assets, React, and Storybook to that same version, and refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`. Run the checks, commit and push the changes to `main`, then push a matching tag:

```sh
# Example for a future 0.1.1 release, after updating and committing versions:
git tag v0.1.1
git push origin v0.1.1
```

Pushing the tag starts a live npm release. Do not reuse `v0.1.0`: that npm version already exists. Repository, homepage, and issue links added after `0.1.0` appear on npm with the next published versions; published metadata cannot be replaced in place. The workspace root and Storybook remain private. Do not include local extracted bundles or the Storybook build in a release.

## License and assets

Project code is available under the [MIT License](LICENSE).

**No Minecraft textures, fonts, sounds, or game binaries are bundled in the library packages.** The code license does not cover Minecraft assets or third-party resource packs. Local extraction does not grant permission to redistribute those assets: hosting an extracted bundle serves copies to your visitors. Assess your deployment against the [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines), applicable legal exceptions, and resource-pack licenses. A public demo needs original or independently licensed artwork, fonts, and items.

MCGUI is an unofficial project, not approved by or associated with Mojang or Microsoft. Minecraft assets remain their respective owners' property.
