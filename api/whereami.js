// Where is this connection, coarsely? Country and region from Vercel's
// edge headers, returned to the app and stored nowhere. The app sends
// them along when it shares a dream to the pool, so the dream can be
// signed "Ohio, United States" without the app ever asking for
// location permission. The IP is never stored or forwarded.

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    country: req.headers["x-vercel-ip-country"] || null,
    region: decodeSafe(req.headers["x-vercel-ip-country-region"]),
  });
}

function decodeSafe(value) {
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}
