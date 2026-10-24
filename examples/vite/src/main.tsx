import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseManifest } from '@mcgui/core';
import { Controls } from '../shared/Controls';
import '@mcgui/react/styles.css';
import '../shared/style.css';

const response = await fetch('/mcgui/manifest.json');
if (!response.ok) throw new Error('Extract assets into public/mcgui first.');
const assets = parseManifest(await response.json());
createRoot(document.getElementById('root')!).render(<StrictMode><Controls assets={assets} /></StrictMode>);
