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