BEGIN;
-- CreateTable
CREATE TABLE "WorkFocus" (
    "userId" INTEGER NOT NULL,
    "todoId" INTEGER NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkFocus_pkey" PRIMARY KEY ("userId","todoId","date")
);

-- CreateIndex
CREATE INDEX "WorkFocus_userId_date_active_idx" ON "WorkFocus"("userId", "date", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Todo_id_userId_key" ON "Todo"("id", "userId");

-- AddForeignKey
ALTER TABLE "WorkFocus" ADD CONSTRAINT "WorkFocus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkFocus" ADD CONSTRAINT "WorkFocus_todoId_userId_fkey" FOREIGN KEY ("todoId", "userId") REFERENCES "Todo"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;


ALTER TABLE "WorkFocus" ADD CONSTRAINT "WorkFocus_date" CHECK ("date" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("date"::date,'YYYY-MM-DD')="date");
COMMIT;
