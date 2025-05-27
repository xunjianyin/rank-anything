const express = require('express');
const cors = require('cors');
const { init, db, dbAsync } = require('./db');
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

// Blocked email list
const BLOCKED_EMAILS = [
  'xjyin2018@163.com'
];

// Function to check if email is blocked
function isEmailBlocked(email) {
  return BLOCKED_EMAILS.includes(email.toLowerCase());
}

// Function to add email to blocked list
function addBlockedEmail(email) {
  const normalizedEmail = email.toLowerCase();
  if (!BLOCKED_EMAILS.includes(normalizedEmail)) {
    BLOCKED_EMAILS.push(normalizedEmail);
    return true;
  }
  return false;
}

// Function to remove email from blocked list
function removeBlockedEmail(email) {
  const normalizedEmail = email.toLowerCase();
  const index = BLOCKED_EMAILS.indexOf(normalizedEmail);
  if (index > -1) {
    BLOCKED_EMAILS.splice(index, 1);
    return true;
  }
  return false;
}

// Function to get all blocked emails
function getBlockedEmails() {
  return [...BLOCKED_EMAILS];
}

// Email domain restrictions
const EMAIL_DOMAIN_RESTRICTION = {
  enabled: true, // Set to false to disable restrictions
  allowedDomains: ['.edu.cn', '.edu'], // Only these domain endings are allowed
  message: 'Registration is currently restricted to educational institutions. Only .edu and .edu.cn email addresses are allowed.'
};

// Function to check if email domain is allowed
function isEmailDomainAllowed(email) {
  if (!EMAIL_DOMAIN_RESTRICTION.enabled) {
    return { allowed: true };
  }
  
  const emailLower = email.toLowerCase();
  const isAllowed = EMAIL_DOMAIN_RESTRICTION.allowedDomains.some(domain => 
    emailLower.endsWith(domain)
  );
  
  return {
    allowed: isAllowed,
    message: isAllowed ? null : EMAIL_DOMAIN_RESTRICTION.message
  };
}

// Function to get domain restriction status
function getDomainRestrictionStatus() {
  return {
    enabled: EMAIL_DOMAIN_RESTRICTION.enabled,
    allowedDomains: [...EMAIL_DOMAIN_RESTRICTION.allowedDomains],
    message: EMAIL_DOMAIN_RESTRICTION.message
  };
}

// Function to update domain restriction settings
function updateDomainRestriction(enabled, allowedDomains = null, message = null) {
  EMAIL_DOMAIN_RESTRICTION.enabled = enabled;
  
  if (allowedDomains !== null) {
    EMAIL_DOMAIN_RESTRICTION.allowedDomains = [...allowedDomains];
  }
  
  if (message !== null) {
    EMAIL_DOMAIN_RESTRICTION.message = message;
  }
  
  return getDomainRestrictionStatus();
}

// Email configuration with multiple fallbacks
const EMAIL_CONFIGS = [
  // Primary: Gmail (most reliable if credentials are provided)
  {
    name: 'Gmail',
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  },
  // Fallback 1: Outlook/Hotmail
  {
    name: 'Outlook',
    service: 'hotmail',
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  },
  // Fallback 2: 163.com with basic settings
  {
    name: '163.com Basic',
    host: 'smtp.163.com',
    port: 25,
    secure: false,
    auth: {
      user: 'rank_anything@163.com',
      pass: process.env.EMAIL_PASSWORD || 'QHDfYMBxDTyLdJVB'
    },
    ignoreTLS: true,
    connectionTimeout: 5000,
    greetingTimeout: 3000,
    socketTimeout: 5000
  }
];

// Filter out configs that don't have credentials
const availableConfigs = EMAIL_CONFIGS.filter(config => {
  if (config.name === 'Gmail') {
    return process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
  }
  if (config.name === 'Outlook') {
    return process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD;
  }
  // Always include 163.com as fallback
  return true;
});

console.log(`Available email configurations: ${availableConfigs.map(c => c.name).join(', ')}`);

// Create primary transporter
let transporter = nodemailer.createTransport(availableConfigs[0]);



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

// Global flag to track email service status
let emailServiceWorking = true;
let lastEmailError = null;

