-- CreateTable
CREATE TABLE "DraftSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cookieToken" TEXT NOT NULL,
    "groupCode" TEXT,
    "seed" TEXT,
    "drawSequenceJson" TEXT NOT NULL,
    "remainingTeamsJson" TEXT NOT NULL,
    "currentDrawIndex" INTEGER NOT NULL DEFAULT 0,
    "lineupJson" TEXT NOT NULL DEFAULT '{}',
    "chosenPlayersJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFTING',
    "runId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareCode" TEXT NOT NULL,
    "groupCode" TEXT,
    "seed" TEXT,
    "teamScore" REAL NOT NULL,
    "usedFallbackStats" BOOLEAN NOT NULL DEFAULT false,
    "lineupJson" TEXT NOT NULL,
    "contributionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RunPick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "teamAbbr" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "bpm" REAL NOT NULL,
    "ws48" REAL NOT NULL,
    "vorp" REAL NOT NULL,
    "epm" REAL NOT NULL,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "contribution" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunPick_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftSession_cookieToken_key" ON "DraftSession"("cookieToken");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSession_runId_key" ON "DraftSession"("runId");

-- CreateIndex
CREATE INDEX "DraftSession_groupCode_idx" ON "DraftSession"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "Run_shareCode_key" ON "Run"("shareCode");

-- CreateIndex
CREATE INDEX "Run_groupCode_idx" ON "Run"("groupCode");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RunPick_runId_slot_key" ON "RunPick"("runId", "slot");

-- CreateIndex
CREATE INDEX "RunPick_runId_idx" ON "RunPick"("runId");
