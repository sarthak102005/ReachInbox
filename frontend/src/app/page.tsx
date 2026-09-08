import { redirect } from 'next/navigation';

// Root page redirects to /dashboard (middleware or server-side guard
// will redirect unauthenticated users to /login)
export default function RootPage() {
  redirect('/dashboard');
}
