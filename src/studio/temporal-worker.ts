import { IronlineStudioControl } from "./control";
import { StudioRunStore } from "./run-store";

const POLL_INTERVAL_MS = 2_500;

async function tick() {
  const store = new StudioRunStore();
  const control = new IronlineStudioControl({ runStore: store });
  const dueJobs = store
    .listJobs(200)
    .filter((job) => job.status === "scheduled" && new Date(job.executeAt).getTime() <= Date.now());

  for (const job of dueJobs) {
    await store.updateJob(job.id, { status: "running" });

    try {
      await control.runAgent({
        trigger: "scheduled",
        channel: String(job.payload.channel ?? "system") as "system" | "imessage" | "gmail" | "web",
        input: String(job.payload.input ?? `Scheduled job ${job.jobType}`),
        context: (job.payload.context as Record<string, unknown> | undefined) ?? {},
        approvalMode: "autonomous",
        messagePayload: (job.payload.messagePayload as Record<string, unknown> | undefined) ?? undefined,
      });

      await store.updateJob(job.id, { status: "completed" });
    } catch (error: any) {
      await store.updateJob(job.id, {
        status: "failed",
        lastError: error?.message ?? String(error),
      });
    }
  }
}

setInterval(() => {
  tick().catch((error) => {
    console.error("[temporal-worker] tick failed", error);
  });
}, POLL_INTERVAL_MS);

tick().catch((error) => {
  console.error("[temporal-worker] bootstrap failed", error);
});
