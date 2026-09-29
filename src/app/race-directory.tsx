"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Race, RaceDiscovery } from "@/db/schema";
import { ScoutPanel } from "./scout-panel";

export type PublicRace = Omit<Race, "createdAt">;

type RaceTypeFilter = "all" | "trail" | "route";

const departments = [
  { code: "03", name: "Allier" },
  { code: "15", name: "Cantal" },
  { code: "43", name: "Haute-Loire" },
  { code: "63", name: "Puy-de-Dôme" },
];

const months = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M7.5 3.5v3M16.5 3.5v3M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function PinIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="M19 10.1c0 5-7 10.4-7 10.4S5 15.1 5 10.1a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7"/></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>;
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} className="icon"><path d="M20.2 8.8c0 4.1-8.2 10-8.2 10s-8.2-5.9-8.2-10a4.4 4.4 0 0 1 8.2-2.2 4.4 4.4 0 0 1 8.2 2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="icon"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M5 26.5 14.7 10l5.1 8.2 3.3-5.1L31 26.5H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M11 26.5 16.5 17l4.7 7.8 2.4-3.7 3.5 5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateParts(value: string) {
  const date = dateAtNoon(value);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  const year = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "UTC" }).format(date);
  return { day, month, year };
}

function formatDateRange(start: string, end: string | null) {
  const first = dateParts(start);
  if (!end || end === start) return `${first.day} ${first.month} ${first.year}`;
  const last = dateParts(end);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = first.year === last.year;
  if (sameMonth && sameYear) return `${first.day}–${last.day} ${last.month} ${last.year}`;
  return `${first.day} ${first.month} ${first.year} – ${last.day} ${last.month} ${last.year}`;
}

function monthNumber(value: string) {
  return value.slice(5, 7);
}

function EventCard({
  race,
  isSaved,
  onToggleSaved,
}: {
  race: PublicRace;
  isSaved: boolean;
  onToggleSaved: (id: number) => void;
}) {
  const date = dateParts(race.raceDate);
  const detailUrl = race.registrationUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${race.name} ${race.city} ${date.year} course`)}`;
  const departmentName = departments.find((item) => item.code === race.department)?.name ?? `Département ${race.department}`;

  return (
    <article className={`race-card${race.featured ? " is-featured" : ""}`}>
      <div className="race-card-top">
        <div className="event-date" aria-label={`Le ${formatDateRange(race.raceDate, race.endDate)}`}>
          <span>{date.month}</span>
          <strong>{date.day}</strong>
          <small>{date.year}</small>
        </div>
        <div className="card-top-actions">
          <span className={`type-badge ${race.type === "trail" ? "type-trail" : "type-road"}`}>
            <span className="type-dot" />{race.type === "trail" ? "Trail" : "Sur route"}
          </span>
          <button
            className={`save-button${isSaved ? " is-saved" : ""}`}
            type="button"
            aria-label={isSaved ? `Retirer ${race.name} des favoris` : `Ajouter ${race.name} aux favoris`}
            aria-pressed={isSaved}
            onClick={() => onToggleSaved(race.id)}
          >
            <HeartIcon filled={isSaved} />
          </button>
        </div>
      </div>

      <div className="race-card-heading">
        <div className="race-name-line">
          <h3>{race.name}</h3>
          {race.featured && <span className="featured-label">À ne pas manquer</span>}
        </div>
        <p className="race-location"><PinIcon />{race.city}<span className="location-separator">·</span>{departmentName}</p>
      </div>

      <p className="race-description">{race.description}</p>

      <div className="distance-list" aria-label="Distances proposées">
        {race.distances.slice(0, 4).map((distance) => <span className="distance-tag" key={distance}>{distance}</span>)}
        {race.distances.length > 4 && <span className="distance-tag distance-more">+{race.distances.length - 4}</span>}
      </div>

      <div className="race-card-bottom">
        <div className="race-meta">
          {race.elevation && <span className="elevation-label">↗ {race.elevation}</span>}
          {!race.dateConfirmed && <span className="unconfirmed-label">Date à confirmer</span>}
          {race.endDate && <span className="weekend-label">Week-end de course</span>}
        </div>
        <a className="event-link" href={detailUrl} target="_blank" rel="noreferrer">
          {race.registrationUrl ? "Infos course" : "Trouver les infos"}<ArrowIcon />
        </a>
      </div>
    </article>
  );
}

function AddRaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (race: PublicRace) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      type: formData.get("type"),
      raceDate: formData.get("raceDate"),
      city: formData.get("city"),
      department: formData.get("department"),
      distances: formData.get("distances"),
      registrationUrl: formData.get("registrationUrl"),
    };

    try {
      const response = await fetch("/api/races", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Une erreur est survenue. Réessaie.";
        setError(message);
        return;
      }
      onCreated(result as PublicRace);
    } catch {
      setError("Impossible de contacter le calendrier. Vérifie ta connexion et réessaie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="race-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="section-kicker"><span className="kicker-dot" />Le calendrier est à tous</span>
            <h2 id="dialog-title">Ajouter une course</h2>
            <p>Tu connais un départ qu’on a oublié ? Partage-le avec les coureurs du coin.</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Fermer la fenêtre"><CloseIcon /></button>
        </div>

        <form className="race-form" onSubmit={handleSubmit}>
          <label className="form-field form-field-full">
            <span>Nom de la course</span>
            <input name="name" required maxLength={120} placeholder="Ex. La course des volcans" />
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>Discipline</span>
              <select name="type" defaultValue="trail">
                <option value="trail">Trail</option>
                <option value="route">Course sur route</option>
              </select>
            </label>
            <label className="form-field">
              <span>Date de départ</span>
              <input name="raceDate" type="date" required />
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span>Ville</span>
              <input name="city" required maxLength={100} placeholder="Ex. Volvic" />
            </label>
            <label className="form-field">
              <span>Département</span>
              <select name="department" defaultValue="63">
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code} · {department.name}</option>)}
              </select>
            </label>
          </div>
          <label className="form-field form-field-full">
            <span>Distances <small>séparées par une virgule</small></span>
            <input name="distances" required placeholder="Ex. 10 km, 21 km, 42 km" />
          </label>
          <label className="form-field form-field-full">
            <span>Lien d’inscription ou d’information <small>facultatif</small></span>
            <input name="registrationUrl" type="url" placeholder="https://…" />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-footer">
            <p>Les nouvelles dates sont indiquées comme à confirmer.</p>
            <div className="form-actions">
              <button className="button button-quiet" type="button" onClick={onClose}>Annuler</button>
              <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Ajout en cours…" : "Ajouter au calendrier"}<ArrowIcon />
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

