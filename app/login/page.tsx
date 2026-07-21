import { login } from './actions';
import LoginExperience from '@/components/login/LoginExperience';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const hasError = searchParams.error === '1';

  return <LoginExperience loginAction={login} hasError={hasError} />;
}
