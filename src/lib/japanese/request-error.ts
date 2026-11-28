// Keep Prisma query text, parameters and word/session contents out of logs.
export function japaneseRequestError(
  error: unknown,
  operation: string,
  startedAt: number,
) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; meta?: { code?: unknown } })
      : null;
  const code =
    typeof value?.code === "string" && /^P\d{4}$/.test(value.code)
      ? value.code
      : "UNKNOWN";
  const message = error instanceof Error ? error.message : "";
  const databaseCode =
    value?.meta?.code === "54001" || /stack depth limit exceeded/.test(message)
      ? "54001"
      : null;
  console.error(
    `Japanese ${operation} failed (code=${code}${databaseCode ? `, databaseCode=${databaseCode}` : ""}, elapsedMs=${Math.max(0, Date.now() - startedAt)}).`,
  );
  if (databaseCode === "54001")
    return {
      status: 503,
      code: "JAPANESE_QUERY_TOO_COMPLEX",
      error:
        "The Japanese query exceeded a database limit. The administrator needs to update the app.",
    };
  if (["P2028", "P1008", "P2024", "P2034"].includes(code))
    return {
      status: 503,
      code: "JAPANESE_BUSY",
      error:
        operation === "save practice"
          ? "Japanese data took too long to process. Your practice results are still available; please try again."
          : "Japanese data took too long to process. Please try again.",
    };
  if (["P2021", "P2022"].includes(code))
    return {
      status: 503,
      code: "JAPANESE_DATABASE_UPDATE_REQUIRED",
      error:
        "Japanese data needs a database update. The administrator needs to apply the pending migrations.",
    };
  return {
    status: 500,
    code: "JAPANESE_REQUEST_FAILED",
    error: "Unable to complete this Japanese request. Please try again.",
  };
}
