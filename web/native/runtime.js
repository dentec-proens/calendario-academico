import { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api.js';

export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
export const functions = api;
