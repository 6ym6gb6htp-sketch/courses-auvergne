import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { raceDiscoveries, races } from "@/db/schema";

export const dynamic = "force-dynamic";

function normalizeName(value: string) {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Cette piste n’existe pas." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "La demande est invalide." }, { status: 400 });
  }

  const action = typeof body === "object" && body !== null && "action" in body && typeof body.action === "string"
    ? body.action
    : "";
  if (action !== "approve" && action !== "dismiss") {
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  }

  try {
    if (action === "dismiss") {
      const [updated] = await db
        .update(raceDiscoveries)
        .set({ status: "dismissed" })
        .where(and(eq(raceDiscoveries.id, id), eq(raceDiscoveries.status, "pending")))
        .returning({ id: raceDiscoveries.id });
      if (!updated) return Response.json({ error: "Cette piste a déjà été traitée." }, { status: 409 });
      return Response.json({ ok: true, dismissed: true });
    }

    const [discovery] = await db
      .select()
      .from(raceDiscoveries)
      .where(and(eq(raceDiscoveries.id, id), eq(raceDiscoveries.status, "pending")))
      .limit(1);

    if (!discovery) return Response.json({ error: "Cette piste a déjà été traitée." }, { status: 409 });
    if (
      !discovery.raceDate ||
      !discovery.city ||
      discovery.city === "Lieu à préciser" ||
      !discovery.department ||
      !["03", "15", "43", "63"].includes(discovery.department)
    ) {
      return Response.json({ error: "La date et le lieu restent à confirmer. Ouvre la source avant de l’ajouter." }, { status: 422 });
    }

    const raceType = discovery.type === "route" ? "route" : "trail";
    const result = await db.transaction(async (transaction) => {
      const sameDateAndDepartment = await transaction
        .select()
        .from(races)
        .where(and(eq(races.raceDate, discovery.raceDate!), eq(races.department, discovery.department!)));
      const normalizedName = normalizeName(discovery.name);
      const duplicate = sameDateAndDepartment.find((race) =>
        normalizeName(race.name) === normalizedName && normalizeName(race.city) === normalizeName(discovery.city!),
      );

      let race = duplicate;
      let alreadyListed = Boolean(duplicate);
      if (!race) {
        const [created] = await transaction
          .insert(races)
          .values({
            name: discovery.name,
            type: raceType,
            raceDate: discovery.raceDate!,
            endDate: discovery.endDate,
            city: discovery.city!,
            department: discovery.department!,
            distances: discovery.distances,
            description: discovery.description || "Course repérée automatiquement. Informations à confirmer auprès de l’organisateur.",
            registrationUrl: discovery.eventUrl ?? discovery.sourceUrl,
            featured: false,
            dateConfirmed: false,
          })
          .returning();
        race = created;
        alreadyListed = false;
      }

      await transaction
        .update(raceDiscoveries)
        .set({ status: "approved" })
        .where(and(eq(raceDiscoveries.id, id), eq(raceDiscoveries.status, "pending")));
      return { race, alreadyListed };
    });

    return Response.json({ ok: true, alreadyListed: result.alreadyListed, race: result.race });
  } catch (error) {
    console.error("Unable to process race discovery", error);
    return Response.json({ error: "La piste n’a pas pu être traitée. Réessaie dans un instant." }, { status: 500 });
  }
}
