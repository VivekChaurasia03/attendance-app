import { MongoClient } from "mongodb";

let cachedClient = null;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(process.env.MONGODB_DB || "inst346_attendance");
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  // Basic Auth check (admin only)
  const authHeader = event.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) {
    return {
      statusCode: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Backfill"' },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, ...passParts] = decoded.split(":");
  const pass = passParts.join(":");

  if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS) {
    return {
      statusCode: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Backfill"' },
      body: JSON.stringify({ error: "Invalid credentials" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { uid, date } = body;

  // Input validation
  if (!uid || !date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing UID or date" }) };
  }

  if (!/^\d+$/.test(uid)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID must be numeric" }) };
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Date must be YYYY-MM-DD" }) };
  }

  const db = await getDb();

  // Look up student and resolve section
  const student = await db.collection("students").findOne({ uid }, { projection: { section: 1, name: 1 } });
  if (!student) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID not found in students collection" }) };
  }

  // Insert attendance
  try {
    await db.collection("attendance").createIndex({ uid: 1, date: 1 }, { unique: true });

    const result = await db.collection("attendance").insertOne({
      uid,
      date,
      section: student.section,
      timestamp: `${date}T12:30:00`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Backfill successful",
        uid,
        name: student.name,
        section: student.section,
        date,
      }),
    };
  } catch (err) {
    if (err.code === 11000) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: `Attendance already exists for UID ${uid} on ${date}` }),
      };
    }
    console.error("Backfill error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Database error" }),
    };
  }
};
