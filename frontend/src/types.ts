export type UserRole = 'Manager' | 'Team Member' | 'Client';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';

export interface MilestoneInput {
  title: string;
  dueDate: string | null;
}

export interface Milestone extends MilestoneInput {
  id: number;
  status: 'Pending' | 'Completed';
}

export interface ProjectInput {
  name: string;
  clientId: number;
  startDate: string;
  targetCompletionDate: string;
  status: ProjectStatus;
  milestones: MilestoneInput[];
}

export interface Project extends ProjectInput {
  id: number;
  clientName: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  milestones: Milestone[];
}

export interface ClientSummary {
  id: number;
  name: string;
  email: string;
}
