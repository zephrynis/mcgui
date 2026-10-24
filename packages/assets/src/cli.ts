#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { extractAssets, listInstallations, validateBundle } from './index.js';

const help = `MCGUI assets — Minecraft Java 26.2\n\nCommands:\n  mcgui-assets list [--minecraft-dir <path>]\n  mcgui-assets extract --version 26.2 --out <directory> [options]\n  mcgui-assets validate <directory>\n\nExtraction options:\n  --client-jar <file>       Explicit local client JAR (custom launchers)\n  --minecraft-dir <path>    Minecraft or Prism Launcher root\n  --pack <zip-or-folder>    Repeatable; later packs take priority\n  --characters <text>      Glyphs to include (default: printable ASCII)\n  --items                   Include catalogue and static icons\n  --java <executable>       Java 25+ for item export (default: java)\n  --version-metadata <json> Installed version metadata for custom launchers\n  --libraries <directory>   Installed Maven dependencies\n  --catalogue-file <json>   Reuse a prior catalogue export without Java\n\nReads local files only. No game downloads or account access.\n`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'string' }, out: { type: 'string' },
    'client-jar': { type: 'string' }, 'minecraft-dir': { type: 'string' }, pack: { type: 'string', multiple: true }, characters: { type: 'string' },
    items: { type: 'boolean' }, java: { type: 'string' }, libraries: { type: 'string' }, 'version-metadata': { type: 'string' }, 'catalogue-file': { type: 'string' },
  } });
  const [command, directory] = positionals;
  if (values.help || !command) console.log(help);
  else if (command === 'list') console.log(JSON.stringify(await listInstallations(values['minecraft-dir']), null, 2));
  else if (command === 'validate') {
    if (!directory || positionals.length !== 2) throw new Error('Usage: mcgui-assets validate <directory>');
    const manifest = await validateBundle(directory);
    console.log(`Valid Java ${manifest.minecraft.version} bundle: ${Object.keys(manifest.font.glyphs).length} glyphs, ${Object.keys(manifest.sprites).length} sprites.`);
  } else if (command === 'extract') {
    if (values.version !== '26.2' || !values.out || positionals.length !== 1) throw new Error('Use extract --version 26.2 --out <directory>.');
    let jar = values['client-jar'];
    if (!jar) {
      const matches = (await listInstallations(values['minecraft-dir'])).filter(item => item.version === values.version);
      if (matches.length !== 1) throw new Error(matches.length ? 'Multiple matching installations. Select one with --client-jar.' : 'Java 26.2 was not found. Launch it once or provide --client-jar.');
      jar = matches[0]!.clientJar;
    }
    const manifest = await extractAssets({ clientJar: jar, version: values.version, out: values.out, packs: values.pack, characters: values.characters,
      items: values.items, java: values.java, libraries: values.libraries, versionMetadata: values['version-metadata'], catalogueFile: values['catalogue-file'] });
    console.log(`Extracted Java 26.2: ${Object.keys(manifest.sprites).length} sprites, ${Object.keys(manifest.font.glyphs).length} glyphs → ${values.out}`);
    for (const warning of manifest.warnings) console.log(`Note: ${warning}`);
  } else throw new Error(`Unknown command: ${command}\n${help}`);
} catch (error) { console.error(`mcgui-assets: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
