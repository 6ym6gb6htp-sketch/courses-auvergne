import { asc } from "drizzle-orm";
import { db } from "@/db";
import { races } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = await db.select().from(races).orderBy(asc(races.raceDate));
    return Response.json(results);
  } catch (error) {
    console.error("Unable to load races", error);
    return Response.json({ error: "Impossible de charger le calendrier." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Le formulaire est invalide." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Le formulaire est invalide." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const readText = (key: string) =>
    typeof body[key] === "string" ? body[key].trim() : "";

  const name = readText("name");
  const type = readText("type");
  const raceDate = readText("raceDate");
  const city = readText("city");
  const department = readText("department");
  const description = readText("description") || "Course proposée par la communauté.";
  const rawDistances = body.distances;
  const distances = Array.isArray(rawDistances)
    ? rawDistances.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : typeof rawDistances === "string"
      ? rawDistances.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(raceDate) && !Number.isNaN(Date.parse(`${raceDate}T00:00:00`));
  const validDepartments = ["03", "15", "43", "63"];

  if (
    !name || name.length > 120 ||
    !["trail", "route"].includes(type) ||
    !dateIsValid ||
    !city || city.length > 100 ||
    !validDepartments.includes(department) ||
    distances.length === 0 || distances.length > 8 ||
    distances.some((distance) => distance.length > 40)
  ) {
    return Response.json({ error: "Vérifie le nom, la date, le lieu, le département et les distances." }, { status: 400 });
  }

  const rawUrl = readText("registrationUrl");
  let registrationUrl: string | null = null;
  if (rawUrl) {
    try {
      const parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
        registrationUrl = parsedUrl.toString();
      }
    } catch {
      return Response.json({ error: "Le lien d’inscription doit être une adresse web valide." }, { status: 400 });
    }
  }

  try {
    const [createdRace] = await db
      .insert(races)
      .values({
        name,
        type,
        raceDate,
        city,
        department,
        distances,
        description: description.slice(0, 500),
        registrationUrl,
        dateConfirmed: false,
      })
      .returning();

    return Response.json(createdRace, { status: 201 });
  } catch (error) {
    console.error("Unable to create race", error);
    return Response.json({ error: "La course n’a pas pu être enregistrée. Réessaie dans un instant." }, { status: 500 });
  }
}
