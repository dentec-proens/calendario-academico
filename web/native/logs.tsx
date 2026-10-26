import { mountNativePage } from './Page.tsx';

mountNativePage(() => import('../logs.ts'), true, 'logs.html');
