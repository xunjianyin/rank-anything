const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, 'rankanything.db'));

// Initialize tables
const init = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS object_tags (
      object_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (object_id, tag_id),
      FOREIGN KEY (object_id) REFERENCES objects(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS topic_tags (
      topic_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (topic_id, tag_id),
      FOREIGN KEY (topic_id) REFERENCES topics(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      review TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (object_id) REFERENCES objects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS moderation_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- edit/delete
      target_type TEXT NOT NULL, -- topic/object/rating/review
      target_id INTEGER NOT NULL,
      proposer_id INTEGER NOT NULL,
      new_value TEXT, -- for edits
      reason TEXT,
      status TEXT DEFAULT 'pending', -- pending/approved/rejected
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposer_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      vote INTEGER NOT NULL, -- 1 for approve, 0 for reject
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES moderation_proposals(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // User ratings table for likes/dislikes
    db.run(`CREATE TABLE IF NOT EXISTS user_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rated_user_id INTEGER NOT NULL,
      rater_user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating IN (1, -1)), -- 1 for like, -1 for dislike
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rated_user_id) REFERENCES users(id),
      FOREIGN KEY (rater_user_id) REFERENCES users(id),
      UNIQUE(rated_user_id, rater_user_id)
    )`);

    // User restrictions table for tracking editing bans
    db.run(`CREATE TABLE IF NOT EXISTS user_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      restriction_type TEXT NOT NULL, -- 'editing_ban'
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Pending registrations table (for users who haven't verified email yet)
    db.run(`CREATE TABLE IF NOT EXISTS pending_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      verification_code TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT (datetime('now', '+24 hours'))
    )`);

    // Email verification table (for existing users)
    db.run(`CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      verification_code TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Add email verification columns to users table
    db.run(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });
    
    // Add is_admin column if it doesn't exist (migration)
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });

    // Create default admin user if it doesn't exist
    const bcrypt = require('bcryptjs');
    const adminPassword = bcrypt.hashSync('202505262142', 10);
    
    db.get('SELECT * FROM users WHERE username = ?', ['Admin'], (err, user) => {
      if (err) {
        console.error('Error checking for admin user:', err);
        return;
      }
      
      if (!user) {
        // Create admin user
        db.run('INSERT INTO users (username, email, password, is_admin, email_verified) VALUES (?, ?, ?, ?, ?)', 
          ['Admin', 'admin@system.local', adminPassword, 1, 1], function(err) {
            if (err) {
              console.error('Error creating admin user:', err);
            } else {
              console.log('Default admin user created successfully');
            }
          });
      } else if (!user.is_admin) {
        // Update existing Admin user to be admin
        db.run('UPDATE users SET is_admin = 1 WHERE username = ?', ['Admin'], (err) => {
          if (err) {
            console.error('Error updating admin user:', err);
          } else {
            console.log('Admin user updated to have admin privileges');
          }
        });
      }
    });

    // Edit history table to track who has edited topics and objects
    db.run(`CREATE TABLE IF NOT EXISTS edit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL, -- 'topic' or 'object'
      target_id INTEGER NOT NULL,
      editor_id INTEGER NOT NULL,
      action_type TEXT NOT NULL, -- 'create', 'edit', 'delete'
      old_value TEXT, -- JSON string of old values
      new_value TEXT, -- JSON string of new values
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (editor_id) REFERENCES users(id)
    )`);

    // Clean up expired pending registrations on startup
    db.run('DELETE FROM pending_registrations WHERE expires_at <= datetime("now")', (err) => {
      if (err) {
        console.error('Error cleaning up expired registrations:', err);
      } else {
        console.log('Cleaned up expired pending registrations');
      }
    });
  });
};

module.exports = { db, init };
