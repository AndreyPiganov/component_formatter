CREATE TABLE "ai_usage_windows" (
    "period" TEXT PRIMARY KEY,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "used" INTEGER NOT NULL CHECK ("used" >= 0)
);

INSERT INTO "ai_usage_windows" ("period", "starts_at", "used")
VALUES ('minute', 'epoch', 0), ('day', 'epoch', 0);
