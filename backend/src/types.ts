export type UserRole = 'Manager' | 'Team Member' | 'Client';
export interface UserRecord {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
}
export interface JWTPayload {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}
export interface LoginRequestBody {
  email?: string;
  password?: string;
}
export interface LoginResponseBody {
  success: boolean;
  token?: string;
  user?: JWTPayload;
  error?: string;
}

export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';
export type MilestoneStatus = 'Pending' | 'Completed';

export interface MilestoneInput {
  title: string;
  dueDate: string | null;
}

export interface Milestone extends MilestoneInput {
  id: number;
  status: MilestoneStatus;
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
