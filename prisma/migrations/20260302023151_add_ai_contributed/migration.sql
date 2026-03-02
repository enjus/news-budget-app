-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "budgetLine" TEXT NOT NULL,
    "isEnterprise" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "onlinePubDate" DATETIME,
    "onlinePubDateTBD" BOOLEAN NOT NULL DEFAULT true,
    "printPubDate" DATETIME,
    "printPubDateTBD" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "notifyTeam" BOOLEAN NOT NULL DEFAULT false,
    "aiContributed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "shelvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Story" ("budgetLine", "createdAt", "id", "isEnterprise", "notes", "notifyTeam", "onlinePubDate", "onlinePubDateTBD", "printPubDate", "printPubDateTBD", "shelvedAt", "slug", "sortOrder", "status", "updatedAt") SELECT "budgetLine", "createdAt", "id", "isEnterprise", "notes", "notifyTeam", "onlinePubDate", "onlinePubDateTBD", "printPubDate", "printPubDateTBD", "shelvedAt", "slug", "sortOrder", "status", "updatedAt" FROM "Story";
DROP TABLE "Story";
ALTER TABLE "new_Story" RENAME TO "Story";
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "budgetLine" TEXT NOT NULL,
    "isEnterprise" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "storyId" TEXT,
    "onlinePubDate" DATETIME,
    "onlinePubDateTBD" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "notifyTeam" BOOLEAN NOT NULL DEFAULT false,
    "aiContributed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "shelvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("budgetLine", "createdAt", "id", "isEnterprise", "notes", "notifyTeam", "onlinePubDate", "onlinePubDateTBD", "shelvedAt", "slug", "sortOrder", "status", "storyId", "updatedAt") SELECT "budgetLine", "createdAt", "id", "isEnterprise", "notes", "notifyTeam", "onlinePubDate", "onlinePubDateTBD", "shelvedAt", "slug", "sortOrder", "status", "storyId", "updatedAt" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE UNIQUE INDEX "Video_slug_key" ON "Video"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
