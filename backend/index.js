const express = require('express');
const cors = require('cors');
const { init, db } = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const ContentFilter = require('./contentFilter');

const app = express();
const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'rankanything_secret';
const JWT_EXPIRES_IN = '7d';

// Initialize content filter
const contentFilter = new ContentFilter();

// Email configuration
const EMAIL_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'arvidyin@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password' // Use app password for Gmail
  }
};

// Create email transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Password validation function
function validatePassword(password) {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: 'Password must contain both letters and numbers' };
  }
  
  return { valid: true };
}

// Generate verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

// Send verification email
async function sendVerificationEmail(email, code, username) {
  const mailOptions = {
    from: 'arvidyin@gmail.com',
    to: email,
    subject: 'Rank-Anything Email Verification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">Welcome to Rank-Anything!</h2>
        <p>Hello ${username},</p>
        <p>Thank you for registering with Rank-Anything. Please use the following verification code to complete your registration:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 4px;">${code}</h1>
        </div>
        <p>This verification code is valid for your account and will remain active until a new code is generated.</p>
        <p>If you didn't create an account with us, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #718096; font-size: 14px;">Best regards,<br>The Rank-Anything Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

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
app.post('/api/register', validateContent, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (user) return res.status(400).json({ error: 'Email or username already exists.' });
    
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)', 
      [username, email, hash, 0], async function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        const userId = this.lastID;
        
        // Generate and store verification code
        const verificationCode = generateVerificationCode();
        db.run('INSERT INTO email_verifications (user_id, verification_code) VALUES (?, ?)', 
          [userId, verificationCode], async (err) => {
            if (err) {
              console.error('Error storing verification code:', err);
              return res.status(500).json({ error: 'Database error.' });
            }
            
            // Send verification email
            const emailResult = await sendVerificationEmail(email, verificationCode, username);
            if (!emailResult.success) {
              console.error('Failed to send verification email:', emailResult.error);
              return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
            }
            
            res.json({ 
              message: 'Registration successful! Please check your email for verification code.',
              userId: userId,
              requiresVerification: true
            });
          });
      });
  });
});

// Email verification
app.post('/api/verify-email', (req, res) => {
  const { userId, verificationCode } = req.body;
  if (!userId || !verificationCode) {
    return res.status(400).json({ error: 'User ID and verification code are required.' });
  }

  // Check if verification code is valid
  db.get('SELECT * FROM email_verifications WHERE user_id = ? AND verification_code = ?', 
    [userId, verificationCode], (err, verification) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (!verification) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }

      // Update user as verified
      db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error.' });

        // Get user details for token
        db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          
          const token = jwt.sign({ 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            isAdmin: !!user.is_admin 
          }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
          
          res.json({ 
            token, 
            user: { 
              id: user.id, 
              username: user.username, 
              email: user.email, 
              isAdmin: !!user.is_admin,
              emailVerified: true
            },
            message: 'Email verified successfully!'
          });
        });
      });
    });
});

// Resend verification code
app.post('/api/resend-verification', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  // Check rate limiting (1 hour)
  db.get('SELECT * FROM email_verifications WHERE user_id = ?', [userId], async (err, verification) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    
    if (verification) {
      const lastSent = new Date(verification.last_sent_at);
      const now = new Date();
      const hoursSinceLastSent = (now - lastSent) / (1000 * 60 * 60);
      
      if (hoursSinceLastSent < 1) {
        const minutesRemaining = Math.ceil((60 - (hoursSinceLastSent * 60)));
        return res.status(429).json({ 
          error: `Please wait ${minutesRemaining} minutes before requesting another verification code.` 
        });
      }
    }

    // Get user details
    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (!user) return res.status(404).json({ error: 'User not found.' });
      
      if (user.email_verified) {
        return res.status(400).json({ error: 'Email is already verified.' });
      }

      // Generate new verification code
      const verificationCode = generateVerificationCode();
      
      // Update or insert verification code
      if (verification) {
        db.run('UPDATE email_verifications SET verification_code = ?, last_sent_at = CURRENT_TIMESTAMP WHERE user_id = ?', 
          [verificationCode, userId], async (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            const emailResult = await sendVerificationEmail(user.email, verificationCode, user.username);
            if (!emailResult.success) {
              return res.status(500).json({ error: 'Failed to send verification email.' });
            }
            
            res.json({ message: 'Verification code sent successfully!' });
          });
      } else {
        db.run('INSERT INTO email_verifications (user_id, verification_code) VALUES (?, ?)', 
          [userId, verificationCode], async (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            const emailResult = await sendVerificationEmail(user.email, verificationCode, user.username);
            if (!emailResult.success) {
              return res.status(500).json({ error: 'Failed to send verification email.' });
            }
            
            res.json({ message: 'Verification code sent successfully!' });
          });
      }
    });
  });
});


