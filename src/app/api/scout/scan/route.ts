import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { raceDiscoveries, raceScoutRuns } from "@/db/schema";
import { scanPublicRaceSources } from "@/lib/race-scout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCAN_COOLDOWN_MS = 5 * 60 * 1000;

class ScanCooldownError extends Error {
  constructor(readonly retryAfter: number, readonly running: boolean) {
    super(running ? "Un scan est déjà en cours." : "La veille vient d’être lancée.");
  }
}

export async function POST() {
  let runId: number;

  try {
    const run = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(276320266)`);
      const [lastRun] = await transaction
        .select()
        .from(raceScoutRuns)
        .orderBy(desc(raceScoutRuns.startedAt))
        .limit(1);

      if (lastRun) {
        const elapsed = Date.now() - lastRun.startedAt.getTime();
        if (elapsed < SCAN_COOLDOWN_MS) {
          throw new ScanCooldownError(
            Math.max(1, Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000)),
            lastRun.status === "running",
          );
        }
      }

      const [createdRun] = await transaction
        .insert(raceScoutRuns)
        .values({ status: "running" })
        .returning({ id: raceScoutRuns.id });
      return createdRun;
    });
    runId = run.id;
  } catch (error) {
    if (error instanceof ScanCooldownError) {
      return Response.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.running ? 409 : 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    }
    console.error("Unable to start race scouting", error);
    return Response.json({ error: "Le robot n’a pas pu démarrer. Réessaie dans un instant." }, { status: 500 });
  }

  try {
    const result = await scanPublicRaceSources();
    const detectedAt = new Date();
    const uniqueDiscoveries = new Map(result.discoveries.map((discovery) => [discovery.fingerprint, discovery]));
    const discoveries = [...uniqueDiscoveries.values()];

    for (let offset = 0; offset < discoveries.length; offset += 100) {
      await db
        .insert(raceDiscoveries)
        .values(discoveries.slice(offset, offset + 100))
        .onConflictDoUpdate({
          target: raceDiscoveries.fingerprint,
          set: { lastSeenAt: detectedAt },
        });
    }

    const successfulSources = result.sources.filter((source) => source.status === "success").length;
    const finishedStatus = successfulSources > 0 ? "complete" : "partial";
    await db
      .update(raceScoutRuns)
      .set({
        finishedAt: detectedAt,
        status: finishedStatus,
        discoveriesFound: discoveries.length,
      })
      .where(eq(raceScoutRuns.id, runId));

    return Response.json({
      scannedAt: detectedAt.toISOString(),
      detections: discoveries.length,
      sources: result.sources,
      message: successfulSources > 0
        ? `${discoveries.length} piste${discoveries.length > 1 ? "s" : ""} repérée${discoveries.length > 1 ? "s" : ""}. À vérifier avant publication.`
        : "Les sources ne répondent pas pour le moment. Tu peux consulter les calendriers officiels ci-dessous.",
    });
  } catch (error) {
    console.error("Race scouting failed", error);
    await db
      .update(raceScoutRuns)
      .set({
        finishedAt: new Date(),
        status: "error",
        errorMessage: error instanceof Error ? error.message.slice(0, 400) : "Erreur inconnue",
      })
      .where(eq(raceScoutRuns.id, runId));
    return Response.json({ error: "Le scan a échoué. Les courses déjà enregistrées sont conservées." }, { status: 500 });
  }
}
