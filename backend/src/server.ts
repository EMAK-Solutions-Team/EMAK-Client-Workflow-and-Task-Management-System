import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './authRoutes';
import { projectRouter } from './projectRoutes';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
