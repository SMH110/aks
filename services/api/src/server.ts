import express, { type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { jobs, runs, sender } from "./azure.js";


interface JobRecord {
  id: string;
  jobId: string;
  requestedRuns: number;
  status: "dispatching" | "queued" | "dispatch_failed";
}

interface RunResult {
  runId: string;
  runNumber: number;
  result: number;
  completedAt: string;
}


const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: "8kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "api" });
});

async function updateDispatch(
  jobId: string,
  status: "queued" | "dispatch_failed",
  confirmedMessagesSent: number,
): Promise<void> {
  // First argument: document ID. Second: partition key value.
  await jobs.item(jobId, jobId).patch([
    {
      op: "set",
      path: "/status",
      value: status,
    },
    {
      op: "set",
      path: "/confirmedMessagesSent",
      value: confirmedMessagesSent,
    },
    {
      op: "set",
      path: "/updatedAt",
      value: new Date().toISOString(),
    },
  ]);
}

app.post("/jobs", async (request, response) => {
  const body: unknown = request.body;

  const runs =
    typeof body === "object" && body !== null && "runs" in body
      ? body.runs
      : undefined;

  if (
    typeof runs !== "number" ||
    !Number.isInteger(runs) ||
    runs < 1 ||
    runs > 100
  ) {
    response.status(400).json({
      error: "runs must be a whole number between 1 and 100.",
    });
    return;
  }

  const jobId = randomUUID();
  const createdAt = new Date().toISOString();

  // Save the job before publishing any work.
  await jobs.items.create({
    id: jobId,
    jobId,
    requestedRuns: runs,
    status: "dispatching",
    confirmedMessagesSent: 0,
    createdAt,
    updatedAt: createdAt,
  });

  let confirmedMessagesSent = 0;

  try {
    for (let runNumber = 1; runNumber <= runs; runNumber++) {
      const runId = `${jobId}:${runNumber}`;

      await sender.sendMessages({
        messageId: runId,
        correlationId: jobId,
        subject: "simulation.run",
        contentType: "application/json",
        body: {
          schemaVersion: 1,
          jobId,
          runId,
          runNumber,
        },
      });

      confirmedMessagesSent++;
    }

    await updateDispatch(jobId, "queued", confirmedMessagesSent);
  } catch (error) {
    console.error("Job dispatch failed", {
      jobId,
      confirmedMessagesSent,
      error,
    });

    try {
      await updateDispatch(
        jobId,
        "dispatch_failed",
        confirmedMessagesSent,
      );
    } catch (saveError) {
      console.error("Could not save dispatch failure", {
        jobId,
        saveError,
      });
    }

    response.status(503).json({
      error:
        "Dispatch did not finish cleanly. Some messages may already be queued.",
      jobId,
      confirmedMessagesSent,
    });
    return;
  }

  response.status(202).json({
    jobId,
    requestedRuns: runs,
    status: "queued",
  });
});

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  console.error(error);

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;

  if (status === 400 || status === 413) {
    response.status(status).json({
      error:
        status === 400
          ? "Request body must be valid JSON."
          : "Request body is too large.",
    });
    return;
  }

 response.status(503).json({
  error: "Unable to complete the request. Check the API logs.",
});
};


app.get("/jobs/:jobId", async (request, response) => {
  const { jobId } = request.params;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
    response.status(400).json({
      error: "jobId must be a UUID.",
    });
    return;
  }

  // Read the job using its document ID and partition key.
  const { resource: job } = await jobs
    .item(jobId, jobId)
    .read<JobRecord>();

  if (!job) {
    response.status(404).json({
      error: "Job not found.",
    });
    return;
  }

  // Retrieve completed results belonging to this job.
  const { resources: results } = await runs.items
    .query<RunResult>(
      {
        query: `
          SELECT c.id AS runId, c.runNumber, c.result, c.completedAt
          FROM c
          WHERE c.jobId = @jobId AND c.status = "completed"
        `,
        parameters: [
          { name: "@jobId", value: jobId },
        ],
      },
      { partitionKey: jobId },
    )
    .fetchAll();

  results.sort((a, b) => a.runNumber - b.runNumber);

  const completedRuns = results.length;

  const status =
    completedRuns === job.requestedRuns
      ? "completed"
      : completedRuns > 0
        ? "partially_completed"
        : "pending";

  response.json({
    jobId: job.jobId,
    requestedRuns: job.requestedRuns,
    completedRuns,
    remainingRuns: Math.max(
      0,
      job.requestedRuns - completedRuns,
    ),
    status,
    dispatchStatus: job.status,
    results,
  });
});


app.use(errorHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});