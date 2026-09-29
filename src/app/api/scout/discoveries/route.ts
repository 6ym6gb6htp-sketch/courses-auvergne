import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { raceDiscoveries } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = await db
      .select()
      .from(raceDiscoveries)
      .where(eq(raceDiscoveries.status, "pending"))
      .orderBy(asc(raceDiscoveries.raceDate), asc(raceDiscoveries.name));
    return Response.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load race discoveries", error);
    return Response.json({ error: "Impossible de charger les pistes du robot." }, { status: 500 });
  }
}
