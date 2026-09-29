import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { raceDiscoveries, raceScoutRuns, races, type Race } from "@/db/schema";
import { initialRaces } from "@/data/races";
import { RaceDirectory } from "./race-directory";

export const dynamic = "force-dynamic";

type PublicRace = Omit<Race, "createdAt">;

export default async function HomePage() {
  let raceRows = await db.select().from(races).orderBy(asc(races.raceDate));

  if (raceRows.length === 0) {
    await db.insert(races).values(initialRaces);
    raceRows = await db.select().from(races).orderBy(asc(races.raceDate));
  }

  const discoveries = await db
    .select()
    .from(raceDiscoveries)
    .where(eq(raceDiscoveries.status, "pending"))
    .orderBy(asc(raceDiscoveries.raceDate), asc(raceDiscoveries.name));
  const [latestRun] = await db
    .select({ finishedAt: raceScoutRuns.finishedAt, status: raceScoutRuns.status })
    .from(raceScoutRuns)
    .orderBy(desc(raceScoutRuns.startedAt))
    .limit(1);
  const initialLastScanAt = latestRun?.finishedAt && ["complete", "partial"].includes(latestRun.status)
    ? latestRun.finishedAt.toISOString()
    : null;
  const publicRaces: PublicRace[] = raceRows.map(({ createdAt: _createdAt, ...race }) => race);

  return (
    <RaceDirectory
      initialRaces={publicRaces}
      initialDiscoveries={discoveries}
      initialLastScanAt={initialLastScanAt}
    />
  );
}
