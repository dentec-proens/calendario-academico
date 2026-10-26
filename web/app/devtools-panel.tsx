import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { useRouter } from '@tanstack/react-router';

export default function DevelopmentPanel() {
  const router = useRouter();
  return (
    <TanStackDevtools
      config={{ position: 'bottom-right', defaultOpen: false }}
      plugins={[
        {
          id: 'router',
          name: 'TanStack Router',
          render: <TanStackRouterDevtoolsPanel router={router} />,
        },
        formDevtoolsPlugin(),
      ]}
    />
  );
}
