import { MongoClient } from "mongodb";

let cachedClient = null;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(process.env.MONGODB_DB || "inst346_attendance");
}

// Strict time windows per section (Eastern Time, hour boundaries)
const WINDOWS = {
  "0201": { start: 12, end: 13 },
  "0202": { start: 13, end: 14 },
  "0203": { start: 14, end: 15 },
};

function getEasternTimeParts(date) {
  const parts = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .forEach((p) => (parts[p.type] = p.value));
  return parts;
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { uid, section } = body;

  // Input validation
  if (!uid || !section) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing UID or section" }) };
  }
  if (!/^\d+$/.test(uid)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID must be numeric" }) };
  }
  if (!WINDOWS[section]) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid section" }) };
  }

  // Time validation (skip if DEV_BYPASS_TIME is set)
  const now = new Date();
  const parts = getEasternTimeParts(now);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;

  if (process.env.DEV_BYPASS_TIME !== "true") {
    if (parts.weekday !== "Fri") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Attendance can only be submitted on Fridays" }),
      };
    }

    const currentMinutes = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
    const window = WINDOWS[section];
    const startMin = window.start * 60;
    const endMin = window.end * 60;

    if (currentMinutes < startMin || currentMinutes >= endMin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Outside attendance window for section ${section} (${window.start}:00–${window.end}:00 ET)`,
        }),
      };
    }
  }

  // Database operations
  const db = await getDb();

  // Verify student exists and section matches
  const student = await db.collection("students").findOne({ uid });
  if (!student) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID not found in roster" }) };
  }
  if (student.section !== section) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Section does not match your registered section" }),
    };
  }

  // Insert attendance (unique index on {uid, date} prevents duplicates)
  try {
    await db.collection("attendance").createIndex({ uid: 1, date: 1 }, { unique: true });
    await db.collection("attendance").createIndex({ date: 1, section: 1 });

    await db.collection("attendance").insertOne({
      uid,
      date: dateStr,
      section,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "Attendance already submitted for today" }),
      };
    }
    throw err;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: "Attendance recorded successfully!", date: dateStr }),
  };
};
