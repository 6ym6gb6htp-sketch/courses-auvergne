"use client";

import { useEffect, useRef, useState } from "react";
import type { Race, RaceDiscovery } from "@/db/schema";

type PublicRace = Omit<Race, "createdAt">;
type SourceReport = {
  name: string;
  url: string;
  status: "success" | "unavailable" | "not-configured";
  scanned: number;
  matched: number;
  message?: string;
};

type ScoutPanelProps = {
  initialDiscoveries: RaceDiscovery[];
  initialLastScanAt: string | null;
  onRaceAdded: (race: PublicRace, alreadyListed: boolean) => void;
  onMessage: (message: string) => void;
};

const departments = [
  { code: "003", name: "Allier" },
  { code: "015", name: "Cantal" },
  { code: "043", name: "Haute-Loire" },
  { code: "063", name: "Puy-de-Dôme" },
];

function ScoutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8-1.8 5.7-1.8-5.7-5.7-1.8L10.2 9 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m19 15 .9 2.4 2.4.9-2.4.8L19 21.5l-.8-2.4-2.4-.8 2.4-.9L19 15Z" fill="currentColor"/></svg>;
}

function ExternalIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function formatRaceDate(value: string | null, endDate: string | null) {
  if (!value) return "Date à préciser";
  const start = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  if (!endDate || endDate === value) return start;
  const end = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${endDate}T12:00:00Z`));
  return `${start} – ${end}`;
}

function ffaCalendarUrl(department: string) {
  const params = new URLSearchParams({
    frmbase: "calendrier",
    frmdate1: "",
    frmdate2: "",
    frmdepartement: department,
    frmepreuve: "",
    frmespace: "0",
    frmligue: "ARA",
    frmmode: "1",
    frmniveau: "",
    frmniveaulab: "",
    frmpostback: "true",
    frmsaisonffa: "2026",
    frmtype1: "Hors Stade",
    frmtype2: "",
    frmtype3: "",
    frmtype4: "",
  });
  return `https://athle.fr/bases/liste.aspx?${params.toString()}`;
}

function DiscoveryCard({
  discovery,
  busy,
  onAction,
}: {
  discovery: RaceDiscovery;
  busy: boolean;
  onAction: (id: number, action: "approve" | "dismiss") => void;
}) {
  const readyToAdd = Boolean(
    discovery.raceDate &&
    discovery.city && discovery.city !== "Lieu à préciser" &&
    discovery.department,
  );
  const departmentName = departments.find((item) => item.code === discovery.department?.padStart(3, "0"))?.name
    ?? (discovery.department ? `Département ${discovery.department}` : "Département à préciser");
  const sourceLink = discovery.eventUrl ?? discovery.sourceUrl;

  return (
    <article className="discovery-card">
      <div className="discovery-main">
        <div className="discovery-date">{formatRaceDate(discovery.raceDate, discovery.endDate)}</div>
        <span className={`type-badge ${discovery.type === "trail" ? "type-trail" : "type-road"}`}>
          <span className="type-dot" />{discovery.type === "trail" ? "Trail" : "Sur route"}
        </span>
        <h4>{discovery.name}</h4>
        <p className="discovery-place">
          {discovery.city ?? "Lieu à préciser"}
          {discovery.department && <> <span>·</span> {departmentName}</>}
        </p>
        {discovery.distances.length > 0 && (
          <div className="distance-list discovery-distances">
            {discovery.distances.slice(0, 4).map((distance) => <span className="distance-tag" key={distance}>{distance}</span>)}
            {discovery.distances.length > 4 && <span className="distance-tag distance-more">+{discovery.distances.length - 4}</span>}
          </div>
        )}
        <p className="discovery-excerpt">{discovery.excerpt || discovery.description}</p>
      </div>
      <div className="discovery-side">
        <a className="discovery-source" href={sourceLink} target="_blank" rel="noreferrer">
          <ExternalIcon />Source : {discovery.sourceName}
        </a>
        <span className={readyToAdd ? "discovery-completeness is-ready" : "discovery-completeness"}>
          {readyToAdd ? "Date et lieu détectés" : "Infos à compléter"}
        </span>
        <div className="discovery-actions">
          {readyToAdd ? (
            <button className="button button-primary" type="button" disabled={busy} onClick={() => onAction(discovery.id, "approve")}>
              {busy ? "En cours…" : "Ajouter au calendrier"}
            </button>
          ) : (
            <a className="button button-quiet" href={sourceLink} target="_blank" rel="noreferrer">Vérifier la source<ExternalIcon /></a>
          )}
          <button className="discovery-dismiss" type="button" disabled={busy} onClick={() => onAction(discovery.id, "dismiss")}>Ignorer</button>
        </div>
      </div>
    </article>
  );
}

