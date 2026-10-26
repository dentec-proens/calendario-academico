import { mountNativePage } from '../../web/native/Page.tsx';

if (location.pathname === '/ativar-conta') {
  mountNativePage(() => import('../../web/activate.ts'), false, 'activate.html');
} else if (location.pathname === '/recuperar-senha') {
  mountNativePage(() => import('../../web/recover.ts'), false, 'recover.html');
} else {
  mountNativePage(async () => {
    throw new Error('O conteúdo protegido não deve carregar sem autenticação.');
  });
}
