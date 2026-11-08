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

The US-04 task tests require PGlite, which teammates must install locally because it is not included in the committed dependency files. From the repository root, run:

```bash
cd backend
npm ci
npm install --no-save --package-lock=false @electric-sql/pglite@0.5.15
npm test
```

The PGlite install command does not change `package.json` or `package-lock.json`. Repeat it after running `npm ci`, which removes dependencies not listed in those files.

Task tests use an isolated in-memory PostgreSQL database and do not require a running PostgreSQL server.

The test suite builds the backend and verifies authentication, role authorization, logout, project validation, Manager CRUD operations, read-only project access, assigned-task isolation, status/progress updates, and read-only Manager task visibility.

## Main API routes

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects` (Manager)
- `PUT /api/projects/:id` (Manager)
- `DELETE /api/projects/:id` (Manager)
- `GET /api/projects/clients` (Manager)
- `GET /api/health`

## Planned features

- Task assignment and progress tracking
- Comments and document links
- Deadline notifications
- Project reports

<sub>Team members: <span title="Emilio Conde Ludena">Emilio</span>, <span title="Mehak Gill">Mehak</span>, <span title="Arnav Chachra">Arnav</span>, <span title="Kasper Luboinski">Kasper</span></sub>
<br><sub><sup>*Hover for full name*</sup></sub>
