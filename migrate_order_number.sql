-- Migration: Add order_number to order_details and order_payments
-- Run this once against your PostgreSQL database

-- 1. Add columns (safe: no error if they already exist via IF NOT EXISTS)
ALTER TABLE order_details
    ADD COLUMN IF NOT EXISTS order_number INTEGER;

ALTER TABLE order_payments
    ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- 2. Backfill from orders table
UPDATE order_details od
SET order_number = o.order_number
FROM orders o
WHERE od.order_id = o.id
  AND o.order_number IS NOT NULL;

UPDATE order_payments op
SET order_number = o.order_number
FROM orders o
WHERE op.order_id = o.id
  AND o.order_number IS NOT NULL;

-- 3. Verify backfill (optional check)
SELECT
    'order_details' AS tabla,
    COUNT(*) AS total,
    COUNT(order_number) AS con_numero,
    COUNT(*) - COUNT(order_number) AS sin_numero
FROM order_details
UNION ALL
SELECT
    'order_payments',
    COUNT(*),
    COUNT(order_number),
    COUNT(*) - COUNT(order_number)
FROM order_payments;
