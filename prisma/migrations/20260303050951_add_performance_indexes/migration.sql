-- CreateIndex
CREATE INDEX "Story_status_idx" ON "Story"("status");

-- CreateIndex
CREATE INDEX "Story_isEnterprise_idx" ON "Story"("isEnterprise");

-- CreateIndex
CREATE INDEX "Story_onlinePubDate_idx" ON "Story"("onlinePubDate");

-- CreateIndex
CREATE INDEX "Story_printPubDate_idx" ON "Story"("printPubDate");

-- CreateIndex
CREATE INDEX "Story_status_onlinePubDate_idx" ON "Story"("status", "onlinePubDate");

-- CreateIndex
CREATE INDEX "Story_isEnterprise_status_idx" ON "Story"("isEnterprise", "status");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");

-- CreateIndex
CREATE INDEX "Video_isEnterprise_idx" ON "Video"("isEnterprise");

-- CreateIndex
CREATE INDEX "Video_onlinePubDate_idx" ON "Video"("onlinePubDate");

-- CreateIndex
CREATE INDEX "Video_status_onlinePubDate_idx" ON "Video"("status", "onlinePubDate");

-- CreateIndex
CREATE INDEX "Video_isEnterprise_status_idx" ON "Video"("isEnterprise", "status");