// Send verification email with multiple fallback configurations
async function sendVerificationEmail(email, code, username) {
  // TEMPORARY: Log email instead of sending for development
  console.log('=== EMAIL VERIFICATION ===');
  console.log(`To: ${email}`);
  console.log(`Username: ${username}`);
  console.log(`Verification Code: ${code}`);
  console.log('========================');
  
  // For development, always return success
  return { success: true, usedConfig: 'Console Log' };
  
  // ORIGINAL EMAIL SENDING CODE (commented out for now)
  /*
  // If email service is known to be down, return early
  if (!emailServiceWorking) {
    console.log('Email service is disabled due to previous failures');
    return { 
      success: false, 
      error: 'Email service temporarily unavailable',
      disabled: true
    };
  }

  // Determine the sender email based on the configuration
  const getSenderEmail = (config) => {
    if (config.name === 'Gmail') {
      return process.env.GMAIL_USER || 'rank.anything.app@gmail.com';
    }
    return 'rank_anything@163.com';
  };

  const mailOptions = {
    from: getSenderEmail(availableConfigs[0]),
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

  // Try each configuration in order
  for (let i = 0; i < availableConfigs.length; i++) {
    const config = availableConfigs[i];
    try {
      console.log(`Attempting to send email using ${config.name}...`);
      
      // Update sender email for this configuration
      mailOptions.from = getSenderEmail(config);
      
      const currentTransporter = nodemailer.createTransport(config);
      
      // Test connection first
      await currentTransporter.verify();
      console.log(`Connection verified for ${config.name}`);
      
      // Send the email
      await currentTransporter.sendMail(mailOptions);
      
      console.log(`Email sent successfully using ${config.name}`);
      emailServiceWorking = true; // Reset flag on success
      return { success: true, usedConfig: config.name };
    } catch (error) {
      console.error(`Email sending error with ${config.name}:`, error.message);
      lastEmailError = error.message;
      
      // If this is the last configuration, disable email service temporarily
      if (i === availableConfigs.length - 1) {
        console.log('All email configurations failed, disabling email service temporarily');
        emailServiceWorking = false;
        
        // Re-enable email service after 10 minutes
        setTimeout(() => {
          console.log('Re-enabling email service after cooldown period');
          emailServiceWorking = true;
        }, 10 * 60 * 1000);
        
        return { 
          success: false, 
          error: `All email configurations failed. Last error: ${error.message}`,
          details: error,
          disabled: true
        };
      }
      
      // Otherwise, continue to the next configuration
      console.log(`Trying next email configuration...`);
    }
  }
  
  return { 
    success: false, 
    error: 'No email configurations available' 
  };
  */
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

// Email configuration status endpoint
app.get('/api/email-config', (req, res) => {
  res.json({
    availableConfigs: availableConfigs.map(config => ({
      name: config.name,
      host: config.host || config.service,
      port: config.port || 'default',
      secure: config.secure
    })),
    hasEmailPassword: !!process.env.EMAIL_PASSWORD,
    hasGmailCredentials: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    emailServiceWorking: emailServiceWorking,
    lastEmailError: lastEmailError
  });
});

// Email service status endpoint
app.get('/api/email-status', (req, res) => {
  res.json({
    working: emailServiceWorking,
    lastError: lastEmailError,
    configCount: availableConfigs.length,
    message: emailServiceWorking ? 'Email service is operational' : 'Email service is temporarily disabled'
  });
});

// Public endpoint to check domain restriction status
app.get('/api/domain-restrictions', (req, res) => {
  const status = getDomainRestrictionStatus();
  // Only return public information
  res.json({
    enabled: status.enabled,
    allowedDomains: status.enabled ? status.allowedDomains : null,
    message: status.enabled ? status.message : null
  });
});

// Reset email service (admin only)
app.post('/api/admin/reset-email-service', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  emailServiceWorking = true;
  lastEmailError = null;
  
  res.json({
    message: 'Email service has been reset and re-enabled',
    working: emailServiceWorking
  });
});

// Email testing endpoint (for debugging)
app.post('/api/test-email', async (req, res) => {
  const { email, testCode } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required for testing' });
  }
  
  const code = testCode || '123456';
  const username = 'Test User';
  
  try {
    const result = await sendVerificationEmail(email, code, username);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: `Test email sent successfully using ${result.usedConfig}`,
        usedConfig: result.usedConfig
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error,
        details: result.details?.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Email test failed',
      details: error.message
    });
  }
});

// User registration
app.post('/api/register', validateContent, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Check if email is blocked
  if (isEmailBlocked(email)) {
    return res.status(403).json({ error: 'This email address is not allowed to register.' });
  }

  // Check email domain restrictions
  const domainCheck = isEmailDomainAllowed(email);
  if (!domainCheck.allowed) {
    return res.status(403).json({ error: domainCheck.message });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  // Check if email or username already exists in users table (verified users)
  db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], async (err, existingUser) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (existingUser) return res.status(400).json({ error: 'Email or username already exists.' });
    
    // Check if there's already a pending registration with this email/username
    db.get('SELECT * FROM pending_registrations WHERE email = ? OR username = ?', [email, username], async (err, pendingUser) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      const hash = bcrypt.hashSync(password, 10);
      const verificationCode = generateVerificationCode();
      
      if (pendingUser) {
        // Update existing pending registration
        db.run('UPDATE pending_registrations SET username = ?, email = ?, password_hash = ?, verification_code = ?, last_sent_at = CURRENT_TIMESTAMP, expires_at = datetime("now", "+24 hours") WHERE id = ?', 
          [username, email, hash, verificationCode, pendingUser.id], async (err) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            // Send verification email
            const emailResult = await sendVerificationEmail(email, verificationCode, username);
            if (!emailResult.success) {
              console.error('Failed to send verification email:', emailResult.error);
              
              // If email service is disabled, allow registration without verification
              if (emailResult.disabled) {
                console.log('Email service disabled, allowing registration without verification');
                
                // Create user account directly
                db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)', 
                  [username, email, hash, 0], function(err) {
                    if (err) {
                      console.error('Database error during fallback registration:', err);
                      return res.status(500).json({ error: 'Database error.' });
                    }
                    
                    const userId = this.lastID;
                    
                    // Clean up pending registration
                    db.run('DELETE FROM pending_registrations WHERE id = ?', [pendingUser.id]);
                    
                    // Generate JWT token
                    const token = jwt.sign({ 
                      id: userId, 
                      username: username, 
                      email: email, 
                      isAdmin: false 
                    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                    
                    res.json({ 
                      token, 
                      user: { 
                        id: userId, 
                        username: username, 
                        email: email, 
                        isAdmin: false,
                        emailVerified: false
                      },
                      message: 'Registration completed! Email verification is temporarily unavailable.',
                      emailServiceDown: true
                    });
                  });
                return;
              }
              
              return res.status(500).json({ 
                error: 'Failed to send verification email. Please try again later.',
                details: emailResult.error
              });
            }
            
            res.json({ 
              message: 'Please check your email for verification code to complete registration.',
              registrationId: pendingUser.id,
              username: username,
              email: email,
              requiresVerification: true,
              step: 'email_verification'
            });
          });
      } else {
        // Create new pending registration
        db.run('INSERT INTO pending_registrations (username, email, password_hash, verification_code) VALUES (?, ?, ?, ?)', 
          [username, email, hash, verificationCode], async function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            const registrationId = this.lastID;
            
            // Send verification email
            const emailResult = await sendVerificationEmail(email, verificationCode, username);
            if (!emailResult.success) {
              console.error('Failed to send verification email:', emailResult.error);
              
              // If email service is disabled, allow registration without verification
              if (emailResult.disabled) {
                console.log('Email service disabled, allowing registration without verification');
                
                // Create user account directly
                db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)', 
                  [username, email, hash, 0], function(err) {
                    if (err) {
                      console.error('Database error during fallback registration:', err);
                      // Clean up pending registration
                      db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]);
                      return res.status(500).json({ error: 'Database error.' });
                    }
                    
                    const userId = this.lastID;
                    
                    // Clean up pending registration
                    db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]);
                    
                    // Generate JWT token
                    const token = jwt.sign({ 
                      id: userId, 
                      username: username, 
                      email: email, 
                      isAdmin: false 
                    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                    
                    res.json({ 
                      token, 
                      user: { 
                        id: userId, 
                        username: username, 
                        email: email, 
                        isAdmin: false,
                        emailVerified: false
                      },
                      message: 'Registration completed! Email verification is temporarily unavailable.',
                      emailServiceDown: true
                    });
                  });
                return;
              }
              
              // Remove the pending registration if email fails
              db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]);
              return res.status(500).json({ 
                error: 'Failed to send verification email. Please try again later.',
                details: emailResult.error
              });
            }
            
            res.json({ 
              message: 'Please check your email for verification code to complete registration.',
              registrationId: registrationId,
              username: username,
              email: email,
              requiresVerification: true,
              step: 'email_verification'
            });
          });
      }
    });
  });
});