// User login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  // Allow login with either email or username
  db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, email], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!user) return res.status(400).json({ error: 'Invalid email/username or password.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Invalid email/username or password.' });
    }
    
    // Check if email is verified (skip for admin user)
    if (!user.email_verified && user.username !== 'Admin') {
      return res.status(403).json({ 
        error: 'Please verify your email before logging in.',
        requiresVerification: true,
        userId: user.id
      });
    }
    
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      isAdmin: !!user.is_admin 
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        isAdmin: !!user.is_admin,
        emailVerified: !!user.email_verified
      } 
    });
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

// Content filtering middleware
function validateContent(req, res, next) {
  const fieldsToCheck = ['name', 'review', 'reason', 'new_value', 'username'];
  const violations = [];
  
  for (const field of fieldsToCheck) {
    if (req.body[field]) {
      const result = contentFilter.checkContent(req.body[field]);
      if (!result.isClean) {
        violations.push({
          field,
          violations: result.violations,
          message: contentFilter.generateErrorMessage(result.violations)
        });
      }
    }
  }
  
  // Check tags array if present
  if (req.body.tags && Array.isArray(req.body.tags)) {
    for (let i = 0; i < req.body.tags.length; i++) {
      const result = contentFilter.checkContent(req.body.tags[i]);
      if (!result.isClean) {
        violations.push({
          field: `tags[${i}]`,
          violations: result.violations,
          message: contentFilter.generateErrorMessage(result.violations)
        });
      }
    }
  }
  
  if (violations.length > 0) {
    console.log('Content filter violations:', JSON.stringify(violations, null, 2));
    return res.status(400).json({ 
      error: 'Content contains inappropriate material. Please revise your text and try again.',
      violations: violations.map(v => ({ field: v.field, message: v.message }))
    });
  }
  
  next();
}

