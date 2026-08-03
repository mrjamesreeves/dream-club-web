// Daily presence ping: a random iCloud-synced install id says
// "someone is here" — never near symbol_events, so symbols stay
// unlinkable to anyone. Geography from Vercel edge headers; the IP
// itself is never stored.

const SUPABASE_URL = "https://opkalkbjecbnnavxnmdb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  const dreamer = req.body?.dreamer;
  if (typeof dreamer !== "string" || !UUID_RE.test(dreamer)) {
    return res.status(400).json({ error: "dreamer uuid required" });
  }

  const row = {
    dreamer: dreamer.toLowerCase(),
    country: req.headers["x-vercel-ip-country"] || null,
    region: decodeSafe(req.headers["x-vercel-ip-country-region"]),
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/dreamer_pings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify([row]),
  });

  if (!response.ok) return res.status(502).json({ error: "storage failed" });
  return res.status(204).end();
}

function decodeSafe(value) {
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}
