import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('expired-auth-cleanup', { minutes: 15 }, internal.access.cleanup.sweep, {});
crons.daily('client-errors-cleanup', { hourUTC: 6, minuteUTC: 0 }, internal.clientErrors.sweep, {});
export default crons;
