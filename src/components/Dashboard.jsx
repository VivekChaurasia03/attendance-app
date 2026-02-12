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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [visibleSections, setVisibleSections] = useState(
    () => new Set(SECTIONS)
  );
  const chartRef = useRef(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => {
        if (res.status === 401) throw new Error("Unauthorized");
        if (!res.ok) throw new Error("Failed to load stats");
        return res.json();
      })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

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
        <h1>TA Dashboard</h1>

        {stats.dates.length > 0 ? (
          <div className="chart-wrapper" style={{ height: "350px" }}>
            <Bar ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        ) : (
          <p className="no-data">No attendance data yet.</p>
        )}

        <p className="chart-hint">Click on any bar to see student details</p>
      </div>

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
        <div className="section-filters">
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
          if (sectionAbsentees.length === 0) {
            return (
              <div key={sec} className="section-summary">
                <h3 style={{ borderLeft: `4px solid ${SECTION_COLORS[sec].bg}`, paddingLeft: "0.75rem" }}>
                  Section {sec}
                </h3>
                <p className="subtitle">No absences recorded</p>
              </div>
            );
          }
          return (
            <div key={sec} className="section-summary">
              <h3 style={{ borderLeft: `4px solid ${SECTION_COLORS[sec].bg}`, paddingLeft: "0.75rem" }}>
                Section {sec}
              </h3>
              <p className="subtitle">
                {sectionAbsentees.length} student{sectionAbsentees.length !== 1 ? "s" : ""} with
                absences out of {stats.rosterTotals[sec]} enrolled
                ({stats.dates.length} lab{stats.dates.length !== 1 ? "s" : ""} so far)
              </p>
              <div className="table-scroll">
                <table className="absence-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>UID</th>
                      <th>Absences</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAbsentees.map((s) => (
                      <tr
                        key={s.uid}
                        className={
                          s.absences >= 3
                            ? "high-absence"
                            : s.absences >= 2
                              ? "med-absence"
                              : ""
                        }
                      >
                        <td>{s.name}</td>
                        <td className="uid-cell">{s.uid}</td>
                        <td className="absence-count-cell">{s.absences}</td>
                        <td>
                          {s.email && (
                            <a href={`mailto:${s.email}`}>{s.email}</a>
                          )}
                        </td>
                      </tr>
                    ))}
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
