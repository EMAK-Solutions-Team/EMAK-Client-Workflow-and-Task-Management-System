import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { findUserByEmail } from './db';
import { generateToken, authenticateJWT, AuthenticatedRequest } from './authMiddleware';
import { LoginRequestBody, LoginResponseBody, JWTPayload } from './types';

export const authRouter = Router();

export async function authenticateUser(
  email?: string,
  password?: string
): Promise<LoginResponseBody> {
  if (!email || !password) {
    return {
      success: false,
      error: 'Please provide both email and password.'
    };
  }

  const userRecord = await findUserByEmail(email);
  if (!userRecord) {
    return {
      success: false,
      error: 'Invalid email or password. Access blocked.'
    };
  }

  const passwordMatches = await bcrypt.compare(password, userRecord.password_hash);
  if (!passwordMatches) {
    return {
      success: false,
      error: 'Invalid email or password. Access blocked.'
    };
  }

  const payload: JWTPayload = {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    role: userRecord.role
  };

  const token = generateToken(payload);

  return {
    success: true,
    token,
    user: payload
  };
}

authRouter.post('/login', async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
  const { email, password } = req.body;
  const result = await authenticateUser(email, password);

  if (!result.success) {
    res.status(401).json(result);
    return;
  }

  res.status(200).json(result);
});

authRouter.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'User logged out successfully.'
  });
});