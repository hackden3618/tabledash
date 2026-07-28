-- Add platform_admin_created to EventName enum
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'platform_admin_created';
