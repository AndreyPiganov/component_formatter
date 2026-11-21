BEGIN;

ALTER TABLE "component_variants" RENAME COLUMN "component_id" TO "public_id";
ALTER TABLE "component_variants" ADD COLUMN "component_id" VARCHAR(64),
                                 ADD COLUMN "source_file" TEXT;
UPDATE "component_variants" SET "component_id" =
  CASE WHEN right("public_id", length("role"::text) + 1) = '-' || "role"::text
       THEN left("public_id", length("public_id") - length("role"::text) - 1)
       ELSE "public_id" END;

-- Abort atomically if legacy variants cannot share a single catalog identity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "component_variants" GROUP BY "component_id"
             HAVING count(DISTINCT ("name", "tags")) > 1)
     OR EXISTS (SELECT 1 FROM "component_variants" GROUP BY "component_id", "role"
                HAVING count(DISTINCT "public_id") > 1)
     OR EXISTS (SELECT 1 FROM "component_variants" GROUP BY "public_id"
                HAVING count(DISTINCT ("component_id", "role")) > 1) THEN
    RAISE EXCEPTION 'Conflicting legacy component metadata or public IDs. Reconcile catalog variants before migrating.';
  END IF;
END $$;

ALTER TABLE "component_variants" DROP CONSTRAINT "component_variants_component_id_fkey",
                                 DROP CONSTRAINT "component_variants_pkey";
ALTER TABLE "components" ADD COLUMN "name" VARCHAR(160), ADD COLUMN "tags" TEXT[];
INSERT INTO "components" ("id", "name", "tags")
  SELECT DISTINCT "component_id", "name", "tags" FROM "component_variants"
  ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "tags" = EXCLUDED."tags";
DELETE FROM "components" WHERE "name" IS NULL;
ALTER TABLE "components" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "component_variants" ALTER COLUMN "component_id" SET NOT NULL,
                                 DROP COLUMN "name", DROP COLUMN "tags",
                                 ADD PRIMARY KEY ("component_id", "role", "detail"),
                                 ADD CONSTRAINT "component_variants_component_id_fkey"
                                   FOREIGN KEY ("component_id") REFERENCES "components" ("id")
                                   ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "component_variants_public_id_detail_key" ON "component_variants" ("public_id", "detail");
COMMIT;
