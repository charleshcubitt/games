import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Validate rather than trust the client -- this endpoint is public.
  const game = typeof body.game === 'string' && body.game.length <= 32 ? body.game : 'spaceship';
  const name = typeof body.name === 'string' ? body.name.slice(0, 3).toUpperCase() : '';
  const score = Number.isInteger(body.score) ? body.score : NaN;

  if (!name || !Number.isFinite(score) || score < 0 || score > 10_000_000) {
    return res.status(400).json({ error: 'invalid name/score' });
  }

  try {
    await sql`
      insert into scores (game, name, score)
      values (${game}, ${name}, ${score})
    `;
    const top = await sql`
      select name, score, created_at
      from scores
      where game = ${game}
      order by score desc
      limit 10
    `;
    res.status(200).json(top);
  } catch (err) {
    console.error('score insert failed', err);
    res.status(500).json({ error: 'insert failed' });
  }
}
