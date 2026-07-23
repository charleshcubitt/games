import { neon } from '@neondatabase/serverless';

// Reads the connection string from Vercel's project Environment
// Variables (set via the dashboard) -- never committed to the repo.
const sql = neon(process.env.DATABASE_URL);

function setCors(res) {
  // The game is served from GitHub Pages, this function from Vercel --
  // different origins, so the browser needs an explicit CORS allow.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const game = typeof req.query.game === 'string' ? req.query.game : 'spaceship';
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

  try {
    const rows = await sql`
      select name, score, created_at
      from scores
      where game = ${game}
      order by score desc
      limit ${limit}
    `;
    res.status(200).json(rows);
  } catch (err) {
    console.error('leaderboard query failed', err);
    res.status(500).json({ error: 'query failed' });
  }
}
