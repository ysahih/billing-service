/*
  Warnings:

  - You are about to drop the column `lastPaymentError` on the `Invoice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "lastPaymentError",
ADD COLUMN     "nextPaymentAttempt" TIMESTAMP(3);
