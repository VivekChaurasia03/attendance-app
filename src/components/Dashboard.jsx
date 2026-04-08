import { useState, useEffect, useRef } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const SECTIONS = ["0201", "0202", "0203"];
const SECTION_COLORS = {
  "0201": { bg: "#e63946", hover: "#c1121f" },
  "0202": { bg: "#457b9d", hover: "#1d3557" },
  "0203": { bg: "#2a9d8f", hover: "#1a7a6e" },
};

function LoginForm({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const creds = "Basic " + btoa(`${user}:${pass}`);
    try {
      const res = await fetch("/api/stats", { headers: { Authorization: creds } });
      if (res.status === 401) { setError("Invalid username or password"); return; }
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      sessionStorage.setItem("dash_user", user);
      sessionStorage.setItem("dash_pass", pass);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 400, margin: "10vh auto" }}>
        <h1>TA Dashboard</h1>
        <p className="subtitle">Sign in to continue</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="lu">Username</label>
            <input id="lu" type="text" value={user} onChange={e => setUser(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="lp">Password</label>
            <input id="lp" type="password" value={pass} onChange={e => setPass(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign In"}</button>
          {error && <div className="message error" style={{ marginTop: "1rem" }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem("dash_user"));
  const [expandedUid, setExpandedUid] = useState(null);
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleSections, setVisibleSections] = useState(
    () => new Set(SECTIONS)
  );
  const [backfillModal, setBackfillModal] = useState(false);
  const [backfillUid, setBackfillUid] = useState("");
  const [backfillDate, setBackfillDate] = useState("");
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState(null);
  const [makeupModal, setMakeupModal] = useState(false);
  const [makeupUid, setMakeupUid] = useState("");
  const [makeupDate, setMakeupDate] = useState("");
  const [makeupCount, setMakeupCount] = useState("1");
  const [makeupLoading, setMakeupLoading] = useState(false);
  const [makeupMessage, setMakeupMessage] = useState(null);
  const chartRef = useRef(null);

  function authHeader() {
    const user = sessionStorage.getItem("dash_user") || "";
    const pass = sessionStorage.getItem("dash_pass") || "";
    return { Authorization: "Basic " + btoa(`${user}:${pass}`) };
  }

  async function handleBackfill(e) {
    e.preventDefault();
    setBackfillLoading(true);
    setBackfillMessage(null);

    try {
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ uid: backfillUid.trim(), date: backfillDate }),
      });

      const data = await res.json();

      if (res.ok) {
        setBackfillMessage({ text: `✓ Backfilled: ${data.name} (${data.section}) on ${data.date}`, type: "success" });
        setBackfillUid("");
        setBackfillDate("");
        // Refresh stats
        setTimeout(() => {
          fetch("/api/stats", { headers: authHeader() })
            .then((r) => r.json())
            .then(setStats);
          setBackfillModal(false);
        }, 1500);
      } else {
        setBackfillMessage({ text: data.error || "Backfill failed", type: "error" });
      }
    } catch (err) {
      setBackfillMessage({ text: err.message, type: "error" });
    } finally {
      setBackfillLoading(false);
    }
  }

  async function handleMakeup(e) {
    e.preventDefault();
    setMakeupLoading(true);
    setMakeupMessage(null);

    try {
      const res = await fetch("/api/makeup", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ uid: makeupUid.trim(), makeup_date: makeupDate, count: parseInt(makeupCount, 10) }),
      });

      const data = await res.json();

      if (res.ok) {
        setMakeupMessage({ text: `✓ Makeup done: ${data.name} (${data.count} lab${data.count !== 1 ? "s" : ""}) on ${data.makeup_date}`, type: "success" });
        setMakeupUid("");
        setMakeupDate("");
        setMakeupCount("1");
        // Refresh stats
        setTimeout(() => {
          fetch("/api/stats", { headers: authHeader() })
            .then((r) => r.json())
            .then(setStats);
          setMakeupModal(false);
          setMakeupMessage(null);
        }, 1500);
      } else {
        setMakeupMessage({ text: data.error || "Makeup scheduling failed", type: "error" });
      }
    } catch (err) {
      setMakeupMessage({ text: err.message, type: "error" });
    } finally {
      setMakeupLoading(false);
    }
  }

  // Always call useEffect — skip fetch if not logged in
  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/stats", { headers: authHeader() })
      .then((res) => {
        if (res.status === 401) throw new Error("Unauthorized");
        if (!res.ok) throw new Error("Failed to load stats");
        return res.json();
      })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [loggedIn]);

  // Show login form if not authenticated
  if (!loggedIn) {
    return (
      <LoginForm
        onLogin={(data) => {
          setStats(data);
          setLoggedIn(true);
        }}
      />
    );
  }



  const toggleSection = (sec) => {
    setVisibleSections((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) {
        next.delete(sec);
      } else {
        next.add(sec);
      }
      return next;
    });
  };

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <h1>TA Dashboard</h1>
          <div className="message error">{error}</div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container">
        <div className="card">
          <h1>TA Dashboard</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const maxStudents = Math.max(...SECTIONS.map((s) => stats.rosterTotals[s]));

  const chartData = {
    labels: stats.dates,
    datasets: SECTIONS.map((sec) => ({
      label: `Section ${sec}`,
      data: stats.sections[sec],
      backgroundColor: SECTION_COLORS[sec].bg,
      hoverBackgroundColor: SECTION_COLORS[sec].hover,
      borderRadius: 4,
      barPercentage: 0.85,
      categoryPercentage: 0.75,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        max: maxStudents + 2,
        title: { display: true, text: "Students Present" },
      },
    },
    plugins: {
      title: { display: false },
      legend: { position: "top" },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => {
            const sec = SECTIONS[ctx.datasetIndex];
            const total = stats.rosterTotals[sec];
            const present = ctx.raw;
            return `Absent: ${total - present} / ${total} enrolled`;
          },
        },
      },
    },
    onClick: (evt, elements) => {
      if (elements.length > 0) {
        const el = elements[0];
        const date = stats.dates[el.index];
        const section = SECTIONS[el.datasetIndex];
        setSelected((prev) =>
          prev?.date === date && prev?.section === section ? null : { date, section }
        );
      }
    },
  };

  const detail = selected && stats.details?.[selected.date]?.[selected.section];

  return (
    <div className="container dash">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h1 style={{ margin: 0 }}>TA Dashboard</h1>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => setBackfillModal(true)}
              style={{
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "0.5rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Backfill
            </button>
            <button
              onClick={() => setMakeupModal(true)}
              style={{
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "0.5rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Makeup
            </button>
          </div>
        </div>

        {stats.dates.length > 0 ? (
          <div className="chart-wrapper" style={{ height: "350px" }}>
            <Bar ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        ) : (
          <p className="no-data">No attendance data yet.</p>
        )}

        <p className="chart-hint">Click on any bar to see student details</p>
      </div>

      {/* Backfill modal */}
      {backfillModal && (
        <div className="modal-overlay" onClick={() => {
          if (!backfillLoading) {
            setBackfillModal(false);
            setBackfillUid("");
            setBackfillDate("");
            setBackfillMessage(null);
          }
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="drill-header">
              <h2>Backfill Attendance</h2>
              <button
                className="close-btn"
                onClick={() => {
                  setBackfillModal(false);
                  setBackfillUid("");
                  setBackfillDate("");
                  setBackfillMessage(null);
                }}
                disabled={backfillLoading}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleBackfill} style={{ padding: "1.5rem" }}>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label htmlFor="bfuid">UID</label>
                <input
                  id="bfuid"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={backfillUid}
                  onChange={(e) => setBackfillUid(e.target.value)}
                  placeholder="e.g. 119756065"
                  required
                  disabled={backfillLoading}
                />
              </div>
              <div className="field" style={{ marginBottom: "1.5rem" }}>
                <label htmlFor="bfdate">Date (YYYY-MM-DD)</label>
                <input
                  id="bfdate"
                  type="date"
                  value={backfillDate}
                  onChange={(e) => setBackfillDate(e.target.value)}
                  required
                  disabled={backfillLoading}
                />
              </div>
              <button type="submit" disabled={backfillLoading} style={{ width: "100%" }}>
                {backfillLoading ? "Backfilling..." : "Backfill"}
              </button>
              {backfillMessage && (
                <div className={`message ${backfillMessage.type}`} style={{ marginTop: "1rem" }}>
                  {backfillMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Makeup modal */}
      {makeupModal && (
        <div className="modal-overlay" onClick={() => {
          if (!makeupLoading) {
            setMakeupModal(false);
            setMakeupUid("");
            setMakeupDate("");
            setMakeupCount("1");
            setMakeupMessage(null);
          }
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="drill-header">
              <h2>Lab Makeup Done</h2>
              <button
                className="close-btn"
                onClick={() => {
                  setMakeupModal(false);
                  setMakeupUid("");
                  setMakeupDate("");
                  setMakeupCount("1");
                  setMakeupMessage(null);
                }}
                disabled={makeupLoading}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleMakeup} style={{ padding: "1.5rem" }}>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label htmlFor="muuid">UID</label>
                <input
                  id="muuid"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={makeupUid}
                  onChange={(e) => setMakeupUid(e.target.value)}
                  placeholder="e.g. 119756065"
                  required
                  disabled={makeupLoading}
                />
              </div>
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label htmlFor="mudate">Makeup Lab Date (YYYY-MM-DD)</label>
                <input
                  id="mudate"
                  type="date"
                  value={makeupDate}
                  onChange={(e) => setMakeupDate(e.target.value)}
                  required
                  disabled={makeupLoading}
                />
              </div>
              <div className="field" style={{ marginBottom: "1.5rem" }}>
                <label htmlFor="mucount">Labs Completed</label>
                <input
                  id="mucount"
                  type="number"
                  min="1"
                  value={makeupCount}
                  onChange={(e) => setMakeupCount(e.target.value)}
                  required
                  disabled={makeupLoading}
                />
              </div>
              <button type="submit" disabled={makeupLoading} style={{ width: "100%" }}>
                {makeupLoading ? "Recording..." : "Lab Makeup Done"}
              </button>
              {makeupMessage && (
                <div className={`message ${makeupMessage.type}`} style={{ marginTop: "1rem" }}>
                  {makeupMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Drill-down modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="drill-header">
              <h2>
                Section {selected.section} — {selected.date}
              </h2>
              <button className="close-btn" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="drill-stats">
              <span className="present-count">
                {detail.present.length} present
              </span>
              <span className="absent-count">
                {detail.absent.length} absent
              </span>
            </div>

            <div className="modal-scroll">
              {detail.absent.length > 0 && (
                <>
                  <h3 className="drill-section-title absent-title">Absent</h3>
                  <div className="student-list">
                    {detail.absent.map((s) => (
                      <div key={s.uid} className="student-row absent-row">
                        <span className="student-name">{s.name}</span>
                        <span className="student-uid">{s.uid}</span>
                        {s.email && (
                          <a href={`mailto:${s.email}`} className="student-email">
                            {s.email}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detail.present.length > 0 && (
                <>
                  <h3 className="drill-section-title present-title">Present</h3>
                  <div className="student-list">
                    {detail.present.map((s) => (
                      <div key={s.uid} className="student-row present-row">
                        <span className="student-name">{s.name}</span>
                        <span className="student-uid">{s.uid}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section filter + absentee summaries */}
      <div className="card">
        <h2>Absentee Summary</h2>

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="search-input" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 600, color: "#4b5563" }}>
            Search by Name or UID
          </label>
          <input
            id="search-input"
            type="text"
            placeholder="e.g. John or 119756065"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "0.55rem 0.75rem",
              border: "1.5px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div className="section-filters" style={{ marginBottom: "1.5rem" }}>
          {SECTIONS.map((sec) => (
            <label key={sec} className="section-filter-label">
              <input
                type="checkbox"
                checked={visibleSections.has(sec)}
                onChange={() => toggleSection(sec)}
              />
              <span
                className="filter-chip"
                style={{
                  borderColor: SECTION_COLORS[sec].bg,
                  background: visibleSections.has(sec) ? SECTION_COLORS[sec].bg : "transparent",
                  color: visibleSections.has(sec) ? "#fff" : SECTION_COLORS[sec].bg,
                }}
              >
                Section {sec}
              </span>
            </label>
          ))}
        </div>

        {SECTIONS.filter((sec) => visibleSections.has(sec)).map((sec) => {
          const sectionAbsentees = (stats.studentsBySection?.[sec] || []).filter(
            (s) => s.absences > 0
          );

          // Apply search filter
          const filteredAbsentees = sectionAbsentees.filter((s) => {
            const searchLower = searchTerm.toLowerCase();
            return s.name.toLowerCase().includes(searchLower) || s.uid.includes(searchTerm);
          });
          if (filteredAbsentees.length === 0) {
            return (
              <div key={sec} className="section-summary">
                <h3 style={{ borderLeft: `4px solid ${SECTION_COLORS[sec].bg}`, paddingLeft: "0.75rem" }}>
                  Section {sec}
                </h3>
                <p className="subtitle">{searchTerm ? "No matching students found" : "No absences recorded"}</p>
              </div>
            );
          }
          return (
            <div key={sec} className="section-summary">
              <h3 style={{ borderLeft: `4px solid ${SECTION_COLORS[sec].bg}`, paddingLeft: "0.75rem" }}>
                Section {sec}
              </h3>
              <p className="subtitle">
                {filteredAbsentees.length} student{filteredAbsentees.length !== 1 ? "s" : ""} with
                absences out of {stats.rosterTotals[sec]} enrolled
                ({stats.dates.length} lab{stats.dates.length !== 1 ? "s" : ""} so far)
              </p>
              <div className="table-scroll">
                <table className="absence-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}></th>
                      <th>Name</th>
                      <th>UID</th>
                      <th>Email</th>
                      <th>Absences</th>
                      <th>Makeups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAbsentees.map((s) => {
                      const isOpen = expandedUid === s.uid;
                      // Compute missed dates from stats.details
                      const missedDates = stats.dates.filter((d) =>
                        stats.details?.[d]?.[sec]?.absent?.some((a) => a.uid === s.uid)
                      );
                      // Get makeup dates for this student (deduplicated and from object)
                      const makeupDates = Object.keys(stats.makeupsByUid?.[s.uid] || {}).sort();
                      return (
                        <>
                          <tr
                            onClick={() => setExpandedUid(isOpen ? null : s.uid)}
                            style={{ cursor: "pointer" }}
                            className={
                              s.absences >= 3 ? "high-absence" :
                              s.absences >= 2 ? "med-absence" : ""
                            }
                          >
                            <td style={{ textAlign: "center", paddingLeft: "0.5rem", paddingRight: "0.5rem" }}>
                              <span style={{ fontSize: "1.1rem", color: "#6b7280" }}>
                                {isOpen ? "▼" : "▶"}
                              </span>
                            </td>
                            <td>{s.name}</td>
                            <td className="uid-cell">{s.uid}</td>
                            <td>
                              {s.email && (
                                <a href={`mailto:${s.email}`} onClick={e => e.stopPropagation()}>
                                  {s.email}
                                </a>
                              )}
                            </td>
                            <td className="absence-count-cell">{s.absences}</td>
                            <td style={{ textAlign: "center", fontWeight: 600, color: "#10b981" }}>
                              {stats.makeupCountsByUid?.[s.uid] || 0}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${s.uid}-detail`}>
                              <td colSpan={6} style={{ background: "#f9fafb", padding: "0.75rem 1rem" }}>
                                <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Missed Lab Dates
                                </p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
                                  {missedDates.map((d) => (
                                    <span key={d} style={{
                                      background: "#fee2e2",
                                      color: "#991b1b",
                                      border: "1.5px solid #fca5a5",
                                      borderRadius: "8px",
                                      padding: "0.25rem 0.65rem",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                    }}>
                                      {d}
                                    </span>
                                  ))}
                                </div>
                                {makeupDates.length > 0 && (
                                  <>
                                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                      Makeup Lab Dates
                                    </p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                                      {makeupDates.map((d) => {
                                        const count = stats.makeupsByUid?.[s.uid]?.[d] || 1;
                                        return (
                                          <span key={d} style={{
                                            background: "#d1fae5",
                                            color: "#065f46",
                                            border: "1.5px solid #6ee7b7",
                                            borderRadius: "8px",
                                            padding: "0.25rem 0.65rem",
                                            fontSize: "0.8rem",
                                            fontWeight: 600,
                                          }}>
                                            {d} ({count} lab{count !== 1 ? "s" : ""})
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