// Helper function to validate content and return result
function checkContentSafety(text) {
  return contentFilter.checkContent(text);
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
app.post('/api/topics', authenticateToken, validateContent, (req, res) => {
  const { name, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  
  // Check if user is restricted from editing
  db.get(`
    SELECT * FROM user_restrictions 
    WHERE user_id = ? AND restriction_type = 'editing_ban' 
    AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
  `, [req.user.id], (err, restriction) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (restriction) {
      return res.status(403).json({ 
        error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
      });
    }
    
    db.run('INSERT INTO topics (name, creator_id) VALUES (?, ?)', [name, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    const topicId = this.lastID;
    
    // Add tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const insertTags = tags.map(tagName => {
        return new Promise((resolve, reject) => {
          db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName], function(err) {
            if (err) return reject(err);
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tag) => {
              if (err) return reject(err);
              db.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id], function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });
      
      Promise.all(insertTags)
        .then(() => {
          db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            res.json(topic);
          });
        })
        .catch(() => res.status(500).json({ error: 'Database error.' }));
    } else {
      db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(topic);
      });
    }
  });
  });
});
// Edit a topic (only creator or admin)
app.put('/api/topics/:id', authenticateToken, validateContent, (req, res) => {
  const { name, tags } = req.body;
  const topicId = req.params.id;
  
  // Check if user is restricted from editing (unless admin)
  if (!req.user.isAdmin) {
    db.get(`
      SELECT * FROM user_restrictions 
      WHERE user_id = ? AND restriction_type = 'editing_ban' 
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    `, [req.user.id], (err, restriction) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (restriction) {
        return res.status(403).json({ 
          error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
        });
      }
      
      performTopicEdit();
    });
  } else {
    performTopicEdit();
  }
  
  function performTopicEdit() {
    db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
      if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
      if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
    
    db.run('UPDATE topics SET name = ? WHERE id = ?', [name, topicId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      // Update tags if provided
      if (tags && Array.isArray(tags)) {
        // Remove old tags
        db.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId], (err) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          
          // Insert new tags (create if not exist)
          if (tags.length > 0) {
            const insertTags = tags.map(tagName => {
              return new Promise((resolve, reject) => {
                db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName], function(err) {
                  if (err) return reject(err);
                  db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tag) => {
                    if (err) return reject(err);
                    db.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id], function(err) {
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
          } else {
            res.json({ success: true });
          }
        });
      } else {
        res.json({ success: true });
      }
    });
  });
  }
});
// Delete a topic (only creator or admin)
app.delete('/api/topics/:id', authenticateToken, (req, res) => {
  const topicId = req.params.id;
  db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
    if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
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
app.post('/api/topics/:topicId/objects', authenticateToken, validateContent, (req, res) => {
  const topicId = req.params.topicId;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  
  // Check if user is restricted from editing
  db.get(`
    SELECT * FROM user_restrictions 
    WHERE user_id = ? AND restriction_type = 'editing_ban' 
    AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
  `, [req.user.id], (err, restriction) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (restriction) {
      return res.status(403).json({ 
        error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
      });
    }
  
  db.run('INSERT INTO objects (topic_id, name, creator_id) VALUES (?, ?, ?)', [topicId, name, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    const objectId = this.lastID;
    
    // Inherit tags from topic
    db.all('SELECT tag_id FROM topic_tags WHERE topic_id = ?', [topicId], (err, topicTags) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      if (topicTags.length > 0) {
        const inheritTags = topicTags.map(topicTag => {
          return new Promise((resolve, reject) => {
            db.run('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)', [objectId, topicTag.tag_id], function(err) {
              if (err) return reject(err);
              resolve();
            });
          });
        });
        
        Promise.all(inheritTags)
          .then(() => {
            db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
              if (err) return res.status(500).json({ error: 'Database error.' });
              res.json(object);
            });
          })
          .catch(() => res.status(500).json({ error: 'Database error.' }));
      } else {
        db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          res.json(object);
        });
      }
    });
  });
  });
});
// Edit an object (only creator or admin)
app.put('/api/objects/:id', authenticateToken, validateContent, (req, res) => {
  const { name } = req.body;
  const objectId = req.params.id;
  
  // Check if user is restricted from editing (unless admin)
  if (!req.user.isAdmin) {
    db.get(`
      SELECT * FROM user_restrictions 
      WHERE user_id = ? AND restriction_type = 'editing_ban' 
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    `, [req.user.id], (err, restriction) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (restriction) {
        return res.status(403).json({ 
          error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
        });
      }
      
      performObjectEdit();
    });
  } else {
    performObjectEdit();
  }
  
  function performObjectEdit() {
    db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
      if (err || !object) return res.status(404).json({ error: 'Object not found.' });
      if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
    db.run('UPDATE objects SET name = ? WHERE id = ?', [name, objectId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
  });
  }
});
// Delete an object (only creator or admin)
app.delete('/api/objects/:id', authenticateToken, (req, res) => {
  const objectId = req.params.id;
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
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
app.post('/api/tags', authenticateToken, validateContent, (req, res) => {
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
app.post('/api/objects/:objectId/tags', authenticateToken, validateContent, (req, res) => {
  const objectId = req.params.objectId;
  const { tags } = req.body; // array of tag names
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags must be an array.' });
  // Only creator or admin can edit tags
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
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

// --- Topic Tag Endpoints ---
// Assign tags to a topic (replace all tags)
app.post('/api/topics/:topicId/tags', authenticateToken, validateContent, (req, res) => {
  const topicId = req.params.topicId;
  const { tags } = req.body; // array of tag names
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags must be an array.' });
  
  // Only creator or admin can edit tags
  db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
    if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
    
    // Remove old tags
    db.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId], (err) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      // Insert new tags (create if not exist)
      const insertTags = tags.map(tagName => {
        return new Promise((resolve, reject) => {
          db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName], function(err) {
            if (err) return reject(err);
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tag) => {
              if (err) return reject(err);
              db.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id], function(err) {
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

// List tags for a topic
app.get('/api/topics/:topicId/tags', (req, res) => {
  const topicId = req.params.topicId;
  db.all('SELECT t.* FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ?', [topicId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
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
// Create or update a rating/review for an object (one per user per object per day)
app.post('/api/objects/:objectId/ratings', authenticateToken, validateContent, (req, res) => {
  const objectId = req.params.objectId;
  const { rating, review } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5.' });
  
  // Check if user already rated this object
  db.get('SELECT * FROM ratings WHERE object_id = ? AND user_id = ?', [objectId, req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    
    if (existing) {
      // Check if user already modified this rating today
      db.get(`SELECT COUNT(*) as count FROM ratings WHERE object_id = ? AND user_id = ? AND DATE(updated_at) = DATE('now')`, 
        [objectId, req.user.id], (err, row) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          if (row.count > 0 && existing.updated_at !== existing.created_at) {
            return res.status(403).json({ error: 'You can only modify your rating once per day.' });
          }
          
          // Update existing rating
          db.run('UPDATE ratings SET rating = ?, review = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
            [rating, review, existing.id], function(err) {
              if (err) return res.status(500).json({ error: 'Database error.' });
              db.get('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', 
                [existing.id], (err, updated) => {
                  if (err) return res.status(500).json({ error: 'Database error.' });
                  res.json({ ...updated, isUpdate: true });
                });
            });
        });
    } else {
      // Check daily limit for new ratings
      db.get(`SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND DATE(created_at) = DATE('now')`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (row.count >= 64) return res.status(403).json({ error: 'Daily rating limit reached (64 new ratings per day).' });
        
        // Create new rating
        db.run('INSERT INTO ratings (object_id, user_id, rating, review) VALUES (?, ?, ?, ?)', 
          [objectId, req.user.id, rating, review], function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            db.get('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', 
              [this.lastID], (err, newRating) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                res.json({ ...newRating, isUpdate: false });
              });
          });
      });
    }
  });
});

// Get current user's rating for an object
app.get('/api/objects/:objectId/my-rating', authenticateToken, (req, res) => {
  const objectId = req.params.objectId;
  
  db.get('SELECT * FROM ratings WHERE object_id = ? AND user_id = ?', [objectId, req.user.id], (err, rating) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ rating: rating || null });
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
app.post('/api/moderation/proposals', authenticateToken, validateContent, (req, res) => {
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

// --- Admin Endpoints ---
// List all users (admin only)
app.get('/api/admin/users', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  db.all('SELECT id, username, email, is_admin, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

// Update user (admin only)
app.put('/api/admin/users/:id', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const { username, email, is_admin } = req.body;
  const userId = req.params.id;
  
  db.run('UPDATE users SET username = ?, email = ?, is_admin = ? WHERE id = ?', 
    [username, email, is_admin ? 1 : 0, userId], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json({ success: true });
    });
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const userId = req.params.id;
  
  // Don't allow deleting yourself
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  }
  
  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ success: true });
  });
});

// Admin approve/reject proposal directly
app.post('/api/admin/proposals/:id/approve', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const proposalId = req.params.id;
  
  db.get('SELECT * FROM moderation_proposals WHERE id = ?', [proposalId], (err, proposal) => {
    if (err || !proposal) return res.status(404).json({ error: 'Proposal not found.' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: 'Proposal already processed.' });
    
    // Execute the proposal directly
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

// Admin reject proposal
app.post('/api/admin/proposals/:id/reject', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const proposalId = req.params.id;
  
  db.run('UPDATE moderation_proposals SET status = ? WHERE id = ?', ['rejected', proposalId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ success: true });
  });
});

// --- User Statistics Endpoints ---
// Get user statistics and activity
app.get('/api/users/:id/stats', authenticateToken, (req, res) => {
  const userId = req.params.id;
  
  // Only allow users to view their own stats or admin to view any
  if (parseInt(userId) !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  
  const stats = {};
  
  // Get total counts
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM topics WHERE creator_id = ?) as total_topics,
      (SELECT COUNT(*) FROM objects WHERE creator_id = ?) as total_objects,
      (SELECT COUNT(*) FROM ratings WHERE user_id = ?) as total_ratings,
      (SELECT COUNT(*) FROM moderation_proposals WHERE proposer_id = ?) as total_proposals,
      (SELECT COUNT(*) FROM votes WHERE user_id = ?) as total_votes
  `, [userId, userId, userId, userId, userId], (err, counts) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    stats.totals = counts;
    
    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Topics created
    db.all(`
      SELECT 'topic_created' as type, name as item_name, created_at as timestamp
      FROM topics 
      WHERE creator_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `, [userId, thirtyDaysAgo], (err, topicActivity) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      // Objects created
      db.all(`
        SELECT 'object_created' as type, o.name as item_name, o.created_at as timestamp, t.name as topic_name
        FROM objects o
        LEFT JOIN topics t ON o.topic_id = t.id
        WHERE o.creator_id = ? AND o.created_at >= ?
        ORDER BY o.created_at DESC
      `, [userId, thirtyDaysAgo], (err, objectActivity) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        // Ratings submitted
        db.all(`
          SELECT 'rating_submitted' as type, o.name as item_name, r.created_at as timestamp, 
                 r.rating, r.review, t.name as topic_name
          FROM ratings r
          LEFT JOIN objects o ON r.object_id = o.id
          LEFT JOIN topics t ON o.topic_id = t.id
          WHERE r.user_id = ? AND r.created_at >= ?
          ORDER BY r.created_at DESC
        `, [userId, thirtyDaysAgo], (err, ratingActivity) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          
                  // Proposals created
        db.all(`
          SELECT 'proposal_created' as type, type as proposal_type, target_type, 
                 created_at as timestamp, status, reason, target_id, new_value
          FROM moderation_proposals
          WHERE proposer_id = ? AND created_at >= ?
          ORDER BY created_at DESC
        `, [userId, thirtyDaysAgo], (err, proposalActivity) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            // Votes cast
            db.all(`
              SELECT 'vote_cast' as type, v.created_at as timestamp, v.vote,
                     mp.type as proposal_type, mp.target_type
              FROM votes v
              LEFT JOIN moderation_proposals mp ON v.proposal_id = mp.id
              WHERE v.user_id = ? AND v.created_at >= ?
              ORDER BY v.created_at DESC
            `, [userId, thirtyDaysAgo], (err, voteActivity) => {
              if (err) return res.status(500).json({ error: 'Database error.' });
              
              // Combine all activities
              const allActivity = [
                ...topicActivity,
                ...objectActivity,
                ...ratingActivity,
                ...proposalActivity,
                ...voteActivity
              ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              
              stats.recent_activity = allActivity;
              
              // Get daily activity counts for the last 7 days
              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
              
              db.all(`
                SELECT DATE(created_at) as date, COUNT(*) as count, 'topics' as type
                FROM topics 
                WHERE creator_id = ? AND created_at >= ?
                GROUP BY DATE(created_at)
                UNION ALL
                SELECT DATE(created_at) as date, COUNT(*) as count, 'objects' as type
                FROM objects 
                WHERE creator_id = ? AND created_at >= ?
                GROUP BY DATE(created_at)
                UNION ALL
                SELECT DATE(created_at) as date, COUNT(*) as count, 'ratings' as type
                FROM ratings 
                WHERE user_id = ? AND created_at >= ?
                GROUP BY DATE(created_at)
                ORDER BY date DESC
              `, [userId, sevenDaysAgo, userId, sevenDaysAgo, userId, sevenDaysAgo], (err, dailyStats) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                
                stats.daily_activity = dailyStats;
                res.json(stats);
              });
            });
          });
        });
      });
    });
  });
});

// Update user profile
app.put('/api/users/:id/profile', authenticateToken, validateContent, (req, res) => {
  const userId = req.params.id;
  const { username, email, currentPassword, newPassword } = req.body;
  
  // Only allow users to update their own profile or admin to update any
  if (parseInt(userId) !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required.' });
  }
  
  // If password update is requested, validate it
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change password.' });
    }
    
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }
  }
  
  // Get current user data to verify current password if needed
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, currentUser) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!currentUser) return res.status(404).json({ error: 'User not found.' });
    
    // Verify current password if password change is requested
    if (newPassword && !bcrypt.compareSync(currentPassword, currentUser.password)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    
    // Check for duplicate username/email (excluding current user)
    db.get('SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?', 
      [username, email, userId], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (existing) {
          return res.status(400).json({ error: 'Username or email already exists.' });
        }
        
        // Prepare update query
        let updateQuery = 'UPDATE users SET username = ?, email = ?';
        let updateParams = [username, email];
        
        if (newPassword) {
          const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
          updateQuery += ', password = ?';
          updateParams.push(hashedNewPassword);
        }
        
        updateQuery += ' WHERE id = ?';
        updateParams.push(userId);
        
        db.run(updateQuery, updateParams, function(err) {
          if (err) return res.status(500).json({ error: 'Database error.' });
          
          // Return updated user info
          db.get('SELECT id, username, email, is_admin, email_verified FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            // Generate new token with updated info
            const token = jwt.sign({ 
              id: user.id, 
              username: user.username, 
              email: user.email, 
              isAdmin: !!user.is_admin 
            }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            
            res.json({ 
              success: true, 
              user: { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                isAdmin: !!user.is_admin,
                emailVerified: !!user.email_verified
              },
              token,
              message: newPassword ? 'Profile and password updated successfully!' : 'Profile updated successfully!'
            });
          });
        });
      });
  });
});

// --- User Profile and Rating Endpoints ---

// Get public user profile
app.get('/api/users/:id/profile', (req, res) => {
  const userId = req.params.id;
  
  db.get(`
    SELECT u.id, u.username, u.created_at,
           (SELECT COUNT(*) FROM topics WHERE creator_id = u.id) as topic_count,
           (SELECT COUNT(*) FROM objects WHERE creator_id = u.id) as object_count,
           (SELECT COUNT(*) FROM ratings WHERE user_id = u.id) as rating_count,
           (SELECT COUNT(*) FROM user_ratings WHERE rated_user_id = u.id AND rating = 1) as likes,
           (SELECT COUNT(*) FROM user_ratings WHERE rated_user_id = u.id AND rating = -1) as dislikes
    FROM users u 
    WHERE u.id = ?
  `, [userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    
    // Check if user is currently restricted
    db.get(`
      SELECT * FROM user_restrictions 
      WHERE user_id = ? AND restriction_type = 'editing_ban' 
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    `, [userId], (err, restriction) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      user.is_restricted = !!restriction;
      user.restriction_end = restriction ? restriction.end_date : null;
      
      res.json(user);
    });
  });
});

// Rate a user (like/dislike) - one rating per user per day
app.post('/api/users/:id/rate', authenticateToken, (req, res) => {
  const ratedUserId = req.params.id;
  const { rating } = req.body; // 1 for like, -1 for dislike
  
  if (rating !== 1 && rating !== -1) {
    return res.status(400).json({ error: 'Rating must be 1 (like) or -1 (dislike).' });
  }
  
  if (parseInt(ratedUserId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot rate yourself.' });
  }
  
  // Check if user exists
  db.get('SELECT id FROM users WHERE id = ?', [ratedUserId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    
    // Check if user already has a rating for this user
    db.get('SELECT * FROM user_ratings WHERE rated_user_id = ? AND rater_user_id = ?', 
      [ratedUserId, req.user.id], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        if (existing) {
          // Check if user already modified this rating today
          db.get(`SELECT COUNT(*) as count FROM user_ratings WHERE rated_user_id = ? AND rater_user_id = ? AND DATE(updated_at) = DATE('now')`, 
            [ratedUserId, req.user.id], (err, row) => {
              if (err) return res.status(500).json({ error: 'Database error.' });
              if (row.count > 0 && existing.updated_at !== existing.created_at) {
                return res.status(403).json({ error: 'You can only modify your user rating once per day.' });
              }
              
              // Update existing rating
              db.run(`UPDATE user_ratings SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE rated_user_id = ? AND rater_user_id = ?`, 
                [rating, ratedUserId, req.user.id], function(err) {
                  if (err) return res.status(500).json({ error: 'Database error.' });
                  
                  // Check if user should be restricted due to dislikes
                  db.get(`SELECT COUNT(*) as dislike_count FROM user_ratings WHERE rated_user_id = ? AND rating = -1`, 
                    [ratedUserId], (err, result) => {
                      if (err) return res.status(500).json({ error: 'Database error.' });
                      
                      const dislikeCount = result.dislike_count;
                      
                      // For every 5 dislikes, ban for 1 day
                      if (dislikeCount > 0 && dislikeCount % 5 === 0) {
                        const startDate = new Date().toISOString();
                        const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day from now
                        
                        // Check if there's already an active restriction
                        db.get(`
                          SELECT * FROM user_restrictions 
                          WHERE user_id = ? AND restriction_type = 'editing_ban' 
                          AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
                        `, [ratedUserId], (err, existingRestriction) => {
                          if (err) return res.status(500).json({ error: 'Database error.' });
                          
                          if (!existingRestriction) {
                            // Add new restriction
                            db.run(`
                              INSERT INTO user_restrictions (user_id, restriction_type, start_date, end_date, reason)
                              VALUES (?, 'editing_ban', ?, ?, ?)
                            `, [ratedUserId, startDate, endDate, `Automatic ban due to ${dislikeCount} dislikes`], (err) => {
                              if (err) console.error('Error creating restriction:', err);
                            });
                          }
                        });
                      }
                      
                      res.json({ success: true, dislike_count: dislikeCount, isUpdate: true });
                    });
                });
            });
        } else {
          // Check daily limit for new user ratings
          db.get(`SELECT COUNT(*) as count FROM user_ratings WHERE rater_user_id = ? AND DATE(created_at) = DATE('now')`, 
            [req.user.id], (err, row) => {
              if (err) return res.status(500).json({ error: 'Database error.' });
              if (row.count >= 32) return res.status(403).json({ error: 'Daily user rating limit reached (32 new user ratings per day).' });
              
              // Create new rating
              db.run(`INSERT INTO user_ratings (rated_user_id, rater_user_id, rating, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, 
                [ratedUserId, req.user.id, rating], function(err) {
                  if (err) return res.status(500).json({ error: 'Database error.' });
                  
                  // Check if user should be restricted due to dislikes
                  db.get(`SELECT COUNT(*) as dislike_count FROM user_ratings WHERE rated_user_id = ? AND rating = -1`, 
                    [ratedUserId], (err, result) => {
                      if (err) return res.status(500).json({ error: 'Database error.' });
                      
                      const dislikeCount = result.dislike_count;
                      
                      // For every 5 dislikes, ban for 1 day
                      if (dislikeCount > 0 && dislikeCount % 5 === 0) {
                        const startDate = new Date().toISOString();
                        const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day from now
                        
                        // Check if there's already an active restriction
                        db.get(`
                          SELECT * FROM user_restrictions 
                          WHERE user_id = ? AND restriction_type = 'editing_ban' 
                          AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
                        `, [ratedUserId], (err, existingRestriction) => {
                          if (err) return res.status(500).json({ error: 'Database error.' });
                          
                          if (!existingRestriction) {
                            // Add new restriction
                            db.run(`
                              INSERT INTO user_restrictions (user_id, restriction_type, start_date, end_date, reason)
                              VALUES (?, 'editing_ban', ?, ?, ?)
                            `, [ratedUserId, startDate, endDate, `Automatic ban due to ${dislikeCount} dislikes`], (err) => {
                              if (err) console.error('Error creating restriction:', err);
                            });
                          }
                        });
                      }
                      
                      res.json({ success: true, dislike_count: dislikeCount, isUpdate: false });
                    });
                });
            });
        }
      });
  });
});

// Get user's current rating from the requesting user
app.get('/api/users/:id/my-rating', authenticateToken, (req, res) => {
  const ratedUserId = req.params.id;
  
  db.get(`
    SELECT rating FROM user_ratings 
    WHERE rated_user_id = ? AND rater_user_id = ?
  `, [ratedUserId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ rating: result ? result.rating : null });
  });
});

