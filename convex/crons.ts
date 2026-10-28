import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('expired-auth-cleanup', { minutes: 15 }, internal.access.cleanup.sweep, {});
export default crons;
