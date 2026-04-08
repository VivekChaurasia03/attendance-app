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
      headers: { "WWW-Authenticate": 'Basic realm="Makeup"' },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, ...passParts] = decoded.split(":");
  const pass = passParts.join(":");

  if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS) {
    return {
      statusCode: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Makeup"' },
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

  const { uid, makeup_date, count } = body;

  // Input validation
  if (!uid || !makeup_date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing UID or makeup date" }) };
  }

  if (!/^\d+$/.test(uid)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID must be numeric" }) };
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(makeup_date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Date must be YYYY-MM-DD" }) };
  }

  // Validate and parse count
  const labCount = count ? parseInt(count, 10) : 1;
  if (isNaN(labCount) || labCount < 1) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Count must be a positive number" }) };
  }

  const db = await getDb();

  // Verify student exists
  const student = await db.collection("students").findOne({ uid }, { projection: { name: 1, section: 1 } });
  if (!student) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "UID not found in students collection" }) };
  }

  // Insert/update makeup record (upsert with count increment)
  try {
    const result = await db.collection("makeups").findOneAndUpdate(
      { uid, makeup_date },
      { $inc: { count: labCount }, $setOnInsert: { uid, makeup_date } },
      { upsert: true, returnDocument: "after" }
    );

    const finalCount = result.value?.count || labCount;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Makeup done",
        uid,
        name: student.name,
        makeup_date,
        count: finalCount,
      }),
    };
  } catch (err) {
    console.error("Makeup error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Database error" }),
    };
  }
};
