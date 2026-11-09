import type {
  AuthSession,
  AuthUser,
  ClientSummary,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TeamMemberSummary
} from './types';

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


async function authorizedRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error(
      `API error: ${response.status} ${response.statusText} at ${url}. Expected JSON but received ${contentType || 'unknown content type'}.`
    );
  }

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }

  return body as T;
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

export async function listTeamMembersRequest(
  token: string
): Promise<TeamMemberSummary[]> {
  const body = await authorizedRequest<{
    members?: TeamMemberSummary[];
    users?: TeamMemberSummary[];
  }>('/users/members', token);

  return body.members || body.users || [];
}

export async function listProjectTasksRequest(
  token: string,
  projectId: number
): Promise<Task[]> {
  const body = await authorizedRequest<{ tasks: Task[] }>(
    `/projects/${projectId}/tasks`,
    token
  );

  return body.tasks;
}

export async function createTaskRequest(
  token: string,
  input: TaskInput
): Promise<Task> {
  const body = await authorizedRequest<{ task: Task }>(
    '/tasks',
    token,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );

  return body.task;
}

