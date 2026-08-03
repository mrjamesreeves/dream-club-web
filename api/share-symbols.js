// Publish a dreamer's top symbols as a page at /s/<slug>.
// Body: { symbols: [{ symbol, count }], title? }  ->  { url, manageToken }
// DELETE with { slug, manageToken } takes a page down.

const SUPABASE_URL = "https://opkalkbjecbnnavxnmdb.supabase.co";
const KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_2cxTEoh2ZkVcMSb0e9JIDg_CK05bW4f";

export default async function handler(req, res) {
  if (req.method === "DELETE") return handleDelete(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "POST or DELETE" });
  }

  const raw = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const symbols = raw
    .filter((e) => e && typeof e.symbol === "string")
    .map((e) => ({
      symbol: e.symbol.trim().toLowerCase().slice(0, 40),
      count: Math.max(1, Math.min(100000, Number(e.count) || 1)),
    }))
    .filter((e) => e.symbol.length > 0)
    .slice(0, 10);
  if (!symbols.length) return res.status(400).json({ error: "symbols required" });

  const title = typeof req.body?.title === "string" ? req.body.title.slice(0, 60) : null;
  const payload = { symbols, title, v: 1 };

  // Slug from the top three symbols, Spite-style; random suffix on collision.
  const base = symbols.slice(0, 3).map((e) => e.symbol).join("-")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || randomChars(7);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomChars(4)}`;
    const response = await rpc("symbol_share_create", { p_slug: slug, p_payload: payload });
    if (response.ok) {
      const rows = await response.json();
      const row = rows[0];
      return res.status(200).json({
        url: `https://thedream.club/s/${row.slug}`,
        manageToken: row.manage_token,
      });
    }
    const body = await response.text();
    if (!body.includes("23505") && !body.includes("duplicate")) {
      return res.status(502).json({ error: "storage failed" });
    }
  }
  return res.status(502).json({ error: "slug collision" });
}

async function handleDelete(req, res) {
  const { slug, manageToken } = req.body ?? {};
  if (typeof slug !== "string" || typeof manageToken !== "string") {
    return res.status(400).json({ error: "slug and manageToken required" });
  }
  const response = await rpc("symbol_share_delete", { p_slug: slug, p_token: manageToken });
  if (!response.ok) return res.status(502).json({ error: "delete failed" });
  const deleted = await response.json();
  return res.status(deleted === true ? 204 : 403).end();
}

function rpc(fn, args) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
}

function randomChars(n) {
  return Array.from({ length: n }, () =>
    "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]
  ).join("");
}
