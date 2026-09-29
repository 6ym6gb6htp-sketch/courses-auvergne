import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const races = pgTable("races", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  raceDate: date("race_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  city: text("city").notNull(),
  department: text("department").notNull(),
  distances: text("distances").array().notNull(),
  elevation: text("elevation"),
  description: text("description").notNull(),
  registrationUrl: text("registration_url"),
  featured: boolean("featured").notNull().default(false),
  dateConfirmed: boolean("date_confirmed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const raceDiscoveries = pgTable(
  "race_discoveries",
  {
    id: serial("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    raceDate: date("race_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    city: text("city"),
    department: text("department"),
    distances: text("distances").array().notNull(),
    description: text("description").notNull().default(""),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    eventUrl: text("event_url"),
    excerpt: text("excerpt").notNull().default(""),
    confidence: integer("confidence").notNull().default(40),
    status: text("status").notNull().default("pending"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("race_discoveries_fingerprint_idx").on(table.fingerprint),
    index("race_discoveries_status_date_idx").on(table.status, table.raceDate),
  ],
);

export const raceScoutRuns = pgTable("race_scout_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  discoveriesFound: integer("discoveries_found").notNull().default(0),
  errorMessage: text("error_message"),
});

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
export type RaceDiscovery = typeof raceDiscoveries.$inferSelect;
export type NewRaceDiscovery = typeof raceDiscoveries.$inferInsert;
export type RaceScoutRun = typeof raceScoutRuns.$inferSelect;
