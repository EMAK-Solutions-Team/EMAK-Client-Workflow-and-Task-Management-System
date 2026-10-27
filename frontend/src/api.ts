import { AuthSession, AuthUser, ClientSummary, Project, ProjectInput } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function loginRequest(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json();

  if (!response.ok || !body.token || !body.user) {
    throw new Error(body.error || 'Login failed.');
  }

  return { token: body.token, user: body.user };
}

export async function currentUserRequest(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();

  if (!response.ok || !body.user) {
    throw new Error(body.error || 'Session expired.');
  }

  return body.user;
}

export async function logoutRequest(token: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function authorizedRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Project request failed.');
  return body;
}

export async function listProjectsRequest(token: string): Promise<Project[]> {
  const body = await authorizedRequest<{ projects: Project[] }>('/projects', token);
  return body.projects;
}

export async function listClientsRequest(token: string): Promise<ClientSummary[]> {
  const body = await authorizedRequest<{ clients: ClientSummary[] }>('/projects/clients', token);
  return body.clients;
}

export async function createProjectRequest(token: string, input: ProjectInput): Promise<Project> {
  const body = await authorizedRequest<{ project: Project }>('/projects', token, {
    method: 'POST',
    body: JSON.stringify(input)
  });
  return body.project;
}

export async function updateProjectRequest(token: string, id: number, input: ProjectInput): Promise<Project> {
  const body = await authorizedRequest<{ project: Project }>(`/projects/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(input)
  });
  return body.project;
}

export async function deleteProjectRequest(token: string, id: number): Promise<void> {
  await authorizedRequest<void>(`/projects/${id}`, token, { method: 'DELETE' });
}
