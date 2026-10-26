import { ConvexReactClient } from 'convex/react';
import { api } from '../../../convex/_generated/api.js';

const url: string | undefined = import.meta.env.VITE_CONVEX_URL;
if (!url) throw new Error('Configure VITE_CONVEX_URL para conectar o portal ao Convex.');
export const convex = new ConvexReactClient(url);
export const functions = api;
