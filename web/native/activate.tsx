import { mountNativePage } from './Page.tsx';

mountNativePage(() => import('../activate.ts'), false, 'activate.html');
