-- Add updatedAt and isEdited fields to posts table
ALTER TABLE "posts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "posts" ADD COLUMN "is_edited" BOOLEAN NOT NULL DEFAULT false;
