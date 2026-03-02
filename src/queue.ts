import { Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "sms-queue",
  async (job) => {
    console.log("Processing job:", job.id);
    console.log("Sending SMS to:", job.data.phone);
    console.log("Message:", job.data.message);

    // Simulate delay (like real SMS API call)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("SMS sent successfully ✅");
  },
  {
    connection,
    concurrency: 5,
  }
);

console.log("Worker started...");
