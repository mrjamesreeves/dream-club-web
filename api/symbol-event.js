// Anonymous symbol ingestion for the collective-unconscious page.
// The app POSTs { symbols: ["teeth", "airport"] } after an analysis
// (or once, as a journal backfill). Geography comes from Vercel's
// edge headers — country/state/city derived from the connection at
// the edge; the IP itself is never stored or forwarded. No user id,
// no dream id, no text beyond the single generic words.

const SUPABASE_URL = "https://opkalkbjecbnnavxnmdb.supabase.co";
// The publishable key is public by design (it ships in the app);
// RLS makes the table write-only.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const cleaned = symbols
    .filter((s) => typeof s === "string")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 1 && s.length <= 40)
    .slice(0, 50); // backfills send batches; still bounded

  if (cleaned.length === 0) {
    return res.status(400).json({ error: "symbols required" });
  }

  const country = req.headers["x-vercel-ip-country"] || null;
  const region = decodeSafe(req.headers["x-vercel-ip-country-region"]);
  const city = decodeSafe(req.headers["x-vercel-ip-city"]);

  const rows = cleaned.map((symbol) => ({ symbol, country, region, city }));

  const response = await fetch(`${SUPABASE_URL}/rest/v1/symbol_events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    return res.status(502).json({ error: "storage failed" });
  }
  return res.status(204).end();
}

// Vercel URI-encodes city names ("S%C3%A3o%20Paulo").
function decodeSafe(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
