-- One staff phone may now be a tenant-scoped login at multiple hotels.
-- Drop the global unique on admin_users.username; enforce per-hotel uniqueness.
DROP INDEX "admin_users_username_key";
CREATE UNIQUE INDEX "admin_users_username_hotel_id_key" ON "admin_users"("username", "hotel_id");

-- A single login (AdminUser) may now be linked to staff rows in several hotels.
DROP INDEX "staff_users_admin_user_id_key";
CREATE INDEX "staff_users_admin_user_id_idx" ON "staff_users"("admin_user_id");
