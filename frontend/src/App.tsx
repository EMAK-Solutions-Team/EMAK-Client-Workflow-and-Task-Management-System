import { FormEvent, ReactNode, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { rolePath, useAuth } from './auth';
import ProjectsSection from './ProjectsSection';
import { UserRole } from './types';

function ProtectedRoute({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <main className="page">Loading...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={rolePath(user.role)} replace />;
  return children;
}

function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <main className="page">Loading...</main>;
  if (user) return <Navigate to={rolePath(user.role)} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const authenticatedUser = await login(email, password);
      navigate(rolePath(authenticatedUser.role), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>EMAK Workflow</h1>
        <p>Sign in to continue.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function DashboardPage({ role }: { role: UserRole }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="page">
      <section className="panel wide">
        <h1>{role} Dashboard</h1>
        <p>Signed in as {user?.name}.</p>
        <button type="button" onClick={handleLogout}>Logout</button>
        <ProjectsSection />
      </section>
    </main>
  );
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <main className="page">Loading...</main>;
  return <Navigate to={user ? rolePath(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/manager"
        element={
          <ProtectedRoute role="Manager">
            <DashboardPage role="Manager" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-member"
        element={
          <ProtectedRoute role="Team Member">
            <DashboardPage role="Team Member" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client"
        element={
          <ProtectedRoute role="Client">
            <DashboardPage role="Client" />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  );
}
