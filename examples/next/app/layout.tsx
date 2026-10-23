import type { ReactNode } from 'react';
import '@mcgui/react/styles.css';
import '../shared/style.css';

export const metadata = { title: 'MCUI Next.js consumer', icons: { icon: '/favicon.svg' } };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
