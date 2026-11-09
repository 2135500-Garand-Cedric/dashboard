-- Commit these enum additions before using NEW as a default in the next migration.
-- Keep all existing enum values (including any custom database values).
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'BACKLOG';
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
