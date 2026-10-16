import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

const cronSecret = defineSecret("CRON_SECRET");

export const dailyLoanProcessing = onSchedule(
  { schedule: "15 1 * * *", timeZone: "Asia/Manila", secrets: [cronSecret], retryCount: 3 },
  async () => {
    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) throw new Error("APP_BASE_URL is not configured for the scheduled function.");
    const response = await fetch(`${baseUrl}/api/cron/daily`, { method: "POST", headers: { authorization: `Bearer ${cronSecret.value()}` } });
    if (!response.ok) throw new Error(`Daily processing failed with HTTP ${response.status}: ${await response.text()}`);
    logger.info("Daily loan processing complete", await response.json());
  },
);
