import { mountNativePage } from './Page.tsx';

mountNativePage(() => import('../app.ts'), true, 'editor.html');