export function RaceDirectory({
  initialRaces,
  initialDiscoveries,
  initialLastScanAt,
}: {
  initialRaces: PublicRace[];
  initialDiscoveries: RaceDiscovery[];
  initialLastScanAt: string | null;
}) {
  const [races, setRaces] = useState(initialRaces);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<RaceTypeFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("foulee-auvergnate-favorites");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setFavoriteIds(parsed.filter((id): id is number => typeof id === "number"));
      }
    } catch {
      // Une valeur de favoris invalide est simplement ignorée.
    } finally {
      setFavoritesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      window.localStorage.setItem("foulee-auvergnate-favorites", JSON.stringify(favoriteIds));
    } catch {
      // Les favoris restent utilisables même si le stockage local est désactivé.
    }
  }, [favoriteIds, favoritesLoaded]);

  const filteredRaces = useMemo(() => {
    const normalizedQuery = normalizeText(search.trim());
    return races
      .filter((race) => {
        if (typeFilter !== "all" && race.type !== typeFilter) return false;
        if (departmentFilter !== "all" && race.department !== departmentFilter) return false;
        if (monthFilter !== "all" && monthNumber(race.raceDate) !== monthFilter) return false;
        if (yearFilter !== "all" && race.raceDate.slice(0, 4) !== yearFilter) return false;
        if (favoritesOnly && !favoriteIds.includes(race.id)) return false;
        if (!normalizedQuery) return true;
        const searchable = normalizeText([
          race.name,
          race.city,
          race.department,
          race.description,
          ...race.distances,
        ].join(" "));
        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => a.raceDate.localeCompare(b.raceDate));
  }, [races, search, typeFilter, departmentFilter, monthFilter, yearFilter, favoritesOnly, favoriteIds]);

  const trailCount = races.filter((race) => race.type === "trail").length;
  const roadCount = races.filter((race) => race.type === "route").length;
  const departmentCount = new Set(races.map((race) => race.department)).size;
  const availableYears = [...new Set(races.map((race) => race.raceDate.slice(0, 4)))].sort();
  const hasFilters = search.trim() !== "" || typeFilter !== "all" || departmentFilter !== "all" || monthFilter !== "all" || yearFilter !== "all" || favoritesOnly;

  function toggleFavorite(id: number) {
    setFavoriteIds((current) => current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id]);
  }

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setDepartmentFilter("all");
    setMonthFilter("all");
    setYearFilter("all");
    setFavoritesOnly(false);
  }

  function handleCreated(race: PublicRace) {
    setRaces((current) => [...current, race]);
    setIsDialogOpen(false);
    setNotice("Course ajoutée au calendrier. Merci pour le partage !");
    window.setTimeout(() => setNotice(""), 4500);
  }

  function handleScoutedRaceAdded(race: PublicRace, alreadyListed: boolean) {
    if (!alreadyListed) setRaces((current) => current.some((item) => item.id === race.id) ? current : [...current, race]);
    setNotice(alreadyListed ? "Cette course était déjà dans le calendrier. Le doublon a été écarté." : "Course ajoutée depuis une source publique. Vérifie les informations auprès de l’organisateur.");
    window.setTimeout(() => setNotice(""), 5500);
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#accueil" aria-label="La Foulée Auvergnate — accueil">
          <BrandMark />
          <span className="brand-name">la foulée <strong>auvergnate</strong></span>
        </a>
        <nav className="main-nav" aria-label="Navigation principale">
          <a href="#calendrier">Le calendrier</a>
          <a href="#territoires">Les territoires</a>
          <a href="#proposer">Pour les organisateurs</a>
        </nav>
        <button className="header-cta" type="button" onClick={() => setIsDialogOpen(true)}><PlusIcon />Ajouter une course</button>
      </header>

      <section className="hero" id="accueil" aria-labelledby="hero-title">
        <div className="hero-image" aria-hidden="true" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-dot" />Le calendrier running d’Auvergne</div>
          <h1 id="hero-title">L’Auvergne<br />se court <span>ici.</span></h1>
          <p>Des premières foulées aux grands ultras. Trouve la course qui te ressemble, au cœur des volcans et des villages d’Auvergne.</p>
          <div className="hero-actions">
            <a className="button button-lime" href="#calendrier">Explorer les courses<ArrowIcon /></a>
            <a className="hero-text-link" href="#territoires">Découvrir les territoires<span>↘</span></a>
          </div>
        </div>
        <div className="hero-bottom">
          <div className="hero-stats" aria-label="Le calendrier en chiffres">
            <div><strong>{races.length}</strong><span>courses listées</span></div>
            <div><strong>{departmentCount}</strong><span>départements</span></div>
            <div><strong>2</strong><span>façons de courir</span></div>
          </div>
          <p className="hero-side-note"><span>COURIR, RESPIRER, RECOMMENCER</span><strong>Le terrain de jeu<br />est juste là.</strong></p>
        </div>
        <span className="hero-coordinate" aria-hidden="true">45°46′N&nbsp;&nbsp; 3°05′E</span>
      </section>

      <section className="intro-strip" aria-label="Disciplines au calendrier">
        <p>Le bon dossard,<br className="intro-mobile-break" /> au bon endroit.</p>
        <div className="intro-divider" />
        <span><i className="intro-dot trail-dot" />{trailCount} trails</span>
        <span><i className="intro-dot road-dot" />{roadCount} courses sur route</span>
        <a href="#calendrier">À toi de choisir <span>↗</span></a>
      </section>

      <section className="directory-section" id="calendrier" aria-labelledby="calendar-title">
        <div className="section-heading-row">
          <div>
            <span className="section-kicker"><span className="kicker-dot" />Le calendrier Auvergnat</span>
            <h2 id="calendar-title">Trouve ta prochaine<br className="desktop-break" /> ligne de départ.</h2>
          </div>
          <p className="section-intro">Un calendrier participatif qui s’étoffe au fil des saisons : trails de village, courses sur route et grands rendez-vous auvergnats.</p>
        </div>

        <ScoutPanel
          initialDiscoveries={initialDiscoveries}
          initialLastScanAt={initialLastScanAt}
          onRaceAdded={handleScoutedRaceAdded}
          onMessage={(message) => {
            setNotice(message);
            window.setTimeout(() => setNotice(""), 4500);
          }}
        />

        <div className="filter-panel">
          <label className="search-field">
            <SearchIcon />
            <span className="sr-only">Rechercher une course ou une ville</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Une course, une ville, un département…" />
            {search && <button type="button" className="clear-search" onClick={() => setSearch("")} aria-label="Effacer la recherche"><CloseIcon /></button>}
          </label>
          <label className="select-field">
            <CalendarIcon />
            <span className="sr-only">Filtrer par mois</span>
            <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
              <option value="all">Tous les mois</option>
              {months.map((month, index) => <option value={String(index + 1).padStart(2, "0")} key={month}>{month}</option>)}
            </select>
            <span className="select-chevron">⌄</span>
          </label>
          <label className="select-field">
            <CalendarIcon />
            <span className="sr-only">Filtrer par année</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="all">Toutes les années</option>
              {availableYears.map((year) => <option value={year} key={year}>{year}</option>)}
            </select>
            <span className="select-chevron">⌄</span>
          </label>
          <label className="select-field department-select">
            <PinIcon />
            <span className="sr-only">Filtrer par département</span>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">Toute l’Auvergne</option>
              {departments.map((department) => <option value={department.code} key={department.code}>{department.code} · {department.name}</option>)}
            </select>
            <span className="select-chevron">⌄</span>
          </label>
        </div>

        <div className="filter-toolbar">
          <div className="filter-tabs" role="group" aria-label="Filtrer par discipline">
            <button className={typeFilter === "all" ? "filter-tab is-active" : "filter-tab"} onClick={() => setTypeFilter("all")} type="button">Tout voir <span>{races.length}</span></button>
            <button className={typeFilter === "trail" ? "filter-tab is-active" : "filter-tab"} onClick={() => setTypeFilter("trail")} type="button"><i className="tab-dot trail-dot" />Trail <span>{trailCount}</span></button>
            <button className={typeFilter === "route" ? "filter-tab is-active" : "filter-tab"} onClick={() => setTypeFilter("route")} type="button"><i className="tab-dot road-dot" />Sur route <span>{roadCount}</span></button>
          </div>
          <div className="filter-toolbar-right">
            <button className={`favorites-toggle${favoritesOnly ? " is-active" : ""}`} type="button" onClick={() => setFavoritesOnly((current) => !current)} aria-pressed={favoritesOnly}>
              <HeartIcon filled={favoritesOnly} />Mes favoris{favoriteIds.length > 0 && <span>{favoriteIds.length}</span>}
            </button>
            <span className="result-count"><strong>{filteredRaces.length}</strong> {filteredRaces.length > 1 ? "courses" : "course"}</span>
          </div>
        </div>

        {filteredRaces.length > 0 ? (
          <div className="race-grid">
            {filteredRaces.map((race) => <EventCard key={race.id} race={race} isSaved={favoriteIds.includes(race.id)} onToggleSaved={toggleFavorite} />)}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon"><SearchIcon /></span>
            <h3>{favoritesOnly && favoriteIds.length === 0 ? "Pas encore de favori." : "Aucune course trouvée."}</h3>
            <p>{favoritesOnly && favoriteIds.length === 0 ? "Appuie sur le cœur d’une course pour la retrouver ici." : "Essaie un autre mot-clé ou enlève quelques filtres."}</p>
            {hasFilters && <button type="button" className="button button-quiet" onClick={resetFilters}>Réinitialiser les filtres</button>}
          </div>
        )}

        <p className="calendar-note"><span>À noter</span> Les calendriers et inscriptions peuvent évoluer. Vérifie les informations auprès de l’organisateur avant de prendre le départ.</p>
      </section>

      <section className="territory-panel" id="territoires" aria-labelledby="territory-title">
        <div className="territory-copy">
          <span className="territory-kicker"><span className="territory-spark" />L’Auvergne en mouvement</span>
          <h2 id="territory-title">Quatre départements.<br />Mille terrains de jeu.</h2>
          <p>Des bords de l’Allier aux crêtes du Cantal, l’aventure commence à deux pas de chez toi.</p>
        </div>
        <div className="territory-list" aria-label="Explorer les courses par département">
          {departments.map((department, index) => (
            <button type="button" className="territory-item" key={department.code} onClick={() => { setDepartmentFilter(department.code); document.getElementById("calendrier")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="territory-number">0{index + 1}</span>
              <span className="territory-name">{department.name}</span>
              <span className="territory-code">{department.code}</span>
              <span className="territory-arrow">↗</span>
            </button>
          ))}
        </div>
        <div className="territory-decoration" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <section className="organizer-panel" id="proposer">
        <div className="organizer-icon"><PlusIcon /></div>
        <div className="organizer-copy">
          <span className="section-kicker"><span className="kicker-dot" />Le calendrier participatif</span>
          <h2>Ta course manque à l’appel ?</h2>
          <p>Fais connaître ton prochain départ aux coureurs de la région. L’ajout prend moins d’une minute.</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setIsDialogOpen(true)}>Proposer une course<ArrowIcon /></button>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#accueil"><BrandMark /><span className="brand-name">la foulée <strong>auvergnate</strong></span></a>
        <p>Fait avec amour, au pied des volcans <span>✳</span></p>
        <a href="#accueil" className="back-to-top">Retour en haut ↑</a>
      </footer>

      {notice && <div className="toast-message" role="status"><span>✓</span>{notice}</div>}
      {isDialogOpen && <AddRaceDialog onClose={() => setIsDialogOpen(false)} onCreated={handleCreated} />}
    </main>
  );
}
