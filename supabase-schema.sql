-- ============================================================
-- TACTICAL OPS - Supabase Schema
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  password_hash TEXT,
  phone TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  blocked BOOLEAN DEFAULT FALSE,
  linked_soldier_id TEXT,
  invite_registered BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Soldiers table
CREATE TABLE IF NOT EXISTS soldiers (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'חייל',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  certifications JSONB DEFAULT '[]'::jsonb
);

-- Missions table
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  priority TEXT DEFAULT 'normal',
  start_date TEXT,
  start_time TEXT DEFAULT '06:00',
  end_date TEXT,
  end_time TEXT DEFAULT '06:00',
  num_shifts INTEGER DEFAULT 1,
  soldiers_per_shift INTEGER DEFAULT 2,
  min_special_roles INTEGER DEFAULT 0,
  mandatory_roles JSONB DEFAULT '[]'::jsonb,
  required_certs JSONB DEFAULT '[]'::jsonb,
  count_mission BOOLEAN DEFAULT TRUE,
  shifts JSONB DEFAULT '[]'::jsonb
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  soldier_id TEXT NOT NULL,
  status TEXT DEFAULT 'unknown',
  start_time TEXT DEFAULT '10:00',
  end_time TEXT DEFAULT '10:00',
  note TEXT DEFAULT '',
  PRIMARY KEY (deployment_id, date, soldier_id)
);

-- Assignments table (data stored as JSONB due to complex nested structure)
CREATE TABLE IF NOT EXISTS assignments (
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (deployment_id, date)
);

-- Disable RLS for all tables (app handles auth internally)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE deployments DISABLE ROW LEVEL SECURITY;
ALTER TABLE soldiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE missions DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_soldiers_deployment ON soldiers(deployment_id);
CREATE INDEX IF NOT EXISTS idx_missions_deployment ON missions(deployment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_deployment_date ON attendance(deployment_id, date);
CREATE INDEX IF NOT EXISTS idx_assignments_deployment ON assignments(deployment_id);
