# EMAK Client Workflow and Task Management System

A web-based project and task management platform designed for an architectural firm.

## Current functionality

- JWT login for Manager, Team Member, and Client users
- Persistent browser sessions validated through the API
- Protected role-based dashboard routes
- Logout and invalid-login handling
- PostgreSQL user storage with a local fallback for development
- Manager project creation, editing, listing, and deletion
- Project milestones, dates, clients, and status tracking
- Read-only Team Member project access and client-filtered access
- Manager-only project reports with milestones, tasks, and progress summaries
- Automated authentication, authorization, and project tests

## Project structure

- `backend`: Express, TypeScript, PostgreSQL, and JWT authentication
- `frontend`: React, TypeScript, Vite, and role-based routing

## Local setup

Requires Node.js 18 or newer and npm.

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:schema
npm run dev
```

Set `DATABASE_URL` and `JWT_SECRET` in `backend/.env`. The API runs at `http://localhost:4000`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Verification

PGlite is included as a backend development dependency so the PostgreSQL task tests run without a live test database. From the repository root, run:

```bash
cd backend
npm ci
npm test
```

Task tests use an isolated in-memory PostgreSQL database and do not require a running PostgreSQL server.

The test suite builds the backend and verifies authentication, role authorization, logout, project validation, Manager CRUD operations, read-only project access, assigned-task isolation, status/progress updates, read-only Manager task visibility, and project reports in both storage modes.

## Main API routes

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/report` (Manager)
- `POST /api/projects` (Manager)
- `PUT /api/projects/:id` (Manager)
- `DELETE /api/projects/:id` (Manager)
- `GET /api/projects/clients` (Manager)
- `GET /api/health`

## Project report

Managers can request `GET /api/projects/:id/report` with an `Authorization: Bearer <token>` header. The read-only endpoint returns:

```json
{
  "success": true,
  "report": {
    "project": {},
    "tasks": [],
    "summary": {
      "totalTasks": 0,
      "completedTasks": 0,
      "completionPercentage": 0,
      "pendingTasks": 0,
      "overdueTasks": 0,
      "averageProgress": 0,
      "tasksByStatus": {
        "Pending": 0,
        "To Do": 0,
        "In Progress": 0,
        "Review": 0,
        "Completed": 0
      }
    }
  }
}
```

`project` contains the existing project details, including client, dates, status, and milestones. `tasks` contains all tasks belonging to that project, across all assignees. The summary includes:

- `totalTasks`: all tasks in the project.
- `completedTasks`: tasks whose status is `Completed`.
- `completionPercentage`: `completedTasks / totalTasks * 100`, rounded to two decimal places, based on task status. For example, 2 completed tasks out of 6 returns `33.33`.
- `pendingTasks`: all unfinished tasks (`Pending`, `To Do`, `In Progress`, or `Review`), regardless of progress percentage.
- `overdueTasks`: unfinished tasks with a due date before today's date in `America/Toronto`. Tasks due today, tasks without a due date, and completed tasks are excluded. Overdue tasks are also included in `pendingTasks`.
- `averageProgress`: the arithmetic mean of task progress percentages, rounded to two decimal places.
- `tasksByStatus`: counts for each task status.

Empty projects return zero counts, zero completion percentage, and zero average progress.

Missing or invalid tokens return `401`; Team Members and Clients receive `403`. Invalid project IDs return `400` (IDs must be integers from 1 to 2147483647), and unknown projects return `404`.

## Planned features

- Task assignment and progress tracking
- Comments and document links
- Deadline notifications

<sub>Team members: <span title="Emilio Conde Ludena">Emilio</span>, <span title="Mehak Gill">Mehak</span>, <span title="Arnav Chachra">Arnav</span>, <span title="Kasper Luboinski">Kasper</span></sub>
<br><sub><sup>*Hover for full name*</sup></sub>
