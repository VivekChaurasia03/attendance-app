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

  // Basic Auth check
  const authHeader = event.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) {
    return {
      statusCode: 401,
      headers: { "WWW-Authenticate": 'Basic realm="TA Dashboard"' },
      body: "Unauthorized",
    };
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, ...passParts] = decoded.split(":");
  const pass = passParts.join(":");

  if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS) {
    return {
      statusCode: 401,
      headers: { "WWW-Authenticate": 'Basic realm="TA Dashboard"' },
      body: "Invalid credentials",
    };
  }

  const db = await getDb();

  // Get all students (name, uid, section, email)
  const students = await db
    .collection("students")
    .find({}, { projection: { _id: 0, uid: 1, name: 1, section: 1, email: 1 } })
    .toArray();

  // Get all attendance records
  const attendance = await db
    .collection("attendance")
    .find({}, { projection: { _id: 0, uid: 1, date: 1, section: 1 } })
    .toArray();

  // Build attendance lookup: { "uid|date" -> true }
  const attendedSet = new Set();
  attendance.forEach((a) => attendedSet.add(`${a.uid}|${a.date}`));

  // Aggregate counts per date per section
  const dateSet = new Set();
  const sectionData = { "0201": {}, "0202": {}, "0203": {} };

  attendance.forEach((a) => {
    dateSet.add(a.date);
    if (sectionData[a.section]) {
      sectionData[a.section][a.date] = (sectionData[a.section][a.date] || 0) + 1;
    }
  });

  const dates = [...dateSet].sort();
  const sections = {};
  const rosterTotals = { "0201": 0, "0202": 0, "0203": 0 };

  for (const sec of ["0201", "0202", "0203"]) {
    sections[sec] = dates.map((d) => sectionData[sec][d] || 0);
    rosterTotals[sec] = students.filter((s) => s.section === sec).length;
  }

  // Build per-section student roster with absence count
  const studentsBySection = {};
  for (const sec of ["0201", "0202", "0203"]) {
    studentsBySection[sec] = students
      .filter((s) => s.section === sec)
      .map((s) => {
        const absences = dates.filter((d) => !attendedSet.has(`${s.uid}|${d}`)).length;
        return { uid: s.uid, name: s.name, email: s.email || "", absences };
      })
      .sort((a, b) => b.absences - a.absences); // most absences first
  }

  // Build detail for each date+section: list of absent students
  const details = {};
  for (const date of dates) {
    details[date] = {};
    for (const sec of ["0201", "0202", "0203"]) {
      const sectionStudents = students.filter((s) => s.section === sec);
      details[date][sec] = {
        present: sectionStudents.filter((s) => attendedSet.has(`${s.uid}|${date}`))
          .map((s) => ({ name: s.name, uid: s.uid })),
        absent: sectionStudents.filter((s) => !attendedSet.has(`${s.uid}|${date}`))
          .map((s) => ({ name: s.name, uid: s.uid, email: s.email || "" })),
      };
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ dates, sections, rosterTotals, studentsBySection, details }),
  };
};
