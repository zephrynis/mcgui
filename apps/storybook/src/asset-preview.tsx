import { useEffect, useState, type ReactNode } from 'react';
import { MinecraftProvider, parseManifest, type AssetManifest } from '@mcgui/react';

export function AssetPreview({ bundle, scale, children }: { bundle: string; scale: number; children: ReactNode }) {
  const [loaded, setLoaded] = useState<{ bundle: string; manifest: AssetManifest } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`/${bundle}/manifest.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(`Missing local bundle: ${bundle}`);
      return parseManifest(await response.json());
    }).then(manifest => { if (!controller.signal.aborted) setLoaded({ bundle, manifest }); }).catch(error => {
      if (!controller.signal.aborted) setError(String(error.message));
    });
    return () => controller.abort();
  }, [bundle]);
  if (error) return <div role="alert" className="asset-message"><p>{error}. Extract assets locally before using the stories.</p><pre>npm run assets -- extract --version 26.2 --items --out apps/storybook/public/mcgui</pre><p>For the test pack, run <code>npm run prepare:demo-pack</code>. Then reload this story.</p></div>;
  if (!loaded || loaded.bundle !== bundle) return <p role="status" className="asset-message">Loading local assets…</p>;
  return <MinecraftProvider assets={loaded.manifest} baseUrl={`/${bundle}`} scale={scale}><div className="story-viewport">{children}</div></MinecraftProvider>;
}
