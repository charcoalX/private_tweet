-- DropForeignKey
ALTER TABLE "invite_codes" DROP CONSTRAINT "invite_codes_created_by_fkey";

-- AlterTable
ALTER TABLE "invite_codes" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