// Email verification
app.post('/api/verify-email', (req, res) => {
  const { registrationId, verificationCode } = req.body;
  if (!registrationId || !verificationCode) {
    return res.status(400).json({ error: 'Registration ID and verification code are required.' });
  }

  // Check if verification code is valid and not expired
  db.get('SELECT * FROM pending_registrations WHERE id = ? AND verification_code = ? AND expires_at > datetime("now")', 
    [registrationId, verificationCode], (err, pendingReg) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (!pendingReg) {
        return res.status(400).json({ error: 'Invalid or expired verification code.' });
      }

      // Check again if email or username already exists (race condition protection)
      db.get('SELECT * FROM users WHERE email = ? OR username = ?', [pendingReg.email, pendingReg.username], (err, existingUser) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (existingUser) {
          // Clean up pending registration
          db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]);
          return res.status(400).json({ error: 'Email or username already exists.' });
        }

        // Create the actual user account
        db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)', 
          [pendingReg.username, pendingReg.email, pendingReg.password_hash, 1], function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            const userId = this.lastID;
            
            // Clean up pending registration
            db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId], (err) => {
              if (err) console.error('Error cleaning up pending registration:', err);
            });
            
            // Generate JWT token
            const token = jwt.sign({ 
              id: userId, 
              username: pendingReg.username, 
              email: pendingReg.email, 
              isAdmin: false 
            }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            
            res.json({ 
              token, 
              user: { 
                id: userId, 
                username: pendingReg.username, 
                email: pendingReg.email, 
                isAdmin: false,
                emailVerified: true
              },
              message: 'Registration completed successfully! Welcome to Rank-Anything!'
            });
          });
      });
    });
});

