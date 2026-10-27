import { pool } from './db';
import { JWTPayload, Milestone, Project, ProjectInput } from './types';

let nextProjectId = 1;
let nextMilestoneId = 1;
let memoryProjects: Project[] = [];

const projectSelect = `
  SELECT
    p.id,
    p.name,
    p.client_id AS "clientId",
    c.name AS "clientName",
    p.start_date::text AS "startDate",
    p.target_completion_date::text AS "targetCompletionDate",
    p.status,
    p.created_by AS "createdBy",
    p.created_at::text AS "createdAt",
    p.updated_at::text AS "updatedAt",
    COALESCE(
      json_agg(
        json_build_object(
          'id', m.id,
          'title', m.title,
          'dueDate', m.due_date,
          'status', m.status
        ) ORDER BY m.id
      ) FILTER (WHERE m.id IS NOT NULL),
      '[]'::json
    ) AS milestones
  FROM projects p
  JOIN users c ON c.id = p.client_id
  LEFT JOIN milestones m ON m.project_id = p.id
`;

function copyProject(project: Project): Project {
  return {
    ...project,
    milestones: project.milestones.map((milestone) => ({ ...milestone }))
  };
}

export async function listProjectsForUser(user: JWTPayload): Promise<Project[]> {
  if (!process.env.DATABASE_URL) {
    return memoryProjects
      .filter((project) => user.role !== 'Client' || project.clientId === user.id)
      .map(copyProject);
  }

  const clientId = user.role === 'Client' ? user.id : null;
  const result = await pool.query<Project>(
    `${projectSelect}
     WHERE ($1::integer IS NULL OR p.client_id = $1)
     GROUP BY p.id, c.name
     ORDER BY p.created_at DESC`,
    [clientId]
  );
  return result.rows;
}

export async function getProjectForUser(id: number, user: JWTPayload): Promise<Project | null> {
  if (!process.env.DATABASE_URL) {
    const project = memoryProjects.find(
      (candidate) => candidate.id === id && (user.role !== 'Client' || candidate.clientId === user.id)
    );
    return project ? copyProject(project) : null;
  }

  const clientId = user.role === 'Client' ? user.id : null;
  const result = await pool.query<Project>(
    `${projectSelect}
     WHERE p.id = $1 AND ($2::integer IS NULL OR p.client_id = $2)
     GROUP BY p.id, c.name`,
    [id, clientId]
  );
  return result.rows[0] || null;
}

export async function createProject(input: ProjectInput, createdBy: number): Promise<Project> {
  if (!process.env.DATABASE_URL) {
    const now = new Date().toISOString();
    const project: Project = {
      ...input,
      id: nextProjectId++,
      clientName: 'Emilio Conde',
      createdBy,
      createdAt: now,
      updatedAt: now,
      milestones: input.milestones.map((milestone) => ({
        ...milestone,
        id: nextMilestoneId++,
        status: 'Pending'
      }))
    };
    memoryProjects.push(project);
    return copyProject(project);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(
      `INSERT INTO projects
        (name, client_id, start_date, target_completion_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.name, input.clientId, input.startDate, input.targetCompletionDate, input.status, createdBy]
    );
    const projectId = result.rows[0].id;

    for (const milestone of input.milestones) {
      await client.query(
        `INSERT INTO milestones (project_id, title, due_date)
         VALUES ($1, $2, $3)`,
        [projectId, milestone.title, milestone.dueDate]
      );
    }

    await client.query('COMMIT');
    const created = await getProjectForUser(projectId, {
      id: createdBy,
      name: '',
      email: '',
      role: 'Manager'
    });
    if (!created) throw new Error('Created project could not be loaded.');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProject(id: number, input: ProjectInput): Promise<Project | null> {
  if (!process.env.DATABASE_URL) {
    const index = memoryProjects.findIndex((project) => project.id === id);
    if (index === -1) return null;
    const existing = memoryProjects[index];
    const updated: Project = {
      ...existing,
      ...input,
      clientName: input.clientId === 3 ? 'Emilio Conde' : existing.clientName,
      updatedAt: new Date().toISOString(),
      milestones: input.milestones.map((milestone) => ({
        ...milestone,
        id: nextMilestoneId++,
        status: 'Pending'
      }))
    };
    memoryProjects[index] = updated;
    return copyProject(updated);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE projects
       SET name = $1,
           client_id = $2,
           start_date = $3,
           target_completion_date = $4,
           status = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [input.name, input.clientId, input.startDate, input.targetCompletionDate, input.status, id]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('DELETE FROM milestones WHERE project_id = $1', [id]);
    for (const milestone of input.milestones) {
      await client.query(
        `INSERT INTO milestones (project_id, title, due_date)
         VALUES ($1, $2, $3)`,
        [id, milestone.title, milestone.dueDate]
      );
    }

    await client.query('COMMIT');
    return getProjectForUser(id, { id: 0, name: '', email: '', role: 'Manager' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteProject(id: number): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    const originalLength = memoryProjects.length;
    memoryProjects = memoryProjects.filter((project) => project.id !== id);
    return memoryProjects.length !== originalLength;
  }

  const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  return (result.rowCount || 0) > 0;
}