export function ScoutPanel({ initialDiscoveries, initialLastScanAt, onRaceAdded, onMessage }: ScoutPanelProps) {
  const [discoveries, setDiscoveries] = useState(initialDiscoveries);
  const [sourceReports, setSourceReports] = useState<SourceReport[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(initialLastScanAt);
  const [isExpanded, setIsExpanded] = useState(false);
  const autoScanStarted = useRef(false);

  async function refreshDiscoveries() {
    const response = await fetch("/api/scout/discoveries", { cache: "no-store" });
    const data: unknown = await response.json();
    if (!response.ok) throw new Error("Impossible de recharger les pistes du robot.");
    if (Array.isArray(data)) setDiscoveries(data as RaceDiscovery[]);
  }

  async function runScan() {
    if (isScanning) return;
    setIsScanning(true);
    setScanError("");
    setScanMessage("");
    setActionError("");
    try {
      const response = await fetch("/api/scout/scan", { method: "POST" });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Le scan est momentanément indisponible.";
        setScanError(message);
        return;
      }
      if (typeof result === "object" && result !== null) {
        const payload = result as { message?: unknown; sources?: unknown; scannedAt?: unknown };
        if (typeof payload.message === "string") setScanMessage(payload.message);
        if (Array.isArray(payload.sources)) setSourceReports(payload.sources as SourceReport[]);
        if (typeof payload.scannedAt === "string") setLastScannedAt(payload.scannedAt);
      }
      await refreshDiscoveries();
      setIsExpanded(true);
    } catch {
      setScanError("Impossible de contacter le robot. Vérifie la connexion et réessaie.");
    } finally {
      setIsScanning(false);
    }
  }

  async function handleDiscoveryAction(id: number, action: "approve" | "dismiss") {
    if (busyId !== null) return;
    setBusyId(id);
    setActionError("");
    try {
      const response = await fetch(`/api/scout/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Cette piste ne peut pas être traitée pour le moment.";
        setActionError(message);
        return;
      }

      if (action === "dismiss") {
        setDiscoveries((current) => current.filter((item) => item.id !== id));
        onMessage("Piste ignorée. Elle ne sera pas ajoutée au calendrier.");
      } else if (typeof result === "object" && result !== null && "race" in result) {
        const payload = result as { race: PublicRace; alreadyListed?: boolean };
        setDiscoveries((current) => current.filter((item) => item.id !== id));
        onRaceAdded(payload.race, Boolean(payload.alreadyListed));
      }
    } catch {
      setActionError("La piste n’a pas pu être mise à jour. Réessaie.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (autoScanStarted.current) return;
    autoScanStarted.current = true;
    const lastRun = initialLastScanAt ? Date.parse(initialLastScanAt) : Number.NaN;
    const oneDay = 24 * 60 * 60 * 1000;
    if (Number.isFinite(lastRun) && Date.now() - lastRun < oneDay) return;
    void runScan();
    // Le contrôle se fait une seule fois au montage ; le scan manuel reste disponible ensuite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="scout-panel" aria-labelledby="scout-title">
      <div className="scout-header">
        <div className="scout-icon"><ScoutIcon /></div>
        <div className="scout-intro">
          <span className="section-kicker"><span className="kicker-dot" />La veille des courses</span>
          <h3 id="scout-title">Un robot repère. Toi, tu confirmes.</h3>
          <p>Une fois par jour à la première visite, il vérifie les calendriers publics. Tu peux aussi le relancer à la main ; rien n’est publié automatiquement.</p>
        </div>
        <button className="button button-primary scout-run-button" type="button" onClick={runScan} disabled={isScanning}>
          <ScoutIcon />{isScanning ? "Le robot cherche…" : "Lancer la veille"}
        </button>
      </div>

      <div className="scout-source-grid">
        <div className="scout-sources">
          <span className="scout-small-label">Sources publiques consultées</span>
          <div className="scout-source-links">
            <a href="https://sasdepart.fr/calendrier-trail/" target="_blank" rel="noreferrer">Trail · Sas de Départ <ExternalIcon /></a>
            <a href="https://sasdepart.fr/calendrier-route/" target="_blank" rel="noreferrer">Route · Sas de Départ <ExternalIcon /></a>
          </div>
          <details className="ffa-reference">
            <summary>Consulter directement le calendrier officiel FFA</summary>
            <p>La FFA interdit la copie des données affichées sur son site. Le robot fournit donc les liens officiels par département, sans aspirer ni republier ces données.</p>
            <div className="ffa-links">
              {departments.map((department) => (
                <a href={ffaCalendarUrl(department.code)} target="_blank" rel="noreferrer" key={department.code}>
                  {department.code.slice(1)} · {department.name}<ExternalIcon />
                </a>
              ))}
            </div>
          </details>
        </div>
        <div className="social-source-note">
          <span className="social-source-icon">f</span>
          <div>
            <strong>Facebook & Instagram</strong>
            <p>Connexion via l’API officielle Meta, pour les pages autorisées — jamais de scraping de comptes privés.</p>
          </div>
        </div>
      </div>

      {(scanError || scanMessage || lastScannedAt) && (
        <div className={scanError ? "scout-feedback is-error" : "scout-feedback"} role={scanError ? "alert" : "status"}>
          <span>{scanError ? "!" : "✓"}</span>
          <p>{scanError || scanMessage || "Scan terminé."}{lastScannedAt && !scanError && <small>Dernier scan : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastScannedAt))}</small>}</p>
        </div>
      )}

      {sourceReports.length > 0 && (
        <div className="scout-report" aria-label="Résultats du dernier scan">
          {sourceReports.map((source) => (
            <div className={`scout-report-item report-${source.status}`} key={`${source.name}-${source.url}`}>
              <span className="report-status-dot" />
              <span className="report-name">{source.name}</span>
              <span className="report-count">{source.status === "success" ? `${source.matched} piste${source.matched > 1 ? "s" : ""}` : source.status === "not-configured" ? "API non connectée" : "Indisponible"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="discovery-list-heading">
        <div>
          <span className="scout-small-label">À vérifier avant publication</span>
          <h4>{discoveries.length} {discoveries.length > 1 ? "pistes en attente" : "piste en attente"}</h4>
        </div>
        {discoveries.length > 0 && (
          <button type="button" className="discovery-expand-button" onClick={() => setIsExpanded((current) => !current)} aria-expanded={isExpanded}>
            {isExpanded ? "Masquer" : "Afficher les pistes"}<span>{isExpanded ? "−" : "+"}</span>
          </button>
        )}
      </div>

      {actionError && <p className="scout-action-error" role="alert">{actionError}</p>}
      {isExpanded && discoveries.length > 0 && (
        <div className="discovery-list">
          {discoveries.map((discovery) => (
            <DiscoveryCard
              discovery={discovery}
              busy={busyId === discovery.id}
              onAction={handleDiscoveryAction}
              key={discovery.id}
            />
          ))}
        </div>
      )}
      {isExpanded && discoveries.length === 0 && (
        <p className="scout-empty-state">Aucune piste à vérifier pour l’instant. Lance la veille ou propose une course depuis le formulaire.</p>
      )}
    </section>
  );
}