// Check if user is currently restricted from editing
app.get('/api/users/:id/restrictions', authenticateToken, (req, res) => {
  const userId = req.params.id;
  
  // Only allow users to check their own restrictions or admin to check any
  if (parseInt(userId) !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  
  db.get(`
    SELECT * FROM user_restrictions 
    WHERE user_id = ? AND restriction_type = 'editing_ban' 
    AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    ORDER BY end_date DESC LIMIT 1
  `, [userId], (err, restriction) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    
    res.json({ 
      is_restricted: !!restriction,
      restriction: restriction || null
    });
  });
});

// --- Content Filter Management Endpoints (Admin Only) ---

// Get content filter categories and word counts
app.get('/api/admin/content-filter', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const categories = contentFilter.getCategories();
  const summary = {};
  
  for (const category of categories) {
    const words = contentFilter.getSensitiveWords(category);
    summary[category] = {
      count: words.length,
      words: words.slice(0, 10) // Show first 10 words as preview
    };
  }
  
  res.json(summary);
});

// Get all words for a specific category
app.get('/api/admin/content-filter/:category', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const category = req.params.category;
  const words = contentFilter.getSensitiveWords(category);
  
  if (words.length === 0) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  
  res.json({ category, words });
});

// Add words to a category
app.post('/api/admin/content-filter/:category/words', authenticateToken, validateContent, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const category = req.params.category;
  const { words } = req.body;
  
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Words array is required.' });
  }
  
  // Validate that words don't contain sensitive content themselves
  for (const word of words) {
    if (typeof word !== 'string' || word.trim().length === 0) {
      return res.status(400).json({ error: 'All words must be non-empty strings.' });
    }
  }
  
  try {
    contentFilter.addSensitiveWords(category, words.map(w => w.trim().toLowerCase()));
    const updatedWords = contentFilter.getSensitiveWords(category);
    
    res.json({ 
      success: true, 
      category, 
      added: words.length,
      total: updatedWords.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add words.' });
  }
});

// Remove words from a category
app.delete('/api/admin/content-filter/:category/words', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const category = req.params.category;
  const { words } = req.body;
  
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Words array is required.' });
  }
  
  try {
    contentFilter.removeSensitiveWords(category, words.map(w => w.trim().toLowerCase()));
    const updatedWords = contentFilter.getSensitiveWords(category);
    
    res.json({ 
      success: true, 
      category, 
      removed: words.length,
      total: updatedWords.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove words.' });
  }
});

// Test content against filter
app.post('/api/admin/content-filter/test', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { text } = req.body;
  
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required.' });
  }
  
  const result = contentFilter.checkContent(text);
  const sanitized = contentFilter.getSanitizedText(text);
  
  res.json({
    original: text,
    sanitized,
    isClean: result.isClean,
    violations: result.violations,
    message: result.isClean ? 'Content is clean' : contentFilter.generateErrorMessage(result.violations)
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
}); 