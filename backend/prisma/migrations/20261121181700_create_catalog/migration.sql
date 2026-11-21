-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ComponentRole" AS ENUM ('main', 'background');

-- CreateEnum
CREATE TYPE "VariantDetail" AS ENUM ('simple', 'detailed', 'any');

-- CreateTable
CREATE TABLE "components" (
    "id" VARCHAR(64) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_variants" (
    "component_id" VARCHAR(64) NOT NULL,
    "detail" "VariantDetail" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" "ComponentRole" NOT NULL,
    "tags" TEXT[],
    "source" VARCHAR(120) NOT NULL,
    "svg" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "component_variants_pkey" PRIMARY KEY ("component_id", "detail")
);

-- AddForeignKey
ALTER TABLE "component_variants" ADD CONSTRAINT "component_variants_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
