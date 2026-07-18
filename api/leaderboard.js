const { Client } = require('pg');

module.exports = async (req, res) => {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Fallback to local server connection string if not provided in env
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    res.status(500).json({ error: "DATABASE_URL environment variable is missing." });
    return;
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        username VARCHAR(20) UNIQUE NOT NULL,
        score INT NOT NULL,
        date VARCHAR(20) NOT NULL
      );
    `);

    if (req.method === 'GET') {
      // Fetch top 10 scores
      const result = await client.query('SELECT username, score, date FROM scores ORDER BY score DESC, id ASC LIMIT 10');
      res.status(200).json(result.rows);
    } else if (req.method === 'POST') {
      // Submit score
      const { username, score } = req.body;
      if (!username || typeof score !== 'number') {
        res.status(400).json({ error: 'Username and score are required.' });
        return;
      }

      const trimmedUsername = username.trim().substring(0, 20);
      if (!trimmedUsername) {
        res.status(400).json({ error: 'Invalid username.' });
        return;
      }

      const dateStr = new Date().toLocaleDateString('id-ID');

      // Insert or update score if higher
      await client.query(`
        INSERT INTO scores (username, score, date)
        VALUES ($1, $2, $3)
        ON CONFLICT (username)
        DO UPDATE SET 
          score = CASE WHEN EXCLUDED.score > scores.score THEN EXCLUDED.score ELSE scores.score END,
          date = CASE WHEN EXCLUDED.score > scores.score THEN EXCLUDED.date ELSE scores.date END
      `, [trimmedUsername, score, dateStr]);

      // Fetch updated top 10 scores to return
      const result = await client.query('SELECT username, score, date FROM scores ORDER BY score DESC, id ASC LIMIT 10');
      res.status(200).json(result.rows);
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error("Neon DB error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore client disconnect errors
    }
  }
};
