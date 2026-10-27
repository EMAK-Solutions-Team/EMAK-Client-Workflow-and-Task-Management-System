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