// Resend verification code
app.post('/api/resend-verification', async (req, res) => {
  const { registrationId } = req.body;
  if (!registrationId) {
    return res.status(400).json({ error: 'Registration ID is required.' });
  }

  // Get pending registration details
  db.get('SELECT * FROM pending_registrations WHERE id = ?', [registrationId], async (err, pendingReg) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!pendingReg) return res.status(404).json({ error: 'Registration not found or expired.' });
    
    // Check rate limiting (1 hour)
    const lastSent = new Date(pendingReg.last_sent_at);
    const now = new Date();
    const hoursSinceLastSent = (now - lastSent) / (1000 * 60 * 60);
    
    if (hoursSinceLastSent < 1) {
      const minutesRemaining = Math.ceil((60 - (hoursSinceLastSent * 60)));
      return res.status(429).json({ 
        error: `Please wait ${minutesRemaining} minutes before requesting another verification code.` 
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    
    // Update verification code and extend expiration
    db.run('UPDATE pending_registrations SET verification_code = ?, last_sent_at = CURRENT_TIMESTAMP, expires_at = datetime("now", "+24 hours") WHERE id = ?', 
      [verificationCode, registrationId], async (err) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        const emailResult = await sendVerificationEmail(pendingReg.email, verificationCode, pendingReg.username);
        if (!emailResult.success) {
          console.error('Failed to resend verification email:', emailResult.error);
          return res.status(500).json({ error: 'Failed to send verification email. Email service temporarily unavailable.' });
        }
        
        res.json({ message: 'Verification code sent successfully!' });
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
    
    // Note: Email verification is handled during registration, not login
    
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

// Helper function to parse and clean tags from user input
function parseAndCleanTags(tagsInput) {
  if (!tagsInput || typeof tagsInput !== 'string') {
    return [];
  }
  
  // Split by various delimiters: comma, Chinese comma, semicolon, Chinese semicolon, Chinese enumeration mark
  const delimiters = /[,，;；、]/;
  const rawTags = tagsInput.split(delimiters);
  
  const cleanedTags = rawTags
    .map(tag => {
      // Trim whitespace
      tag = tag.trim();
      
      // Remove symbols at the beginning and end that are not letters, Chinese characters, or numbers
      // Keep only: a-z, A-Z, 0-9, Chinese characters (Unicode ranges), and spaces in the middle
      tag = tag.replace(/^[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f\s]+/, '');
      tag = tag.replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f\s]+$/, '');
      
      return tag;
    })
    .filter(tag => tag.length > 0) // Remove empty tags
    .filter((tag, index, array) => array.indexOf(tag) === index); // Remove duplicates
  
  return cleanedTags;
}

// Helper function to record edit history
function recordEditHistory(targetType, targetId, editorId, actionType, oldValue = null, newValue = null) {
  return new Promise((resolve, reject) => {
    const oldValueStr = oldValue ? JSON.stringify(oldValue) : null;
    const newValueStr = newValue ? JSON.stringify(newValue) : null;
    
    db.run(
      'INSERT INTO edit_history (target_type, target_id, editor_id, action_type, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [targetType, targetId, editorId, actionType, oldValueStr, newValueStr],
      function(err) {
        if (err) {
          console.error('Error recording edit history:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// --- Topic Endpoints ---
// List all topics
app.get('/api/topics', (req, res) => {
  const { page = 1, limit = 20, search, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
  const offset = (page - 1) * limit;
  
  // Validate sort parameters
  const validSortFields = ['name', 'created_at', 'object_count'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  let sql = `
    SELECT t.*, u.username as creator_username,
           (SELECT COUNT(*) FROM objects WHERE topic_id = t.id) as object_count
    FROM topics t 
    LEFT JOIN users u ON t.creator_id = u.id
  `;
  
  let countSql = 'SELECT COUNT(*) as total FROM topics t';
  let params = [];
  let countParams = [];
  
  // Add search functionality
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    sql += ' WHERE t.name LIKE ?';
    countSql += ' WHERE t.name LIKE ?';
    params.push(searchTerm);
    countParams.push(searchTerm);
  }
  
  // Add sorting
  if (safeSortBy === 'object_count') {
    sql += ` ORDER BY object_count ${safeSortOrder}, t.created_at DESC`;
  } else {
    sql += ` ORDER BY t.${safeSortBy} ${safeSortOrder}`;
  }
  
  // Add pagination
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  // Get total count for pagination
  db.get(countSql, countParams, (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    
    // Get paginated results
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      res.json({
        topics: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
});

// Get edit history for a topic or object
app.get('/api/edit-history/:targetType/:targetId', (req, res) => {
  const { targetType, targetId } = req.params;
  
  if (!['topic', 'object'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid target type. Must be "topic" or "object".' });
  }
  
  db.all(`
    SELECT eh.*, u.username as editor_username 
    FROM edit_history eh 
    LEFT JOIN users u ON eh.editor_id = u.id 
    WHERE eh.target_type = ? AND eh.target_id = ? 
    ORDER BY eh.created_at ASC
  `, [targetType, targetId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

// Get unique editors for a topic or object
app.get('/api/editors/:targetType/:targetId', (req, res) => {
  const { targetType, targetId } = req.params;
  
  if (!['topic', 'object'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid target type. Must be "topic" or "object".' });
  }
  
  db.all(`
    SELECT DISTINCT u.id, u.username, MIN(eh.created_at) as first_edit, MAX(eh.created_at) as last_edit
    FROM edit_history eh 
    LEFT JOIN users u ON eh.editor_id = u.id 
    WHERE eh.target_type = ? AND eh.target_id = ? 
    GROUP BY u.id, u.username
    ORDER BY first_edit ASC
  `, [targetType, targetId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create a topic
app.post('/api/topics', authenticateToken, validateContent, async (req, res) => {
  const { name, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  
  try {
    // Parse and clean tags
    let cleanedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        cleanedTags = parseAndCleanTags(tags);
      } else if (Array.isArray(tags)) {
        cleanedTags = tags.flatMap(tag => parseAndCleanTags(tag));
      }
    }
    
    // Check if user is restricted from editing
    const restriction = await dbAsync.get(`
      SELECT * FROM user_restrictions 
      WHERE user_id = ? AND restriction_type = 'editing_ban' 
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    `, [req.user.id]);
    
    if (restriction) {
      return res.status(403).json({ 
        error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
      });
    }
    
    // Check if topic name already exists
    const existingTopic = await dbAsync.get('SELECT * FROM topics WHERE name = ?', [name]);
    if (existingTopic) {
      return res.status(400).json({ error: 'A topic with this name already exists.' });
    }
    
    // Create the topic
    const result = await dbAsync.run('INSERT INTO topics (name, creator_id) VALUES (?, ?)', [name, req.user.id]);
    const topicId = result.lastID;
    
    // Record creation in edit history
    try {
      await recordEditHistory('topic', topicId, req.user.id, 'create', null, { name, tags: cleanedTags });
    } catch (historyErr) {
      console.error('Failed to record edit history:', historyErr);
    }
    
    // Add tags if provided
    if (cleanedTags.length > 0) {
      await Promise.all(cleanedTags.map(async (tagName) => {
        // Insert tag if it doesn't exist
        await dbAsync.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
        
        // Get tag ID
        const tag = await dbAsync.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        
        // Link tag to topic
        await dbAsync.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id]);
      }));
    }
    
    // Return the created topic
    const topic = await dbAsync.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    res.json(topic);
    
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: 'Database error.' });
  }
});
// Edit a topic (only creator or admin)
app.put('/api/topics/:id', authenticateToken, validateContent, (req, res) => {
  const { name, tags } = req.body;
  const topicId = req.params.id;
  
  // Parse and clean tags
  let cleanedTags = [];
  if (tags) {
    if (typeof tags === 'string') {
      cleanedTags = parseAndCleanTags(tags);
    } else if (Array.isArray(tags)) {
      cleanedTags = tags.flatMap(tag => parseAndCleanTags(tag));
    }
  }
  
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
  
  async function performTopicEdit() {
    db.get('SELECT * FROM topics WHERE id = ?', [topicId], async (err, topic) => {
      if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
      if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
      
      // Check if new name already exists (unless it's the same topic)
      if (name !== topic.name) {
        db.get('SELECT * FROM topics WHERE name = ? AND id != ?', [name, topicId], async (err, existingTopic) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          if (existingTopic) return res.status(400).json({ error: 'A topic with this name already exists.' });
          
          await proceedWithEdit();
        });
      } else {
        await proceedWithEdit();
      }
      
      async function proceedWithEdit() {
        // Get current tags for comparison
        db.all('SELECT t.name FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ?', [topicId], async (err, currentTagRows) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          
          const currentTags = currentTagRows.map(row => row.name);
          const oldValue = { name: topic.name, tags: currentTags };
          const newValue = { name, tags: cleanedTags };
          
          // Record edit in history
          try {
            await recordEditHistory('topic', topicId, req.user.id, 'edit', oldValue, newValue);
          } catch (historyErr) {
            console.error('Failed to record edit history:', historyErr);
          }
          
          db.run('UPDATE topics SET name = ? WHERE id = ?', [name, topicId], function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            
            // Update tags if provided
            if (tags !== undefined) {
              // Remove old tags
              db.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId], (err) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                
                // Insert new tags (create if not exist)
                if (cleanedTags.length > 0) {
                  const insertTags = cleanedTags.map(tagName => {
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
  }
});
// Delete a topic (only creator or admin)
app.delete('/api/topics/:id', authenticateToken, async (req, res) => {
  const topicId = req.params.id;
  
  try {
    const topic = await dbAsync.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    if (!topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    
    // Record deletion in edit history before deleting
    try {
      await recordEditHistory('topic', topicId, req.user.id, 'delete', { name: topic.name }, null);
    } catch (historyErr) {
      console.error('Failed to record edit history:', historyErr);
    }
    
    // Delete all related data in proper order
    await Promise.all([
      // Delete ratings for objects in this topic
      dbAsync.run('DELETE FROM ratings WHERE object_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId]),
      
      // Delete object tags for objects in this topic
      dbAsync.run('DELETE FROM object_tags WHERE object_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId]),
      
      // Delete edit history for objects in this topic
      dbAsync.run('DELETE FROM edit_history WHERE target_type = "object" AND target_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId])
    ]);
    
    // Delete objects and topic-specific data
    await Promise.all([
      dbAsync.run('DELETE FROM objects WHERE topic_id = ?', [topicId]),
      dbAsync.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId]),
      dbAsync.run('DELETE FROM edit_history WHERE target_type = "topic" AND target_id = ?', [topicId])
    ]);
    
    // Finally delete the topic itself
    await dbAsync.run('DELETE FROM topics WHERE id = ?', [topicId]);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: 'Database error.' });
  }
});

// --- Object Endpoints ---
// List objects in a topic
app.get('/api/topics/:topicId/objects', (req, res) => {
  const topicId = req.params.topicId;
  const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
  const offset = (page - 1) * limit;
  
  const validSortFields = ['name', 'created_at', 'avg_rating'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  let sql = `
    SELECT o.*, u.username as creator_username,
           COALESCE(AVG(r.rating), 0) as avg_rating,
           COUNT(r.id) as rating_count
    FROM objects o 
    LEFT JOIN users u ON o.creator_id = u.id
    LEFT JOIN ratings r ON o.id = r.object_id
    WHERE o.topic_id = ?
    GROUP BY o.id, o.name, o.creator_id, o.created_at, u.username
  `;
  
  // Add sorting
  if (safeSortBy === 'avg_rating') {
    sql += ` ORDER BY avg_rating ${safeSortOrder}, o.created_at DESC`;
  } else {
    sql += ` ORDER BY o.${safeSortBy} ${safeSortOrder}`;
  }
  
  sql += ' LIMIT ? OFFSET ?';
  
  // Get total count
  const countSql = 'SELECT COUNT(*) as total FROM objects WHERE topic_id = ?';
  
  db.get(countSql, [topicId], (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    
    db.all(sql, [topicId, parseInt(limit), offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      res.json({
        objects: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
});
// Create an object in a topic
app.post('/api/topics/:topicId/objects', authenticateToken, validateContent, async (req, res) => {
  const topicId = req.params.topicId;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  
  try {
    // Check if object name already exists in this topic
    const existingObject = await dbAsync.get('SELECT * FROM objects WHERE topic_id = ? AND name = ?', [topicId, name]);
    if (existingObject) {
      return res.status(400).json({ error: 'An object with this name already exists in this topic.' });
    }
    
    // Check if user is restricted from editing
    const restriction = await dbAsync.get(`
      SELECT * FROM user_restrictions 
      WHERE user_id = ? AND restriction_type = 'editing_ban' 
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
    `, [req.user.id]);
    
    if (restriction) {
      return res.status(403).json({ 
        error: 'You are currently restricted from editing until ' + new Date(restriction.end_date).toLocaleString() 
      });
    }
    
    // Create the object
    const result = await dbAsync.run('INSERT INTO objects (topic_id, name, creator_id) VALUES (?, ?, ?)', [topicId, name, req.user.id]);
    const objectId = result.lastID;
    
    // Record creation in edit history
    try {
      await recordEditHistory('object', objectId, req.user.id, 'create', null, { name, topic_id: topicId });
    } catch (historyErr) {
      console.error('Failed to record edit history:', historyErr);
    }
    
    // Inherit tags from topic
    const topicTags = await dbAsync.all('SELECT tag_id FROM topic_tags WHERE topic_id = ?', [topicId]);
    
    if (topicTags.length > 0) {
      await Promise.all(topicTags.map(async (topicTag) => {
        await dbAsync.run('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)', [objectId, topicTag.tag_id]);
      }));
    }
    
    // Return the created object
    const object = await dbAsync.get('SELECT * FROM objects WHERE id = ?', [objectId]);
    res.json(object);
    
  } catch (error) {
    console.error('Error creating object:', error);
    res.status(500).json({ error: 'Database error.' });
  }
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
  
  async function performObjectEdit() {
    db.get('SELECT * FROM objects WHERE id = ?', [objectId], async (err, object) => {
      if (err || !object) return res.status(404).json({ error: 'Object not found.' });
      if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
      
      // Check if new name already exists in the topic (unless it's the same object)
      if (name !== object.name) {
        db.get('SELECT * FROM objects WHERE topic_id = ? AND name = ? AND id != ?', [object.topic_id, name, objectId], async (err, existingObject) => {
          if (err) return res.status(500).json({ error: 'Database error.' });
          if (existingObject) return res.status(400).json({ error: 'An object with this name already exists in this topic.' });
          
          await proceedWithObjectEdit();
        });
              } else {
        await proceedWithObjectEdit();
      }
      
      async function proceedWithObjectEdit() {
        const oldValue = { name: object.name, topic_id: object.topic_id };
        const newValue = { name, topic_id: object.topic_id };
      
      // Record edit in history
      try {
        await recordEditHistory('object', objectId, req.user.id, 'edit', oldValue, newValue);
      } catch (historyErr) {
        console.error('Failed to record edit history:', historyErr);
      }
      
      db.run('UPDATE objects SET name = ? WHERE id = ?', [name, objectId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json({ success: true });
      });
        }
    });
  }
});
// Delete an object (only creator or admin)
app.delete('/api/objects/:id', authenticateToken, async (req, res) => {
  const objectId = req.params.id;
  
  try {
    const object = await dbAsync.get('SELECT * FROM objects WHERE id = ?', [objectId]);
    if (!object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    
    // Record deletion in edit history before deleting
    try {
      await recordEditHistory('object', objectId, req.user.id, 'delete', { name: object.name, topic_id: object.topic_id }, null);
    } catch (historyErr) {
      console.error('Failed to record edit history:', historyErr);
    }
    
    // Delete all related data in proper order
    await Promise.all([
      dbAsync.run('DELETE FROM ratings WHERE object_id = ?', [objectId]),
      dbAsync.run('DELETE FROM object_tags WHERE object_id = ?', [objectId]),
      dbAsync.run('DELETE FROM edit_history WHERE target_type = "object" AND target_id = ?', [objectId])
    ]);
    
    // Finally delete the object itself
    await dbAsync.run('DELETE FROM objects WHERE id = ?', [objectId]);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Database error.' });
  }
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
  
  // Parse and clean the tag name
  const cleanedTags = parseAndCleanTags(name);
  if (cleanedTags.length === 0) {
    return res.status(400).json({ error: 'Invalid tag name after cleaning.' });
  }
  
  const cleanedName = cleanedTags[0]; // Use the first cleaned tag
  
  db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [cleanedName], function(err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    db.get('SELECT * FROM tags WHERE name = ?', [cleanedName], (err, tag) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      res.json(tag);
    });
  });
});
// Assign tags to an object (replace all tags)
app.post('/api/objects/:objectId/tags', authenticateToken, validateContent, (req, res) => {
  const objectId = req.params.objectId;
  const { tags } = req.body; // array of tag names or string
  
  // Parse and clean tags
  let cleanedTags = [];
  if (tags) {
    if (typeof tags === 'string') {
      cleanedTags = parseAndCleanTags(tags);
    } else if (Array.isArray(tags)) {
      cleanedTags = tags.flatMap(tag => parseAndCleanTags(tag));
    } else {
      return res.status(400).json({ error: 'Tags must be a string or array.' });
    }
  }
  
  // Only creator or admin can edit tags
  db.get('SELECT * FROM objects WHERE id = ?', [objectId], (err, object) => {
    if (err || !object) return res.status(404).json({ error: 'Object not found.' });
    if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
    // Remove old tags
    db.run('DELETE FROM object_tags WHERE object_id = ?', [objectId], (err) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      // Insert new tags (create if not exist)
      if (cleanedTags.length > 0) {
        const insertTags = cleanedTags.map(tagName => {
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
      } else {
        res.json({ success: true });
      }
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
  const { tags } = req.body; // array of tag names or string
  
  // Parse and clean tags
  let cleanedTags = [];
  if (tags) {
    if (typeof tags === 'string') {
      cleanedTags = parseAndCleanTags(tags);
    } else if (Array.isArray(tags)) {
      cleanedTags = tags.flatMap(tag => parseAndCleanTags(tag));
    } else {
      return res.status(400).json({ error: 'Tags must be a string or array.' });
    }
  }
  
  // Only creator or admin can edit tags
  db.get('SELECT * FROM topics WHERE id = ?', [topicId], (err, topic) => {
    if (err || !topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });
    
    // Remove old tags
    db.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId], (err) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      
      // Insert new tags (create if not exist)
      if (cleanedTags.length > 0) {
        const insertTags = cleanedTags.map(tagName => {
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
      // Check daily limit for new ratings (admins bypass this)
      if (req.user.isAdmin) {
        // Admins have no daily limits - proceed directly to create rating
        db.run('INSERT INTO ratings (object_id, user_id, rating, review) VALUES (?, ?, ?, ?)', 
          [objectId, req.user.id, rating, review], function(err) {
            if (err) return res.status(500).json({ error: 'Database error.' });
            db.get('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', 
              [this.lastID], (err, newRating) => {
                if (err) return res.status(500).json({ error: 'Database error.' });
                res.json({ ...newRating, isUpdate: false });
              });
          });
      } else {
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
          // Check daily limit for new user ratings (admins bypass this)
          if (req.user.isAdmin) {
            // Admins have no daily limits - proceed directly to create rating
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
          } else {
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
  
  // Parse and clean words using the same function as tags
  const cleanedWords = [];
  for (const word of words) {
    if (typeof word === 'string') {
      const cleaned = parseAndCleanTags(word);
      cleanedWords.push(...cleaned);
    }
  }
  
  if (cleanedWords.length === 0) {
    return res.status(400).json({ error: 'No valid words after cleaning.' });
  }
  
  try {
    contentFilter.addSensitiveWords(category, cleanedWords.map(w => w.toLowerCase()));
    const updatedWords = contentFilter.getSensitiveWords(category);
    
    res.json({ 
      success: true, 
      category, 
      added: cleanedWords.length,
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

// --- Blocked Email Management Endpoints ---

// Get all blocked emails
app.get('/api/admin/blocked-emails', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  res.json({
    blockedEmails: getBlockedEmails(),
    count: getBlockedEmails().length
  });
});

// Add email to blocked list
app.post('/api/admin/blocked-emails', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  
  const added = addBlockedEmail(email);
  
  if (added) {
    res.json({ 
      message: 'Email added to blocked list successfully.',
      email: email.toLowerCase(),
      blockedEmails: getBlockedEmails(),
      count: getBlockedEmails().length
    });
  } else {
    res.status(400).json({ error: 'Email is already in the blocked list.' });
  }
});

// Remove email from blocked list
app.delete('/api/admin/blocked-emails', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  
  const removed = removeBlockedEmail(email);
  
  if (removed) {
    res.json({ 
      message: 'Email removed from blocked list successfully.',
      email: email.toLowerCase(),
      blockedEmails: getBlockedEmails(),
      count: getBlockedEmails().length
    });
  } else {
    res.status(400).json({ error: 'Email is not in the blocked list.' });
  }
});

// Check if email is blocked (for testing)
app.post('/api/admin/blocked-emails/check', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  
  const blocked = isEmailBlocked(email);
  
  res.json({
    email: email.toLowerCase(),
    isBlocked: blocked,
    message: blocked ? 'Email is blocked' : 'Email is not blocked'
  });
});

// --- Email Domain Restriction Management Endpoints ---

// Get domain restriction status
app.get('/api/admin/domain-restrictions', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  res.json(getDomainRestrictionStatus());
});

// Update domain restriction settings
app.put('/api/admin/domain-restrictions', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { enabled, allowedDomains, message } = req.body;
  
  // Validate enabled flag
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean value.' });
  }
  
  // Validate allowedDomains if provided
  if (allowedDomains !== undefined) {
    if (!Array.isArray(allowedDomains)) {
      return res.status(400).json({ error: 'allowedDomains must be an array.' });
    }
    
    // Validate each domain
    for (const domain of allowedDomains) {
      if (typeof domain !== 'string' || !domain.startsWith('.')) {
        return res.status(400).json({ error: 'Each domain must be a string starting with a dot (e.g., ".edu").' });
      }
    }
  }
  
  // Validate message if provided
  if (message !== undefined && typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a string.' });
  }
  
  const updatedSettings = updateDomainRestriction(enabled, allowedDomains, message);
  
  res.json({
    message: 'Domain restriction settings updated successfully.',
    settings: updatedSettings
  });
});

// Test email against domain restrictions
app.post('/api/admin/domain-restrictions/test', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  
  const domainCheck = isEmailDomainAllowed(email);
  const settings = getDomainRestrictionStatus();
  
  res.json({
    email: email.toLowerCase(),
    allowed: domainCheck.allowed,
    message: domainCheck.message || 'Email domain is allowed',
    currentSettings: settings
  });
});

// Startup logging
console.log('=== Rank-Anything Backend Starting ===');
console.log(`Node.js version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Port: ${PORT}`);

// Email configuration status
console.log('\n=== Email Configuration Status ===');
console.log(`Available email configs: ${availableConfigs.length}`);
availableConfigs.forEach((config, index) => {
  console.log(`${index + 1}. ${config.name} - ${config.host || config.service}:${config.port || 'default'}`);
});

if (process.env.EMAIL_PASSWORD) {
  console.log('163.com email password: ✓ Set');
} else {
  console.log('163.com email password: ✗ Using default (may not work)');
}

if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  console.log('Gmail credentials: ✓ Set');
} else {
  console.log('Gmail credentials: ✗ Not set (Gmail fallback disabled)');
}

console.log('\n=== Database Initialization ===');

app.listen(PORT, () => {
  console.log(`\n=== Server Started Successfully ===`);
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Email test: POST http://localhost:${PORT}/api/test-email`);
  console.log('=====================================\n');
  
  // Initialize database indexes for better performance
  addDatabaseIndexes();
}); 

// Optimized search endpoint with server-side processing
app.get('/api/search', (req, res) => {
  const { q: query, type = 'all', page = 1, limit = 20, tags, tagLogic = 'and' } = req.query;
  const offset = (page - 1) * limit;
  
  if (!query && !tags) {
    return res.status(400).json({ error: 'Search query or tags required.' });
  }
  
  const results = {};
  const promises = [];
  
  if (type === 'all' || type === 'topics') {
    promises.push(searchTopicsOptimized(query, tags, tagLogic, limit, offset, page).then(data => {
      results.topics = data;
    }));
  }
  
  if (type === 'all' || type === 'objects') {
    promises.push(searchObjectsOptimized(query, tags, tagLogic, limit, offset, page).then(data => {
      results.objects = data;
    }));
  }
  
  Promise.all(promises)
    .then(() => {
      res.json(results);
    })
    .catch(error => {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed.' });
    });
});

// Optimized search functions
async function searchTopicsOptimized(query, tags, tagLogic, limit, offset, page) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT DISTINCT t.*, u.username as creator_username,
             (SELECT COUNT(*) FROM objects WHERE topic_id = t.id) as object_count
      FROM topics t 
      LEFT JOIN users u ON t.creator_id = u.id
    `;
    
    let countSql = 'SELECT COUNT(DISTINCT t.id) as total FROM topics t';
    let whereConditions = [];
    let params = [];
    
    // Text search
    if (query && query.trim()) {
      whereConditions.push('t.name LIKE ?');
      params.push(`%${query.trim()}%`);
    }
    
    // Tag search
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tagArray.length > 0) {
        sql += ` LEFT JOIN topic_tags tt ON t.id = tt.topic_id
                 LEFT JOIN tags tag ON tt.tag_id = tag.id`;
        countSql += ` LEFT JOIN topic_tags tt ON t.id = tt.topic_id
                      LEFT JOIN tags tag ON tt.tag_id = tag.id`;
        
        if (tagLogic === 'and') {
          // All tags must match
          const tagConditions = tagArray.map(() => 'tag.name LIKE ?').join(' OR ');
          whereConditions.push(`t.id IN (
            SELECT tt2.topic_id FROM topic_tags tt2 
            JOIN tags tag2 ON tt2.tag_id = tag2.id 
            WHERE ${tagConditions}
            GROUP BY tt2.topic_id 
            HAVING COUNT(DISTINCT tag2.id) = ?
          )`);
          params.push(...tagArray.map(tag => `%${tag}%`), tagArray.length);
        } else {
          // Any tag matches
          const tagConditions = tagArray.map(() => 'tag.name LIKE ?').join(' OR ');
          whereConditions.push(`(${tagConditions})`);
          params.push(...tagArray.map(tag => `%${tag}%`));
        }
      }
    }
    
    // Build WHERE clause
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
      countSql += whereClause;
    }
    
    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    // Get count first
    const countParams = params.slice(0, -2);
    db.get(countSql, countParams, (err, countResult) => {
      if (err) return reject(err);
      
      const total = countResult.total;
      const totalPages = Math.ceil(total / limit);
      
      // Get results
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        
        resolve({
          items: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: total,
            itemsPerPage: parseInt(limit),
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        });
      });
    });
  });
}

async function searchObjectsOptimized(query, tags, tagLogic, limit, offset, page) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT DISTINCT o.*, u.username as creator_username, t.name as topic_name,
             COALESCE(AVG(r.rating), 0) as avg_rating,
             COUNT(r.id) as rating_count
      FROM objects o 
      LEFT JOIN users u ON o.creator_id = u.id
      LEFT JOIN topics t ON o.topic_id = t.id
      LEFT JOIN ratings r ON o.id = r.object_id
    `;
    
    let countSql = `
      SELECT COUNT(DISTINCT o.id) as total 
      FROM objects o 
      LEFT JOIN topics t ON o.topic_id = t.id
    `;
    
    let whereConditions = [];
    let params = [];
    
    // Text search
    if (query && query.trim()) {
      whereConditions.push('(o.name LIKE ? OR t.name LIKE ?)');
      params.push(`%${query.trim()}%`, `%${query.trim()}%`);
    }
    
    // Tag search
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tagArray.length > 0) {
        sql += ` LEFT JOIN object_tags ot ON o.id = ot.object_id
                 LEFT JOIN tags tag ON ot.tag_id = tag.id`;
        countSql += ` LEFT JOIN object_tags ot ON o.id = ot.object_id
                      LEFT JOIN tags tag ON ot.tag_id = tag.id`;
        
        if (tagLogic === 'and') {
          const tagConditions = tagArray.map(() => 'tag.name LIKE ?').join(' OR ');
          whereConditions.push(`o.id IN (
            SELECT ot2.object_id FROM object_tags ot2 
            JOIN tags tag2 ON ot2.tag_id = tag2.id 
            WHERE ${tagConditions}
            GROUP BY ot2.object_id 
            HAVING COUNT(DISTINCT tag2.id) = ?
          )`);
          params.push(...tagArray.map(tag => `%${tag}%`), tagArray.length);
        } else {
          const tagConditions = tagArray.map(() => 'tag.name LIKE ?').join(' OR ');
          whereConditions.push(`(${tagConditions})`);
          params.push(...tagArray.map(tag => `%${tag}%`));
        }
      }
    }
    
    // Build WHERE clause
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
      countSql += whereClause;
    }
    
    sql += ' GROUP BY o.id ORDER BY avg_rating DESC, o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    // Get count
    const countParams = params.slice(0, -2);
    db.get(countSql, countParams, (err, countResult) => {
      if (err) return reject(err);
      
      const total = countResult.total;
      const totalPages = Math.ceil(total / limit);
      
      // Get results
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        
        resolve({
          items: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: total,
            itemsPerPage: parseInt(limit),
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        });
      });
    });
  });
}

// Cache control headers middleware for better performance
app.use((req, res, next) => {
  // Set cache headers for static data
  if (req.method === 'GET') {
    if (req.path.includes('/api/topics') || 
        req.path.includes('/api/objects') ||
        req.path.includes('/api/tags')) {
      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes cache
    } else if (req.path.includes('/api/search')) {
      res.set('Cache-Control', 'public, max-age=180'); // 3 minutes cache for search
    } else if (req.path.includes('/api/ratings')) {
      res.set('Cache-Control', 'public, max-age=60'); // 1 minute cache for dynamic content
    }
  }
  next();
});

// Add database indexing on startup for better query performance
const addDatabaseIndexes = () => {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name)',
    'CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_objects_topic_id ON objects(topic_id)',
    'CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name)',
    'CREATE INDEX IF NOT EXISTS idx_objects_created_at ON objects(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_object_id ON ratings(object_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_topic_tags_topic_id ON topic_tags(topic_id)',
    'CREATE INDEX IF NOT EXISTS idx_object_tags_object_id ON object_tags(object_id)',
    'CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)',
    'CREATE INDEX IF NOT EXISTS idx_edit_history_target ON edit_history(target_type, target_id)'
  ];
  
  indexes.forEach(indexSql => {
    db.run(indexSql, (err) => {
      if (err) {
        console.log(`Index creation warning: ${err.message}`);
      }
    });
  });
  
  console.log('Database indexes initialized for better performance');
}; 

// Development endpoint to get verification codes (remove in production)
app.get('/api/dev/pending-registrations', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  db.all('SELECT id, username, email, verification_code, created_at FROM pending_registrations ORDER BY created_at DESC LIMIT 10', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

// Development endpoint to manually verify a user
app.post('/api/dev/verify-user', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  // Find pending registration
  db.get('SELECT * FROM pending_registrations WHERE email = ?', [email], (err, pendingReg) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!pendingReg) return res.status(404).json({ error: 'Pending registration not found' });
    
    // Create user account
    db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)', 
      [pendingReg.username, pendingReg.email, pendingReg.password_hash, 1], function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        const userId = this.lastID;
        
        // Clean up pending registration
        db.run('DELETE FROM pending_registrations WHERE id = ?', [pendingReg.id]);
        
        // Generate JWT token
        const token = jwt.sign({ 
          id: userId, 
          username: pendingReg.username, 
          email: pendingReg.email, 
          isAdmin: false 
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        
        res.json({ 
          token, 
          user: { 
            id: userId, 
            username: pendingReg.username, 
            email: pendingReg.email, 
            isAdmin: false,
            emailVerified: true
          },
          message: 'User verified successfully!'
        });
      });
  });
});