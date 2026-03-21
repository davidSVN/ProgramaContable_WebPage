-- Migration: add unique constraint on tenants.nombre (case-insensitive)
-- Run once against your PostgreSQL database.

-- First, deduplicate if any exist (keeps the one with the lowest id)
-- This is a safety check — if no duplicates exist, nothing is deleted.
DELETE FROM tenants
WHERE id NOT IN (
    SELECT MIN(id)
    FROM tenants
    GROUP BY lower(nombre)
);

-- Add a unique index using lower() for case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_nombre_lower
    ON tenants (lower(nombre));
