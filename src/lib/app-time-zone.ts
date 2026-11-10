// Server configuration; date APIs send this value to clients explicitly.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "America/Toronto";
new Intl.DateTimeFormat("en", { timeZone: APP_TIME_ZONE }).format();
