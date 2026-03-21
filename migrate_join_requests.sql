-- Migration: Add employee_join_requests table and pending role support
-- Run this against your PostgreSQL database before starting the server.

CREATE TABLE IF NOT EXISTS employee_join_requests (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES app_users(id),
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_employee_join_requests_user_id   ON employee_join_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_employee_join_requests_tenant_id ON employee_join_requests(tenant_id);
CREATE INDEX IF NOT EXISTS ix_employee_join_requests_status    ON employee_join_requests(status);

-- The AppUser.role column already accepts any string, so 'pending' is supported without schema changes.
-- No changes needed to the app_users table.
