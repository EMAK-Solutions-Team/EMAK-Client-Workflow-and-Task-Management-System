CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('Manager', 'Team Member', 'Client')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password_hash, role)
VALUES
  ('Kasper Luboinski', 'manager@emak.ca', '$2a$10$VVEVu/dcviFeYLTmStDsuuWz7yxzXOXZSXfwCN9KGVQ2PAF/w2b1q', 'Manager'),
  ('Mehak Gill', 'member@emak.ca', '$2a$10$zx.crgyUfy9tKStyA8V5peloHCsvhjgr9FwGpE5mYx.Ro9Jppzb1C', 'Team Member'),
  ('Emilio Conde', 'client@emak.ca', '$2a$10$3QVvW2VZOL8XAjO4eoH.t.bpauet7dlCnLCYsjtDXkpTweDVIxvqK', 'Client')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  target_completion_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Planning'
    CHECK (status IN ('Planning', 'Active', 'On Hold', 'Completed')),
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (target_completion_date >= start_date)
);

CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Completed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
