import { build } from 'vite';
import { writePrintAssets } from './print-assets.ts';

await writePrintAssets();
await build();
