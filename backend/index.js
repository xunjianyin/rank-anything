const express = require('express');
const cors = require('cors');
const { init, db } = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'rankanything_secret';
const JWT_EXPIRES_IN = '7d';

app.use(cors());
app.use(express.json());

// Initialize database
init();

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Rank-Anything Backend API');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// User registration
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (user) return res.status(400).json({ error: 'Email or username already exists.' });
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hash], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      const userId = this.lastID;
      const token = jwt.sign({ id: userId, username, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.json({ token, user: { id: userId, username, email } });
    });
  });
});

// User login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!user) return res.status(400).json({ error: 'Invalid email or password.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// JWT authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });
    req.user = user;
    next();
  });
}

// --- Topic Endpoints ---
// List all topics
app.get('/api/topics', (req, res) => {
  db.all('SELECT t.*, u.username as creator_username FROM topics t LEFT JOIN users u ON t.creator_id = u.id ORDER BY t.created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create a topic
app.post('/api/topics', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  db.run('INSERT INTO topics (name, creator_id) VALUES (?, ?)', [name, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    db.get('SELECT * FROM topics WHERE id = ?', [this.lastID], (err, topic) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(topic);
    });
  });
});
// Edit a topic (only creator)
app.put('/api/topics/:id', authenticateToken, (req, res) => {
  const { name } = req.body;
  const topicId = req.params.id;
  db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
    if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    db.run('UPDATE topics SET name = ? WHERE id = ?', [name, topicId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
});
// Delete a topic (only creator)
app.delete('/api/topics/:id', authenticateToken, (req, res) => {
  const topicId = req.params.id;
  db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
    if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    db.run('DELETE FROM topics WHERE id = ?', [topicId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
});

// --- Object Endpoints ---
// List objects in a topic
app.get('/api/topics/:topicId/objects', (req, res) => {
  const topicId = req.params.topicId;
  db.all('SELECT o.*, u.username as creator_username FROM objects o LEFT JOIN users u ON o.creator_id = u.id WHERE o.topic_id = ? ORDER BY o.created_at DESC', [topicId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create an object in a topic
app.post('/api/topics/:topicId/objects', authenticateToken, (req, res) => {
  const topicId = req.params.topicId;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  db.run('INSERT INTO objects (topic_id, name, creator_id) VALUES (?, ?, ?)', [topicId, name, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    db.get('SELECT * FROM objects WHERE id = ?', [this.lastID], (err, object) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(object);
    });
  });
});
// Edit an object (only creator)
app.put('/api/objects/:id', authenticateToken, (req, res) => {
  const { name } = req.body;
  const objectId = req.params.id;
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    db.run('UPDATE objects SET name = ? WHERE id = ?', [name, objectId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
});
// Delete an object (only creator)
app.delete('/api/objects/:id', authenticateToken, (req, res) => {
  const objectId = req.params.id;
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    db.run('DELETE FROM objects WHERE id = ?', [objectId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
});

// --- Tag Endpoints ---
// List all tags
app.get('/api/tags', (req, res) => {
  db.all('SELECT * FROM tags ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create a tag
app.post('/api/tags', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    db.get('SELECT * FROM tags WHERE name = ?', [name], (err, tag) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(tag);
    });
  });
});
// Assign tags to an object (replace all tags)
app.post('/api/objects/:objectId/tags', authenticateToken, (req, res) => {
  const objectId = req.params.objectId;
  const { tags } = req.body; // array of tag names
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags must be an array.' });
  // Only creator can edit tags
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    // Remove old tags
    db.run('DELETE FROM object_tags WHERE object_id = ?', [objectId], (err) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      // Insert new tags (create if not exist)
      const insertTags = tags.map(tagName => {
        return new Promise((resolve, reject) => {
          db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName], function(err) {
            if (err) return reject(err);
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tag) => {
              if (err) return reject(err);
              db.run('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)', [objectId, tag.id], function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });
      Promise.all(insertTags)
        .then(() => res.json({ success: true }))
        .catch(() => res.status(500).json({ error: 'Database error.' }));
    });
  });
});
// List tags for an object
app.get('/api/objects/:objectId/tags', (req, res) => {
  const objectId = req.params.objectId;
  db.all('SELECT t.* FROM tags t JOIN object_tags ot ON t.id = ot.tag_id WHERE ot.object_id = ?', [objectId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// List objects by tag
app.get('/api/tags/:tagName/objects', (req, res) => {
  const tagName = req.params.tagName;
  db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tag) => {
    if (err || !tag) return res.json([]);
    db.all('SELECT o.* FROM objects o JOIN object_tags ot ON o.id = ot.object_id WHERE ot.tag_id = ?', [tag.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(rows);
    });
  });
});

// --- Ratings & Reviews Endpoints ---
// List ratings/reviews for an object
app.get('/api/objects/:objectId/ratings', (req, res) => {
  const objectId = req.params.objectId;
  db.all('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.object_id = ? ORDER BY r.created_at DESC', [objectId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create or update a rating/review for an object (one per user per object)
app.post('/api/objects/:objectId/ratings', authenticateToken, (req, res) => {
  const objectId = req.params.objectId;
  const { rating, review } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5.' });
  // Daily limit: 64 ratings per user per day
  db.get(`SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND DATE(created_at) = DATE('now')`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (row.count >= 64) return res.status(403).json({ error: 'Daily rating limit reached.' });
    // Check if user already rated this object
    db.get('SELECT * FROM ratings WHERE object_id = ? AND user_id = ?', [objectId, req.user.id], (err, existing) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (existing) {
        // Update
        db.run('UPDATE ratings SET rating = ?, review = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [rating, review, existing.id], function(err) {
          if (err) return res.status(500).json({ error: 'Database error.' });
          db.get('SELECT * FROM ratings WHERE id = ?', [existing.id], (err, updated) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(updated);
          });
        });
      } else {
        // Create
        db.run('INSERT INTO ratings (object_id, user_id, rating, review) VALUES (?, ?, ?, ?)', [objectId, req.user.id, rating, review], function(err) {
          if (err) return res.status(500).json({ error: 'Database error.' });
          db.get('SELECT * FROM ratings WHERE id = ?', [this.lastID], (err, newRating) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(newRating);
          });
        });
      }
    });
  });
});

// --- Moderation Proposal & Voting Endpoints ---
// List all moderation proposals (optionally filter by status)
app.get('/api/moderation/proposals', authenticateToken, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT p.*, u.username as proposer_username FROM moderation_proposals p LEFT JOIN users u ON p.proposer_id = u.id';
  const params = [];
  if (status) {
    sql += ' WHERE p.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY p.created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create a moderation proposal
app.post('/api/moderation/proposals', authenticateToken, (req, res) => {
  const { type, target_type, target_id, new_value, reason } = req.body;
  if (!type || !target_type || !target_id) return res.status(400).json({ error: 'Missing required fields.' });
  db.run('INSERT INTO moderation_proposals (type, target_type, target_id, proposer_id, new_value, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [type, target_type, target_id, req.user.id, new_value, reason], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      db.get('SELECT * FROM moderation_proposals WHERE id = ?', [this.lastID], (err, proposal) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(proposal);
      });
    });
});
// Vote on a proposal
app.post('/api/moderation/proposals/:id/vote', authenticateToken, (req, res) => {
  const proposalId = req.params.id;
  const { vote } = req.body; // 1 for approve, 0 for reject
  if (vote !== 1 && vote !== 0) return res.status(400).json({ error: 'Vote must be 1 or 0.' });
  // Prevent double voting
  db.get('SELECT * FROM votes WHERE proposal_id = ? AND user_id = ?', [proposalId, req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (existing) return res.status(400).json({ error: 'Already voted.' });
    db.run('INSERT INTO votes (proposal_id, user_id, vote) VALUES (?, ?, ?)', [proposalId, req.user.id, vote], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
});
// Execute a proposal (if majority approves)
app.post('/api/moderation/proposals/:id/execute', authenticateToken, (req, res) => {
  const proposalId = req.params.id;
  db.get('SELECT * FROM moderation_proposals WHERE id = ?', [proposalId], (err, proposal) => {
    if (err || !proposal) return res.status(404).json({ error: 'Proposal not found.' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: 'Proposal already executed.' });
    // Count votes
    db.all('SELECT vote FROM votes WHERE proposal_id = ?', [proposalId], (err, votes) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      const total = votes.length;
      const approves = votes.filter(v => v.vote === 1).length;
      if (total === 0 || approves <= total / 2) {
        return res.status(400).json({ error: 'Not enough approvals.' });
      }
      // Execute action
      let sql, params;
      if (proposal.type === 'delete') {
        if (proposal.target_type === 'topic') {
          sql = 'DELETE FROM topics WHERE id = ?'; params = [proposal.target_id];
        } else if (proposal.target_type === 'object') {
          sql = 'DELETE FROM objects WHERE id = ?'; params = [proposal.target_id];
        } else if (proposal.target_type === 'rating') {
          sql = 'DELETE FROM ratings WHERE id = ?'; params = [proposal.target_id];
        }
      } else if (proposal.type === 'edit') {
        if (proposal.target_type === 'topic') {
          sql = 'UPDATE topics SET name = ? WHERE id = ?'; params = [proposal.new_value, proposal.target_id];
        } else if (proposal.target_type === 'object') {
          sql = 'UPDATE objects SET name = ? WHERE id = ?'; params = [proposal.new_value, proposal.target_id];
        } else if (proposal.target_type === 'rating') {
          sql = 'UPDATE ratings SET review = ? WHERE id = ?'; params = [proposal.new_value, proposal.target_id];
        }
      }
      if (!sql) return res.status(400).json({ error: 'Invalid proposal type/target.' });
      db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        db.run('UPDATE moderation_proposals SET status = ? WHERE id = ?', ['approved', proposalId], function(err) {
          if (err) return res.status(500).json({ error: 'Database error.' });
          res.json({ success: true });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
}); 