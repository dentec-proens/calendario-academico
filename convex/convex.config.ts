import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import { defineApp } from 'convex/server';
import presence from '@convex-dev/presence/convex.config.js';
import migrations from '@convex-dev/migrations/convex.config.js';

const app = defineApp();
app.use(presence);
app.use(rateLimiter);
app.use(migrations);
export default app;
