import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { Handler } from "aws-lambda";
import axios from "axios";

const s3Client = new S3Client({ region: "us-east-1" });

interface InferenceResult {
  user_id: string;
  will_churn: number;
  [key: string]: any;
}

interface Event {
  id: string;
  timestamp: string;
  event_type: string;
  user_id: string;
}

// Helper function to stream S3 object to string
const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

export const handler: Handler = async (event: any) => {
  const bucketName = process.env.BUCKET_NAME!;
  const resultsKey = process.env.RESULTS_KEY!;
  const webhookUrl = process.env.WEBHOOK_URL!;

  try {
    // Get the results file from S3
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: resultsKey,
    });
    const { Body } = await s3Client.send(command);
    const data = await streamToString(Body as Readable);
    const results: InferenceResult[] = JSON.parse(data);

    // Process each result
    const events: Event[] = [];
    const timestamp = new Date().toISOString();
    results.forEach((result) => {
      if (result.will_churn === 1) {
        const event: Event = {
          id: result.user_id, // assuming user_id is unique and can serve as id
          timestamp: timestamp,
          event_type: "churn_prediction",
          user_id: result.user_id,
        };
        events.push(event);
      }
    });

    // Send events to the webhook
    for (const event of events) {
      await axios.post(webhookUrl, event);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Events processed and sent successfully",
      }),
    };
  } catch (error: any) {
    console.error("Error processing events:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing events",
        error: error.message,
      }),
    };
  }
};
