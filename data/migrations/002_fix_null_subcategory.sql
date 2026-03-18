-- Migration: Fix subcategory stored as "null" string
-- Date: 2026-02-22

-- Fix any existing "null" strings
UPDATE clothing_items SET subcategory = NULL WHERE subcategory = 'null';

-- Verify no more "null" strings exist
-- This will fail if there are any, acting as a safety check
-- ALTER TABLE clothing_items ADD CONSTRAINT chk_subcategory_not_null_string CHECK (subcategory != 'null');
