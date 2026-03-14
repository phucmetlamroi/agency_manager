-- Drop legacy plaintext password storage if it still exists
ALTER TABLE "User" DROP COLUMN IF EXISTS "plainPassword";
