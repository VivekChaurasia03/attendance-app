import { useState } from "react";

const SECTIONS = ["0201", "0202", "0203"];
const SECTION_TIMES = {
  "0201": "12:00 – 1:00 PM",
  "0202": "1:00 – 2:00 PM",
  "0203": "2:00 – 3:00 PM",
};

export default function AttendanceForm() {
  const [uid, setUid] = useState("");
  const [section, setSection] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/submitAttendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid.trim(), section }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ text: data.message, type: "success" });
        setUid("");
        setSection("");
      } else {
        setMessage({ text: data.error, type: "error" });
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1>INST346 Lab Attendance</h1>
        <p className="subtitle">Spring 2026 — Friday Labs</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="uid">SIS ID (UID)</label>
            <input
              id="uid"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="e.g. 119756065"
              required
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="section">Section</label>
            <select
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              required
            >
              <option value="">Select your section...</option>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} ({SECTION_TIMES[s]})
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit Attendance"}
          </button>
        </form>

        {message && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}
      </div>
    </div>
  );
}
