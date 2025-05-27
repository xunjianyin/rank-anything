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
  // Primary: 163.com Secure (Ensure EMAIL_PASSWORD is your Authorization Code)
  {
    name: '163.com',
    host: 'smtp.163.com',
    port: 465,
    secure: true, // true for 465
    auth: {
      user: 'rank_anything@163.com', // Your 163.com email address
      pass: process.env.EMAIL_PASSWORD // MUST be your 163.com authorization code
    },
    connectionTimeout: 10000, // Increased timeout just in case
    greetingTimeout: 8000,
    socketTimeout: 10000,
    // tls: { rejectUnauthorized: false } // Usually not needed for 163.com, enable if you face specific TLS errors
  },
  // Fallback 1: Gmail (if credentials are provided via environment variables)
  {
    name: 'Gmail',
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD // Gmail App Password
    },
    tls: {
      rejectUnauthorized: false // Can be helpful for some environments
    }
  },
  // Fallback 2: Outlook/Hotmail (if credentials are provided)
  {
    name: 'Outlook',
    service: 'hotmail', // Nodemailer uses 'hotmail' for outlook.com, live.com, hotmail.com
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  }
];

// Global flag to track email service status
let emailServiceWorking = true; // Assume working initially
let lastEmailError = null;

// Filter out configs that don't have credentials
const availableConfigs = EMAIL_CONFIGS.filter(config => {
  if (config.name === '163.com') {
    return !!process.env.EMAIL_PASSWORD; // Only include if 163.com password (auth code) is set
  }
  if (config.name === 'Gmail') {
    return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  }
  if (config.name === 'Outlook') {
    return !!(process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD);
  }
  return false; // Should not happen if configs are well-defined
});

if (availableConfigs.length === 0) {
  console.error(
    'CRITICAL: No email configurations are available. Email sending will be disabled. ' +
    'Ensure required environment variables (e.g., EMAIL_PASSWORD for 163.com) are set.'
  );
  emailServiceWorking = false; // No configs, so service can't work
} else {
  console.log(`Available email configurations: ${availableConfigs.map(c => c.name).join(', ')}`);
}

// Create primary transporter (not strictly used by the loop's send logic, but good for initial setup/test)
let transporter = null;
if (emailServiceWorking && availableConfigs.length > 0) {
  try {
    transporter = nodemailer.createTransport(availableConfigs[0]);
  } catch (error) {
    console.error("Error initializing the primary email transporter:", error.message);
    // Potentially set emailServiceWorking to false or handle more gracefully
  }
} else if (!emailServiceWorking) {
    console.log("Email service is disabled due to no available configurations.");
}


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

// Send verification email with multiple fallback configurations
async function sendVerificationEmail(email, code, username) {
  // If email service is known to be down, return early
  if (!emailServiceWorking) {
    console.log('Email service is disabled due to previous failures or no configuration.');
    return {
      success: false,
      error: 'Email service temporarily unavailable or not configured.',
      disabled: true
    };
  }

  if (availableConfigs.length === 0) {
      console.log('No email configurations available to send email.');
      emailServiceWorking = false; // Ensure it's marked as not working
      return {
        success: false,
        error: 'No email configurations available.',
        disabled: true
      };
  }

  const mailOptionsBase = { // Renamed to avoid conflict with mailOptions in loop
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

      // Create mailOptions for this specific attempt, including the 'from' address from the config
      const mailOptions = {
        ...mailOptionsBase,
        from: config.auth.user // Use the user email from the current configuration
      };

      const currentTransporter = nodemailer.createTransport(config);

      // Test connection first
      await currentTransporter.verify();
      console.log(`Connection verified for ${config.name}`);

      // Send the email
      await currentTransporter.sendMail(mailOptions);

      console.log(`Email sent successfully using ${config.name}`);
      emailServiceWorking = true; // Reset flag on success
      lastEmailError = null;
      return { success: true, usedConfig: config.name };
    } catch (error) {
      console.error(`Email sending error with ${config.name}:`, error.message);
      lastEmailError = `Error with ${config.name}: ${error.message}`;

      // If this is the last configuration, disable email service temporarily
      if (i === availableConfigs.length - 1) {
        console.log('All email configurations failed, disabling email service temporarily.');
        emailServiceWorking = false;

        // Re-enable email service after 10 minutes
        setTimeout(() => {
          console.log('Re-enabling email service after cooldown period.');
          emailServiceWorking = true;
          lastEmailError = null; // Clear error after cooldown
        }, 10 * 60 * 1000); // 10 minutes

        return {
          success: false,
          error: `All email configurations failed. Last error with ${config.name}: ${error.message}`,
          details: error,
          disabled: true
        };
      }

      // Otherwise, continue to the next configuration
      console.log(`Trying next email configuration...`);
    }
  }

  // This part should ideally not be reached if availableConfigs.length > 0
  // but as a fallback if the loop somehow finishes without returning:
  console.log('Fell through email sending loop - this indicates an issue if configs were available.');
  emailServiceWorking = false;
  return {
    success: false,
    error: 'No email configurations succeeded or an unexpected error occurred.',
    disabled: true
  };
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
    has163Password: !!process.env.EMAIL_PASSWORD, // Specific to 163.com
    hasGmailCredentials: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    hasOutlookCredentials: !!(process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD),
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
    message: emailServiceWorking ? 'Email service is operational' : (lastEmailError || 'Email service is currently unavailable or not configured.')
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
  if (availableConfigs.length === 0) {
      emailServiceWorking = false; // Still can't work if no configs
      console.warn("Admin reset email service, but no configurations are available.");
  }

  res.json({
    message: emailServiceWorking ? 'Email service has been reset and re-enabled.' : 'Email service reset, but no configurations are available. It remains disabled.',
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
        details: result.details?.message || result.error || 'Unknown error during test email',
        disabled: result.disabled
      });
    }
  } catch (error) {
    console.error('Email test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Email test failed due to an unexpected error in the endpoint.',
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
    if (err) return res.status(500).json({ error: 'Database error checking users.' });
    if (existingUser) return res.status(400).json({ error: 'Email or username already exists.' });

    // Check if there's already a pending registration with this email/username
    db.get('SELECT * FROM pending_registrations WHERE email = ? OR username = ?', [email, username], async (err, pendingUser) => {
      if (err) return res.status(500).json({ error: 'Database error checking pending_registrations.' });

      const hash = bcrypt.hashSync(password, 10);
      const verificationCode = generateVerificationCode();

      if (pendingUser) {
        // Update existing pending registration
        db.run('UPDATE pending_registrations SET username = ?, email = ?, password_hash = ?, verification_code = ?, last_sent_at = CURRENT_TIMESTAMP, expires_at = datetime("now", "+24 hours") WHERE id = ?',
          [username, email, hash, verificationCode, pendingUser.id], async (updateErr) => {
            if (updateErr) return res.status(500).json({ error: 'Database error updating pending registration.' });

            const emailResult = await sendVerificationEmail(email, verificationCode, username);
            if (!emailResult.success) {
              console.error('Failed to send verification email (update path):', emailResult.error);
              if (emailResult.disabled) {
                console.log('Email service disabled, allowing registration without verification (update path)');
                db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)',
                  [username, email, hash, 0], function(insertErr) {
                    if (insertErr) {
                      console.error('Database error during fallback registration (update path):', insertErr);
                      return res.status(500).json({ error: 'Database error on fallback user creation.' });
                    }
                    const userId = this.lastID;
                    db.run('DELETE FROM pending_registrations WHERE id = ?', [pendingUser.id]); // Clean up
                    const token = jwt.sign({ id: userId, username: username, email: email, isAdmin: false }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                    return res.json({
                      token,
                      user: { id: userId, username: username, email: email, isAdmin: false, emailVerified: false },
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
          [username, email, hash, verificationCode], async function(insertPendingErr) {
            if (insertPendingErr) return res.status(500).json({ error: 'Database error creating pending registration.' });

            const registrationId = this.lastID;
            const emailResult = await sendVerificationEmail(email, verificationCode, username);

            if (!emailResult.success) {
              console.error('Failed to send verification email (new path):', emailResult.error);
              // Clean up pending registration if email fails and service is not just disabled
              if (emailResult.disabled) {
                 console.log('Email service disabled, allowing registration without verification (new path)');
                 db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)',
                  [username, email, hash, 0], function(insertErr) {
                    if (insertErr) {
                      console.error('Database error during fallback registration (new path):', insertErr);
                      db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]); // Clean up
                      return res.status(500).json({ error: 'Database error on fallback user creation.' });
                    }
                    const userId = this.lastID;
                    db.run('DELETE FROM pending_registrations WHERE id = ?', [registrationId]); // Clean up
                    const token = jwt.sign({ id: userId, username: username, email: email, isAdmin: false }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                    return res.json({
                      token,
                      user: { id: userId, username: username, email: email, isAdmin: false, emailVerified: false },
                      message: 'Registration completed! Email verification is temporarily unavailable.',
                      emailServiceDown: true
                    });
                  });
                return;
              }
              // If not disabled, but failed, remove pending reg
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
          // Provide a more user-friendly message, especially if disabled
          const errorMessage = emailResult.disabled
                             ? 'Failed to send verification email. Email service temporarily unavailable.'
                             : `Failed to send verification email. ${emailResult.error || ''}`;
          return res.status(500).json({ error: errorMessage, details: emailResult.details });
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
  const fieldsToCheck = ['name', 'review', 'reason', 'new_value', 'username']; // Added username
  const violations = [];

  for (const field of fieldsToCheck) {
    if (req.body[field] && typeof req.body[field] === 'string') { // Check type
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
        if (typeof req.body.tags[i] === 'string') { // Check type
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
        // Ensure all elements in the array are strings before parsing
        cleanedTags = tags.filter(tag => typeof tag === 'string').flatMap(tag => parseAndCleanTags(tag));
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

        if (tag) { // Ensure tag was found or created
          // Link tag to topic
          await dbAsync.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id]);
        } else {
          console.warn(`Could not find or create tag: ${tagName} during topic creation.`);
        }
      }));
    }

    // Return the created topic
    const topic = await dbAsync.get('SELECT t.*, u.username as creator_username FROM topics t LEFT JOIN users u ON t.creator_id = u.id WHERE t.id = ?', [topicId]);
    res.status(201).json(topic); // 201 Created

  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: 'Database error.' });
  }
});
// Edit a topic (only creator or admin)
app.put('/api/topics/:id', authenticateToken, validateContent, (req, res) => {
  const { name, tags } = req.body; // Name is required for an edit
  const topicId = req.params.id;

  if (!name) {
    return res.status(400).json({ error: 'Name is required for editing a topic.' });
  }

  // Parse and clean tags
  let cleanedTags = [];
  if (tags !== undefined) { // Process tags only if explicitly provided (even if null or empty string)
    if (typeof tags === 'string') {
      cleanedTags = parseAndCleanTags(tags);
    } else if (Array.isArray(tags)) {
      cleanedTags = tags.filter(tag => typeof tag === 'string').flatMap(tag => parseAndCleanTags(tag));
    } else if (tags === null) { // Allow explicitly setting tags to empty
        cleanedTags = [];
    } else {
        return res.status(400).json({ error: 'Tags must be a string, an array of strings, or null.' });
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
      if (err) return res.status(500).json({ error: 'Database error fetching topic.'});
      if (!topic) return res.status(404).json({ error: 'Topic not found.' });
      if (topic.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });

      // Check if new name already exists (unless it's the same topic)
      if (name !== topic.name) {
        const existingTopic = await dbAsync.get('SELECT * FROM topics WHERE name = ? AND id != ?', [name, topicId]);
        if (existingTopic) {
            return res.status(400).json({ error: 'A topic with this name already exists.' });
        }
      }
      await proceedWithEdit(topic);
    });
  }

  async function proceedWithEdit(currentTopicData) {
    // Get current tags for comparison
    const currentTagRows = await dbAsync.all('SELECT t.name FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ?', [topicId]);
    const currentTags = currentTagRows.map(row => row.name);

    const oldValue = { name: currentTopicData.name, tags: currentTags };
    // If 'tags' was not in req.body, keep existing tags for newValue representation, otherwise use cleanedTags
    const newNameForRecord = name || currentTopicData.name; // Use new name if provided, else old
    const newTagsForRecord = tags !== undefined ? cleanedTags : currentTags;
    const newValue = { name: newNameForRecord, tags: newTagsForRecord };


    // Record edit in history
    try {
      await recordEditHistory('topic', topicId, req.user.id, 'edit', oldValue, newValue);
    } catch (historyErr) {
      console.error('Failed to record edit history:', historyErr);
      // Decide if this is a fatal error. For now, we continue.
    }

    db.run('UPDATE topics SET name = ? WHERE id = ?', [name, topicId], async function(err) {
      if (err) return res.status(500).json({ error: 'Database error updating topic name.' });

      // Update tags only if 'tags' was part of the request
      if (tags !== undefined) {
        try {
            await dbAsync.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId]);
            if (cleanedTags.length > 0) {
                await Promise.all(cleanedTags.map(async (tagName) => {
                    await dbAsync.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
                    const tag = await dbAsync.get('SELECT id FROM tags WHERE name = ?', [tagName]);
                    if (tag) {
                        await dbAsync.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id]);
                    }
                }));
            }
        } catch (tagError) {
            console.error("Error updating topic tags:", tagError);
            return res.status(500).json({ error: 'Database error updating topic tags.' });
        }
      }
      // Fetch the updated topic to return
      const updatedTopic = await dbAsync.get('SELECT t.*, u.username as creator_username FROM topics t LEFT JOIN users u ON t.creator_id = u.id WHERE t.id = ?', [topicId]);
      res.json({ success: true, topic: updatedTopic });
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
      // Fetch current tags for the record
      const currentTagRows = await dbAsync.all('SELECT t.name FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ?', [topicId]);
      const currentTags = currentTagRows.map(row => row.name);
      await recordEditHistory('topic', topicId, req.user.id, 'delete', { name: topic.name, tags: currentTags }, null);
    } catch (historyErr) {
      console.error('Failed to record edit history for topic deletion:', historyErr);
    }

    // Use a transaction for atomicity
    await dbAsync.run('BEGIN TRANSACTION');

    // Delete ratings for objects in this topic
    await dbAsync.run('DELETE FROM ratings WHERE object_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId]);

    // Delete object tags for objects in this topic
    await dbAsync.run('DELETE FROM object_tags WHERE object_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId]);

    // Delete edit history for objects in this topic
    await dbAsync.run('DELETE FROM edit_history WHERE target_type = "object" AND target_id IN (SELECT id FROM objects WHERE topic_id = ?)', [topicId]);

    // Delete objects themselves
    await dbAsync.run('DELETE FROM objects WHERE topic_id = ?', [topicId]);

    // Delete topic tags
    await dbAsync.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId]);

    // Delete edit history for the topic itself
    await dbAsync.run('DELETE FROM edit_history WHERE target_type = "topic" AND target_id = ?', [topicId]);

    // Finally delete the topic itself
    await dbAsync.run('DELETE FROM topics WHERE id = ?', [topicId]);

    await dbAsync.run('COMMIT');

    res.json({ success: true, message: 'Topic and all associated data deleted successfully.' });

  } catch (error) {
    await dbAsync.run('ROLLBACK'); // Rollback transaction on error
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: 'Database error during topic deletion.' });
  }
});

// --- Object Endpoints ---
// List objects in a topic
app.get('/api/topics/:topicId/objects', (req, res) => {
  const topicId = req.params.topicId;
  const { page = 1, limit = 20, sortBy = 'avg_rating', sortOrder = 'DESC' } = req.query; // Default sort by avg_rating
  const offset = (page - 1) * limit;

  const validSortFields = ['name', 'created_at', 'avg_rating', 'rating_count'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'avg_rating';
  const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

  let sql = `
    SELECT o.*, u.username as creator_username,
           COALESCE(AVG(r.rating), 0) as avg_rating,
           COUNT(r.id) as rating_count
    FROM objects o
    LEFT JOIN users u ON o.creator_id = u.id
    LEFT JOIN ratings r ON o.id = r.object_id
    WHERE o.topic_id = ?
    GROUP BY o.id
  `; // Removed other GROUP BY fields to ensure correct aggregation

  // Add sorting
  if (safeSortBy === 'avg_rating' || safeSortBy === 'rating_count') {
    sql += ` ORDER BY ${safeSortBy} ${safeSortOrder}, o.created_at DESC`;
  } else {
    sql += ` ORDER BY o.${safeSortBy} ${safeSortOrder}, o.created_at DESC`;
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
  const { name } = req.body; // Assuming only name is needed for creation, tags inherited.
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  try {
    // Check if topic exists first
    const topicExists = await dbAsync.get('SELECT id FROM topics WHERE id = ?', [topicId]);
    if (!topicExists) {
        return res.status(404).json({ error: 'Topic not found.' });
    }

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
      await recordEditHistory('object', objectId, req.user.id, 'create', null, { name, topic_id: parseInt(topicId) });
    } catch (historyErr) {
      console.error('Failed to record edit history for object creation:', historyErr);
    }

    // Inherit tags from topic (if any)
    const topicTags = await dbAsync.all('SELECT tag_id FROM topic_tags WHERE topic_id = ?', [topicId]);
    if (topicTags.length > 0) {
      await Promise.all(topicTags.map(async (topicTag) => {
        await dbAsync.run('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)', [objectId, topicTag.tag_id]);
      }));
    }

    // Return the created object with creator username
    const object = await dbAsync.get(
        `SELECT o.*, u.username as creator_username, t.name as topic_name
         FROM objects o
         LEFT JOIN users u ON o.creator_id = u.id
         LEFT JOIN topics t ON o.topic_id = t.id
         WHERE o.id = ?`, [objectId]
    );
    res.status(201).json(object); // 201 Created

  } catch (error) {
    console.error('Error creating object:', error);
    res.status(500).json({ error: 'Database error.' });
  }
});
// Edit an object (only creator or admin)
app.put('/api/objects/:id', authenticateToken, validateContent, (req, res) => {
  const { name } = req.body; // Only name is editable for an object directly
  const objectId = req.params.id;

  if (!name) {
    return res.status(400).json({ error: 'Name is required for editing an object.' });
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
      performObjectEdit();
    });
  } else {
    performObjectEdit();
  }

  async function performObjectEdit() {
    db.get('SELECT * FROM objects WHERE id = ?', [objectId], async (err, object) => {
      if (err) return res.status(500).json({ error: 'Database error fetching object.'});
      if (!object) return res.status(404).json({ error: 'Object not found.' });
      if (object.creator_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Not allowed.' });

      // Check if new name already exists in the topic (unless it's the same object)
      if (name !== object.name) {
        const existingObject = await dbAsync.get('SELECT * FROM objects WHERE topic_id = ? AND name = ? AND id != ?', [object.topic_id, name, objectId]);
        if (existingObject) {
            return res.status(400).json({ error: 'An object with this name already exists in this topic.' });
        }
      }
      await proceedWithObjectEdit(object);
    });
  }

  async function proceedWithObjectEdit(currentObjectData) {
    const oldValue = { name: currentObjectData.name, topic_id: currentObjectData.topic_id };
    const newValue = { name, topic_id: currentObjectData.topic_id }; // name is from req.body

    // Record edit in history
    try {
      await recordEditHistory('object', objectId, req.user.id, 'edit', oldValue, newValue);
    } catch (historyErr) {
      console.error('Failed to record edit history for object edit:', historyErr);
    }

    db.run('UPDATE objects SET name = ? WHERE id = ?', [name, objectId], async function(err) {
      if (err) return res.status(500).json({ error: 'Database error updating object.' });
      // Fetch the updated object to return
      const updatedObject = await dbAsync.get(
        `SELECT o.*, u.username as creator_username, t.name as topic_name
         FROM objects o
         LEFT JOIN users u ON o.creator_id = u.id
         LEFT JOIN topics t ON o.topic_id = t.id
         WHERE o.id = ?`,
        [objectId]
      );
      res.json({ success: true, object: updatedObject });
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
      console.error('Failed to record edit history for object deletion:', historyErr);
    }

    // Use a transaction for atomicity
    await dbAsync.run('BEGIN TRANSACTION');

    // Delete all related data
    await dbAsync.run('DELETE FROM ratings WHERE object_id = ?', [objectId]);
    await dbAsync.run('DELETE FROM object_tags WHERE object_id = ?', [objectId]);
    await dbAsync.run('DELETE FROM edit_history WHERE target_type = "object" AND target_id = ?', [objectId]);

    // Finally delete the object itself
    await dbAsync.run('DELETE FROM objects WHERE id = ?', [objectId]);

    await dbAsync.run('COMMIT');

    res.json({ success: true, message: 'Object and associated data deleted successfully.' });

  } catch (error) {
    await dbAsync.run('ROLLBACK');
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Database error during object deletion.' });
  }
});

// --- Tag Endpoints ---
// List all tags with their usage counts
app.get('/api/tags', (req, res) => {
  db.all(`
    SELECT
      t.id,
      t.name,
      COUNT(DISTINCT tt.topic_id) as topic_count,
      COUNT(DISTINCT ot.object_id) as object_count
    FROM tags t
    LEFT JOIN topic_tags tt ON t.id = tt.tag_id
    LEFT JOIN object_tags ot ON t.id = ot.tag_id
    GROUP BY t.id, t.name
    ORDER BY t.name ASC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// Create a tag (generally tags are created implicitly when assigned)
app.post('/api/tags', authenticateToken, validateContent, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  // Parse and clean the tag name
  const cleanedTags = parseAndCleanTags(name);
  if (cleanedTags.length === 0 || cleanedTags.length > 1) { // Ensure single, valid tag name for direct creation
    return res.status(400).json({ error: 'Invalid or multiple tag names provided for single tag creation.' });
  }

  const cleanedName = cleanedTags[0];

  db.get('SELECT * FROM tags WHERE name = ?', [cleanedName], (err, existingTag) => {
    if (err) return res.status(500).json({ error: 'Database error checking tag.' });
    if (existingTag) {
        return res.status(400).json({ error: 'Tag already exists.', tag: existingTag});
    }

    db.run('INSERT INTO tags (name) VALUES (?)', [cleanedName], function(err) {
        if (err) return res.status(500).json({ error: 'Database error creating tag.' });
        db.get('SELECT * FROM tags WHERE id = ?', [this.lastID], (err, tag) => {
        if (err) return res.status(500).json({ error: 'Database error fetching created tag.' });
        res.status(201).json(tag);
        });
    });
  });
});
// Assign tags to an object (replace all tags)
app.post('/api/objects/:objectId/tags', authenticateToken, validateContent, async (req, res) => {
  const objectId = req.params.objectId;
  const { tags } = req.body; // Expects a string of comma-separated tags or an array of tag names

  if (tags === undefined) {
    return res.status(400).json({ error: 'Tags field is required (can be an empty string or array to remove all tags).' });
  }

  let cleanedTags = [];
  if (typeof tags === 'string') {
    cleanedTags = parseAndCleanTags(tags);
  } else if (Array.isArray(tags)) {
    cleanedTags = tags.filter(t => typeof t === 'string').flatMap(tag => parseAndCleanTags(tag));
  } else if (tags === null) { // Explicitly allow removing all tags
    cleanedTags = [];
  } else {
    return res.status(400).json({ error: 'Tags must be a string, an array of strings, or null.' });
  }

  try {
    const object = await dbAsync.get('SELECT * FROM objects WHERE id = ?', [objectId]);
    if (!object) return res.status(404).json({ error: 'Object not found.' });
    // Allow editing tags if user is creator, or admin, or if topic allows collaborative tagging (future feature)
    if (object.creator_id !== req.user.id && !req.user.isAdmin) {
        // For now, only creator or admin. This could be expanded.
        return res.status(403).json({ error: 'Not allowed to edit tags for this object.' });
    }

    // Get current tags for history
    const currentTagRows = await dbAsync.all('SELECT t.name FROM tags t JOIN object_tags ot ON t.id = ot.tag_id WHERE ot.object_id = ?', [objectId]);
    const oldTags = currentTagRows.map(r => r.name);

    await dbAsync.run('BEGIN TRANSACTION');
    await dbAsync.run('DELETE FROM object_tags WHERE object_id = ?', [objectId]);

    if (cleanedTags.length > 0) {
      for (const tagName of cleanedTags) {
        let tag = await dbAsync.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        if (!tag) {
          const result = await dbAsync.run('INSERT INTO tags (name) VALUES (?)', [tagName]);
          tag = { id: result.lastID };
        }
        await dbAsync.run('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)', [objectId, tag.id]);
      }
    }
    await dbAsync.run('COMMIT');

    // Record edit history for tag change
    try {
        await recordEditHistory('object', objectId, req.user.id, 'edit_tags', { tags: oldTags }, { tags: cleanedTags });
    } catch (historyErr) {
        console.error('Failed to record tag edit history for object:', historyErr);
    }
    const newTagObjects = await dbAsync.all('SELECT t.* FROM tags t JOIN object_tags ot ON t.id = ot.tag_id WHERE ot.object_id = ? ORDER BY t.name ASC', [objectId]);
    res.json({ success: true, tags: newTagObjects });

  } catch (error) {
    await dbAsync.run('ROLLBACK');
    console.error("Error assigning tags to object:", error);
    res.status(500).json({ error: 'Database error.' });
  }
});
// List tags for an object
app.get('/api/objects/:objectId/tags', (req, res) => {
  const objectId = req.params.objectId;
  db.all('SELECT t.* FROM tags t JOIN object_tags ot ON t.id = ot.tag_id WHERE ot.object_id = ? ORDER BY t.name ASC', [objectId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});
// List objects by tag
app.get('/api/tags/:tagName/objects', (req, res) => {
    const tagName = req.params.tagName;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    db.get('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [tagName], (err, tag) => { // COLLATE NOCASE for case-insensitive tag search
        if (err) return res.status(500).json({ error: 'Database error finding tag.' });
        if (!tag) return res.json({ objects: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: parseInt(limit), hasNext: false, hasPrev: false } });

        const countSql = 'SELECT COUNT(o.id) as total FROM objects o JOIN object_tags ot ON o.id = ot.object_id WHERE ot.tag_id = ?';
        const objectsSql = `
            SELECT o.*, u.username as creator_username, t.name as topic_name,
                   COALESCE(AVG(r.rating), 0) as avg_rating, COUNT(r.id) as rating_count
            FROM objects o
            JOIN object_tags ot ON o.id = ot.object_id
            LEFT JOIN users u ON o.creator_id = u.id
            LEFT JOIN topics t ON o.topic_id = t.id
            LEFT JOIN ratings r ON o.id = r.object_id
            WHERE ot.tag_id = ?
            GROUP BY o.id
            ORDER BY avg_rating DESC, o.created_at DESC
            LIMIT ? OFFSET ?
        `;

        db.get(countSql, [tag.id], (err, countResult) => {
            if (err) return res.status(500).json({ error: 'Database error counting objects for tag.' });

            const total = countResult.total;
            const totalPages = Math.ceil(total / limit);

            db.all(objectsSql, [tag.id, parseInt(limit), offset], (err, rows) => {
                if (err) return res.status(500).json({ error: 'Database error fetching objects for tag.' });
                res.json({
                    objects: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalItems: total,
                        itemsPerPage: parseInt(limit),
                        hasNext: parseInt(page) < totalPages,
                        hasPrev: parseInt(page) > 1
                    }
                });
            });
        });
    });
});

// --- Topic Tag Endpoints ---
// Assign tags to a topic (replace all tags) - Similar to object tags
app.post('/api/topics/:topicId/tags', authenticateToken, validateContent, async (req, res) => {
  const topicId = req.params.topicId;
  const { tags } = req.body;

  if (tags === undefined) {
    return res.status(400).json({ error: 'Tags field is required (can be an empty string or array to remove all tags).' });
  }

  let cleanedTags = [];
  if (typeof tags === 'string') {
    cleanedTags = parseAndCleanTags(tags);
  } else if (Array.isArray(tags)) {
    cleanedTags = tags.filter(t => typeof t === 'string').flatMap(tag => parseAndCleanTags(tag));
  } else if (tags === null) {
    cleanedTags = [];
  } else {
    return res.status(400).json({ error: 'Tags must be a string, an array of strings, or null.' });
  }

  try {
    const topic = await dbAsync.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    if (!topic) return res.status(404).json({ error: 'Topic not found.' });
    if (topic.creator_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not allowed to edit tags for this topic.' });
    }

    const currentTagRows = await dbAsync.all('SELECT t.name FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ?', [topicId]);
    const oldTags = currentTagRows.map(r => r.name);

    await dbAsync.run('BEGIN TRANSACTION');
    await dbAsync.run('DELETE FROM topic_tags WHERE topic_id = ?', [topicId]);

    if (cleanedTags.length > 0) {
      for (const tagName of cleanedTags) {
        let tag = await dbAsync.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        if (!tag) {
          const result = await dbAsync.run('INSERT INTO tags (name) VALUES (?)', [tagName]);
          tag = { id: result.lastID };
        }
        await dbAsync.run('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [topicId, tag.id]);
      }
    }
    await dbAsync.run('COMMIT');
    try {
        await recordEditHistory('topic', topicId, req.user.id, 'edit_tags', { tags: oldTags }, { tags: cleanedTags });
    } catch (historyErr) {
        console.error('Failed to record tag edit history for topic:', historyErr);
    }

    const newTagObjects = await dbAsync.all('SELECT t.* FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ? ORDER BY t.name ASC', [topicId]);
    res.json({ success: true, tags: newTagObjects });

  } catch (error) {
    await dbAsync.run('ROLLBACK');
    console.error("Error assigning tags to topic:", error);
    res.status(500).json({ error: 'Database error.' });
  }
});

// List tags for a topic
app.get('/api/topics/:topicId/tags', (req, res) => {
  const topicId = req.params.topicId;
  db.all('SELECT t.* FROM tags t JOIN topic_tags tt ON t.id = tt.tag_id WHERE tt.topic_id = ? ORDER BY t.name ASC', [topicId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

// --- Ratings & Reviews Endpoints ---
// List ratings/reviews for an object
app.get('/api/objects/:objectId/ratings', (req, res) => {
  const objectId = req.params.objectId;
  const { page = 1, limit = 10 } = req.query; // Add pagination
  const offset = (page - 1) * limit;

  const countSql = 'SELECT COUNT(*) as total FROM ratings WHERE object_id = ?';
  const ratingsSql = `
    SELECT r.*, u.username
    FROM ratings r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.object_id = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countSql, [objectId], (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Database error counting ratings.' });

    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    db.all(ratingsSql, [objectId, parseInt(limit), offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error fetching ratings.' });
      res.json({
        ratings: rows,
        pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: total,
            itemsPerPage: parseInt(limit),
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1
        }
      });
    });
  });
});
// Create or update a rating/review for an object
app.post('/api/objects/:objectId/ratings', authenticateToken, validateContent, (req, res) => {
  const objectId = req.params.objectId;
  const { rating, review } = req.body; // review can be null or empty string

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1-5.' });
  }
  if (review !== undefined && review !== null && typeof review !== 'string') {
      return res.status(400).json({ error: 'Review must be a string, null, or undefined.' });
  }
  const finalReview = (review === undefined || review === null) ? '' : review; // Standardize to empty string if not provided

  // Check if object exists
  db.get('SELECT id FROM objects WHERE id = ?', [objectId], (err, objectExists) => {
    if (err) return res.status(500).json({ error: 'Database error checking object.' });
    if (!objectExists) return res.status(404).json({ error: 'Object not found.' });

    db.get('SELECT * FROM ratings WHERE object_id = ? AND user_id = ?', [objectId, req.user.id], (err, existing) => {
      if (err) return res.status(500).json({ error: 'Database error checking existing rating.' });

      if (existing) {
        // User is updating their rating
        // Check if user already modified this rating today (unless it's the first modification of the day)
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const updatedAtDate = existing.updated_at ? new Date(existing.updated_at).toISOString().slice(0, 10) : null;
        const createdAtDate = new Date(existing.created_at).toISOString().slice(0, 10);

        // Allow update if it's the first update ever, or if last update was not today
        if (updatedAtDate === today && updatedAtDate !== createdAtDate) {
             // This means it was created on a previous day and updated today OR created today and updated again today.
             // A simpler rule: only one update per day after the initial creation day.
             // If created_at is today, and updated_at is also today (and different from created_at), then it's a second update today.
            if (createdAtDate === today && existing.updated_at !== existing.created_at) {
                 return res.status(403).json({ error: 'You can only modify your rating once on the day it was created, or once on any subsequent day.' });
            }
            // If created_at was a previous day, and updated_at is today, this is the first update today.
        }


        db.run('UPDATE ratings SET rating = ?, review = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [rating, finalReview, existing.id], function(err) {
            if (err) return res.status(500).json({ error: 'Database error updating rating.' });
            db.get('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?',
              [existing.id], (err, updated) => {
                if (err) return res.status(500).json({ error: 'Database error fetching updated rating.' });
                res.json({ ...updated, isUpdate: true });
              });
          });
      } else {
        // User is creating a new rating
        // Check daily limit for new ratings (admins bypass this)
        if (!req.user.isAdmin) {
          db.get(`SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND DATE(created_at) = DATE('now')`, [req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error checking daily limit.' });
            if (row.count >= 64) return res.status(403).json({ error: 'Daily rating limit reached (64 new ratings per day).' });
            createNewRating();
          });
        } else {
          createNewRating();
        }
      }
    });
  });

  function createNewRating() {
    db.run('INSERT INTO ratings (object_id, user_id, rating, review) VALUES (?, ?, ?, ?)',
      [objectId, req.user.id, rating, finalReview], function(err) {
        if (err) return res.status(500).json({ error: 'Database error creating new rating.' });
        db.get('SELECT r.*, u.username FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?',
          [this.lastID], (err, newRating) => {
            if (err) return res.status(500).json({ error: 'Database error fetching new rating.' });
            res.status(201).json({ ...newRating, isUpdate: false }); // 201 Created
          });
      });
  }
});

// Get current user's rating for an object
app.get('/api/objects/:objectId/my-rating', authenticateToken, (req, res) => {
  const objectId = req.params.objectId;

  db.get('SELECT * FROM ratings WHERE object_id = ? AND user_id = ?', [objectId, req.user.id], (err, rating) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ rating: rating || null }); // Return null if no rating found
  });
});

// --- Moderation Proposal & Voting Endpoints ---
// List all moderation proposals (optionally filter by status)
app.get('/api/moderation/proposals', authenticateToken, (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let baseSql = `FROM moderation_proposals p LEFT JOIN users u ON p.proposer_id = u.id`;
  let whereClause = '';
  const params = [];

  if (status) {
    whereClause = ' WHERE p.status = ?';
    params.push(status);
  }

  const countSql = `SELECT COUNT(p.id) as total ${baseSql}${whereClause}`;
  const dataSql = `SELECT p.*, u.username as proposer_username ${baseSql}${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);


  db.get(countSql, params.slice(0, status ? 1:0) , (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Database error counting proposals.' });
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    db.all(dataSql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error fetching proposals.' });
        res.json({
            proposals: rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems: total,
                itemsPerPage: parseInt(limit),
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            }
        });
    });
  });
});
// Create a moderation proposal
app.post('/api/moderation/proposals', authenticateToken, validateContent, (req, res) => {
  const { type, target_type, target_id, new_value, reason } = req.body; // new_value can be null
  if (!type || !target_type || !target_id || !reason) return res.status(400).json({ error: 'Type, target_type, target_id, and reason are required.' });
  if (!['delete', 'edit'].includes(type)) return res.status(400).json({ error: 'Invalid proposal type.' });
  if (!['topic', 'object', 'rating'].includes(target_type)) return res.status(400).json({ error: 'Invalid target type.' });
  if (type === 'edit' && new_value === undefined) return res.status(400).json({ error: 'new_value is required for edit proposals.' });

  // TODO: Add more validation, e.g., check if target_id actually exists for target_type

  db.run('INSERT INTO moderation_proposals (type, target_type, target_id, proposer_id, new_value, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [type, target_type, target_id, req.user.id, (type === 'edit' ? new_value : null), reason], function(err) {
      if (err) return res.status(500).json({ error: 'Database error.' });
      db.get('SELECT p.*, u.username as proposer_username FROM moderation_proposals p LEFT JOIN users u ON p.proposer_id = u.id WHERE p.id = ?', [this.lastID], (err, proposal) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.status(201).json(proposal);
      });
    });
});
// Vote on a proposal
app.post('/api/moderation/proposals/:id/vote', authenticateToken, (req, res) => {
  const proposalId = req.params.id;
  const { vote } = req.body; // 1 for approve, 0 for reject (or -1, let's stick to 0 for reject)

  if (vote !== 1 && vote !== 0) return res.status(400).json({ error: 'Vote must be 1 (approve) or 0 (reject).' });

  db.get('SELECT id, status FROM moderation_proposals WHERE id = ?', [proposalId], (err, proposal) => {
    if (err) return res.status(500).json({ error: 'Database error finding proposal.' });
    if (!proposal) return res.status(404).json({ error: 'Proposal not found.' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: 'This proposal is not pending and cannot be voted on.' });

    // Prevent double voting
    db.get('SELECT * FROM votes WHERE proposal_id = ? AND user_id = ?', [proposalId, req.user.id], (err, existing) => {
      if (err) return res.status(500).json({ error: 'Database error checking existing vote.' });
      if (existing) return res.status(400).json({ error: 'You have already voted on this proposal.' });

      db.run('INSERT INTO votes (proposal_id, user_id, vote) VALUES (?, ?, ?)', [proposalId, req.user.id, vote], function(err) {
        if (err) return res.status(500).json({ error: 'Database error casting vote.' });
        // Optionally, recount votes and auto-execute/reject if threshold met
        res.json({ success: true, message: 'Vote cast successfully.' });
      });
    });
  });
});
// Execute a proposal (admin, or if majority approves - this endpoint is admin direct for now)
app.post('/api/moderation/proposals/:id/execute', authenticateToken, (req, res) => {
    // This endpoint is simplified to be an Admin action.
    // Community-driven execution would require more complex vote counting and threshold logic here.
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required to directly execute proposals.' });
    }
    executeProposalAction(req.params.id, 'approved_by_admin', res, req.user.id);
});

async function executeProposalAction(proposalId, newStatus, res, executerId /* for logging */) {
  const proposal = await dbAsync.get('SELECT * FROM moderation_proposals WHERE id = ?', [proposalId]);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found.' });
  if (proposal.status !== 'pending') return res.status(400).json({ error: `Proposal already processed with status: ${proposal.status}.` });

  let success = false;
  try {
    await dbAsync.run('BEGIN TRANSACTION');
    let actionPerformed = false;

    if (newStatus.startsWith('approved')) { // 'approved_by_admin' or 'approved_by_vote'
      let targetTable = '';
      let targetField = 'name'; // Default field to change for 'edit'

      if (proposal.target_type === 'topic') targetTable = 'topics';
      else if (proposal.target_type === 'object') targetTable = 'objects';
      else if (proposal.target_type === 'rating') {
          targetTable = 'ratings';
          targetField = 'review'; // For ratings, 'edit' likely targets the review text
      } else {
          throw new Error('Invalid target_type in proposal.');
      }

      if (proposal.type === 'delete') {
        // More robust deletion (consider cascading or related data)
        if (targetTable === 'topics') {
            // Implement full topic deletion logic similar to DELETE /api/topics/:id
            // For now, simple delete:
            await dbAsync.run(`DELETE FROM ${targetTable} WHERE id = ?`, [proposal.target_id]);
        } else if (targetTable === 'objects') {
            // Implement full object deletion logic
            await dbAsync.run(`DELETE FROM ${targetTable} WHERE id = ?`, [proposal.target_id]);
        } else { // ratings
            await dbAsync.run(`DELETE FROM ${targetTable} WHERE id = ?`, [proposal.target_id]);
        }
        actionPerformed = true;
      } else if (proposal.type === 'edit') {
        await dbAsync.run(`UPDATE ${targetTable} SET ${targetField} = ? WHERE id = ?`, [proposal.new_value, proposal.target_id]);
        actionPerformed = true;
      }
    }
    // If newStatus is 'rejected_by_admin' or 'rejected_by_vote', no action on target, just update proposal status.

    if (actionPerformed || newStatus.startsWith('rejected')) {
      await dbAsync.run('UPDATE moderation_proposals SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, proposalId]);
      success = true;
    }

    await dbAsync.run('COMMIT');
    // TODO: Record in edit_history that a proposal led to this change.
    // recordEditHistory(proposal.target_type, proposal.target_id, executerId (or a system ID), `executed_proposal_${proposal.type}`, old_value, new_value_from_proposal);
    res.json({ success: true, message: `Proposal processed with status: ${newStatus}.` });

  } catch (error) {
    await dbAsync.run('ROLLBACK');
    console.error(`Error executing proposal ${proposalId}:`, error);
    res.status(500).json({ error: 'Database error during proposal execution.' });
  }
}


// --- Admin Endpoints ---
// List all users (admin only)
app.get('/api/admin/users', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const { page = 1, limit = 20, search = '' } = req.query;
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;

  const countSql = `SELECT COUNT(*) as total FROM users WHERE (username LIKE ? OR email LIKE ?)`;
  const usersSql = `SELECT id, username, email, is_admin, created_at, email_verified FROM users WHERE (username LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  db.get(countSql, [searchTerm, searchTerm], (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Database error counting users.' });
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    db.all(usersSql, [searchTerm, searchTerm, parseInt(limit), offset], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error fetching users.' });
        res.json({
            users: rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems: total,
                itemsPerPage: parseInt(limit),
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            }
        });
    });
  });
});

// Update user (admin only)
app.put('/api/admin/users/:id', authenticateToken, validateContent, (req, res) => { // Added validateContent
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const { username, email, is_admin, email_verified, newPassword } = req.body; // Added email_verified and newPassword
  const userId = req.params.id;

  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required.' });
  }
  if (newPassword) {
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.message });
    }
  }

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, userToUpdate) => {
    if (err) return res.status(500).json({ error: 'Database error fetching user.' });
    if (!userToUpdate) return res.status(404).json({ error: 'User not found.' });

    // Prevent admin from accidentally de-admining themselves if they are the only admin (optional, good practice)
    // This requires knowing if there are other admins. For simplicity, skipping this check here.

    let query = 'UPDATE users SET username = ?, email = ?, is_admin = ?, email_verified = ?';
    const params = [username, email, is_admin ? 1 : 0, email_verified ? 1 : 0];

    if (newPassword) {
        query += ', password = ?';
        params.push(bcrypt.hashSync(newPassword, 10));
    }
    query += ' WHERE id = ?';
    params.push(userId);

    db.run(query, params, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed: users.email')) {
                return res.status(400).json({ error: 'Email already in use by another account.' });
            }
            if (err.message.includes('UNIQUE constraint failed: users.username')) {
                return res.status(400).json({ error: 'Username already in use by another account.' });
            }
            return res.status(500).json({ error: 'Database error updating user.' });
        }
        db.get('SELECT id, username, email, is_admin, created_at, email_verified FROM users WHERE id = ?', [userId], (err, updatedUser) => {
            if (err) return res.status(500).json({ error: 'Database error fetching updated user.' });
            res.json({ success: true, user: updatedUser });
        });
    });
  });
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  const userIdToDelete = parseInt(req.params.id, 10);

  if (userIdToDelete === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account.' });
  }

  try {
    await dbAsync.run('BEGIN TRANSACTION');
    // Consider what to do with user's content: nullify creator_id, delete, or reassign.
    // For now, let's nullify creator_id for topics and objects. Ratings, votes, etc., will be deleted.
    await dbAsync.run('UPDATE topics SET creator_id = NULL WHERE creator_id = ?', [userIdToDelete]);
    await dbAsync.run('UPDATE objects SET creator_id = NULL WHERE creator_id = ?', [userIdToDelete]);
    await dbAsync.run('DELETE FROM ratings WHERE user_id = ?', [userIdToDelete]);
    await dbAsync.run('DELETE FROM votes WHERE user_id = ?', [userIdToDelete]);
    await dbAsync.run('DELETE FROM moderation_proposals WHERE proposer_id = ?', [userIdToDelete]); // Or update status to 'cancelled'
    await dbAsync.run('DELETE FROM user_ratings WHERE rater_user_id = ? OR rated_user_id = ?', [userIdToDelete, userIdToDelete]);
    await dbAsync.run('DELETE FROM user_restrictions WHERE user_id = ?', [userIdToDelete]);
    await dbAsync.run('DELETE FROM edit_history WHERE editor_id = ?', [userIdToDelete]); // Or nullify editor_id
    await dbAsync.run('DELETE FROM pending_registrations WHERE email IN (SELECT email FROM users WHERE id = ?)', [userIdToDelete]);
    const result = await dbAsync.run('DELETE FROM users WHERE id = ?', [userIdToDelete]);
    await dbAsync.run('COMMIT');

    if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, message: 'User and associated non-critical data deleted/anonymized.' });

  } catch (error) {
    await dbAsync.run('ROLLBACK');
    console.error(`Error deleting user ${userIdToDelete}:`, error);
    res.status(500).json({ error: 'Database error during user deletion.' });
  }
});

// Admin approve/reject proposal directly
app.post('/api/admin/proposals/:id/approve', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  executeProposalAction(req.params.id, 'approved_by_admin', res, req.user.id);
});

app.post('/api/admin/proposals/:id/reject', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  executeProposalAction(req.params.id, 'rejected_by_admin', res, req.user.id);
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

    // Using Promise.all for parallel queries
    Promise.all([
        dbAsync.all(`
            SELECT 'topic_created' as type, id as item_id, name as item_name, created_at as timestamp
            FROM topics
            WHERE creator_id = ? AND created_at >= ?
            ORDER BY created_at DESC LIMIT 50
        `, [userId, thirtyDaysAgo]),
        dbAsync.all(`
            SELECT 'object_created' as type, o.id as item_id, o.name as item_name, o.created_at as timestamp, t.id as topic_id, t.name as topic_name
            FROM objects o
            LEFT JOIN topics t ON o.topic_id = t.id
            WHERE o.creator_id = ? AND o.created_at >= ?
            ORDER BY o.created_at DESC LIMIT 50
        `, [userId, thirtyDaysAgo]),
        dbAsync.all(`
            SELECT 'rating_submitted' as type, r.id as item_id, o.name as item_name, r.created_at as timestamp,
                   r.rating, r.review, t.id as topic_id, t.name as topic_name, o.id as object_id
            FROM ratings r
            LEFT JOIN objects o ON r.object_id = o.id
            LEFT JOIN topics t ON o.topic_id = t.id
            WHERE r.user_id = ? AND r.created_at >= ?
            ORDER BY r.created_at DESC LIMIT 50
        `, [userId, thirtyDaysAgo]),
        dbAsync.all(`
            SELECT 'proposal_created' as type, id as item_id, type as proposal_type, target_type,
                   created_at as timestamp, status, reason, target_id, new_value
            FROM moderation_proposals
            WHERE proposer_id = ? AND created_at >= ?
            ORDER BY created_at DESC LIMIT 50
        `, [userId, thirtyDaysAgo]),
        dbAsync.all(`
            SELECT 'vote_cast' as type, v.id as item_id, v.created_at as timestamp, v.vote,
                   mp.id as proposal_id, mp.type as proposal_type, mp.target_type
            FROM votes v
            LEFT JOIN moderation_proposals mp ON v.proposal_id = mp.id
            WHERE v.user_id = ? AND v.created_at >= ?
            ORDER BY v.created_at DESC LIMIT 50
        `, [userId, thirtyDaysAgo]),
        dbAsync.all(`
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
        `, [userId, thirtyDaysAgo, userId, thirtyDaysAgo, userId, thirtyDaysAgo]) // Use thirtyDaysAgo for consistency
    ]).then(([topicActivity, objectActivity, ratingActivity, proposalActivity, voteActivity, dailyStats]) => {
        const allActivity = [
            ...topicActivity,
            ...objectActivity,
            ...ratingActivity,
            ...proposalActivity,
            ...voteActivity
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        stats.recent_activity = allActivity.slice(0, 100); // Overall limit for combined recent activity
        stats.daily_activity = dailyStats;
        res.json(stats);
    }).catch(activityErr => {
        console.error("Error fetching user activity:", activityErr);
        res.status(500).json({ error: 'Database error fetching activity.' });
    });
  });
});

// Update user profile
app.put('/api/users/:id/profile', authenticateToken, validateContent, (req, res) => {
  const userIdToUpdate = parseInt(req.params.id, 10);
  const { username, email, currentPassword, newPassword } = req.body;

  if (userIdToUpdate !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
  }
  // Admin cannot use this route to change other users' passwords without their current password
  if (req.user.isAdmin && userIdToUpdate !== req.user.id && newPassword) {
    return res.status(403).json({ error: 'Admins must use the admin user management endpoint to change other users\' passwords.'});
  }


  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required.' });
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change password.' });
    }
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }
  }

  db.get('SELECT * FROM users WHERE id = ?', [userIdToUpdate], (err, currentUser) => {
    if (err) return res.status(500).json({ error: 'Database error fetching user.' });
    if (!currentUser) return res.status(404).json({ error: 'User not found.' });

    if (newPassword && !bcrypt.compareSync(currentPassword, currentUser.password)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    // Check for duplicate username/email (excluding current user if username/email hasn't changed)
    let conflictChecks = [];
    if (username.toLowerCase() !== currentUser.username.toLowerCase()) {
        conflictChecks.push(dbAsync.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userIdToUpdate]));
    }
    if (email.toLowerCase() !== currentUser.email.toLowerCase()) {
        conflictChecks.push(dbAsync.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, userIdToUpdate]));
    }

    Promise.all(conflictChecks).then(results => {
        if (results.some(r => r)) { // If any query returned a user, there's a conflict
            // More specific error message would require checking which query failed
            return res.status(400).json({ error: 'Username or email already exists.' });
        }

        let updateQuery = 'UPDATE users SET username = ?, email = ?';
        let updateParams = [username, email];

        if (newPassword) {
          const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
          updateQuery += ', password = ?';
          updateParams.push(hashedNewPassword);
        }

        // If email is changed, mark as unverified (unless user is an admin editing their own profile)
        let emailChanged = email.toLowerCase() !== currentUser.email.toLowerCase();
        if (emailChanged && !(req.user.isAdmin && userIdToUpdate === req.user.id)) {
            // updateQuery += ', email_verified = 0'; // Logic for re-verification needed if this is enabled
            // For now, let's assume email verification status doesn't change on profile update to avoid complexity.
            // If re-verification is desired, a new verification email should be sent.
        }


        updateQuery += ' WHERE id = ?';
        updateParams.push(userIdToUpdate);

        db.run(updateQuery, updateParams, function(err) {
          if (err) return res.status(500).json({ error: 'Database error updating profile.' });

          db.get('SELECT id, username, email, is_admin, email_verified FROM users WHERE id = ?', [userIdToUpdate], (err, user) => {
            if (err) return res.status(500).json({ error: 'Database error fetching updated profile.' });

            let token = null;
            if (userIdToUpdate === req.user.id) { // Only regenerate token if the user is updating their own profile
                 token = jwt.sign({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    isAdmin: !!user.is_admin
                }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            }

            res.json({
              success: true,
              user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: !!user.is_admin,
                emailVerified: !!user.email_verified
              },
              token: token, // Will be null if admin edited another user
              message: newPassword ? 'Profile and password updated successfully!' : 'Profile updated successfully!'
            });
          });
        });
    }).catch(promiseErr => {
        console.error("Error checking for username/email conflicts:", promiseErr);
        return res.status(500).json({ error: 'Database error checking for conflicts.' });
    });
  });
});

// --- User Profile and Rating Endpoints ---

// Get public user profile
app.get('/api/users/:id/profile', (req, res) => {
  const userId = req.params.id;

  db.get(`
    SELECT u.id, u.username, u.created_at, u.email_verified,
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
      SELECT restriction_type, start_date, end_date, reason FROM user_restrictions
      WHERE user_id = ?
      AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
      ORDER BY end_date DESC LIMIT 1
    `, [userId], (err, restriction) => {
      if (err) return res.status(500).json({ error: 'Database error.' });

      user.is_restricted = !!restriction;
      user.restriction_details = restriction || null;

      res.json(user);
    });
  });
});

// Rate a user (like/dislike) - one rating per user per day
app.post('/api/users/:id/rate', authenticateToken, (req, res) => {
  const ratedUserId = parseInt(req.params.id, 10);
  const raterUserId = req.user.id;
  const { rating } = req.body; // 1 for like, -1 for dislike

  if (rating !== 1 && rating !== -1) {
    return res.status(400).json({ error: 'Rating must be 1 (like) or -1 (dislike).' });
  }

  if (ratedUserId === raterUserId) {
    return res.status(400).json({ error: 'Cannot rate yourself.' });
  }

  db.get('SELECT id FROM users WHERE id = ?', [ratedUserId], (err, userExists) => {
    if (err) return res.status(500).json({ error: 'Database error checking user.' });
    if (!userExists) return res.status(404).json({ error: 'User to be rated not found.' });

    db.get('SELECT * FROM user_ratings WHERE rated_user_id = ? AND rater_user_id = ?',
      [ratedUserId, raterUserId], (err, existingRating) => {
        if (err) return res.status(500).json({ error: 'Database error checking existing user rating.' });

        const today = new Date().toISOString().slice(0, 10);
        const isNewRating = !existingRating;
        let canProceed = false;

        if (isNewRating) {
            // Check daily limit for new user ratings (non-admins)
            if (!req.user.isAdmin) {
                db.get(`SELECT COUNT(*) as count FROM user_ratings WHERE rater_user_id = ? AND DATE(created_at) = DATE('now')`,
                  [raterUserId], (err, dailyCount) => {
                    if (err) return res.status(500).json({ error: 'Database error checking daily user rating limit.' });
                    if (dailyCount.count >= 32) {
                        return res.status(403).json({ error: 'Daily user rating limit reached (32 new user ratings per day).' });
                    }
                    processUserRating(isNewRating, existingRating, ratedUserId, raterUserId, rating, res);
                });
            } else {
                processUserRating(isNewRating, existingRating, ratedUserId, raterUserId, rating, res);
            }
        } else { // Existing rating, check update conditions
            const updatedAtDate = existingRating.updated_at ? new Date(existingRating.updated_at).toISOString().slice(0, 10) : null;
            const createdAtDate = new Date(existingRating.created_at).toISOString().slice(0, 10);

            if (existingRating.rating === rating) { // No change in rating value
                return res.status(200).json({ success: true, message: 'Rating is already set to this value.', noChange: true });
            }

            if (updatedAtDate === today && updatedAtDate !== createdAtDate && !req.user.isAdmin) {
                 return res.status(403).json({ error: 'You can only modify your rating for a user once per day.' });
            }
            processUserRating(isNewRating, existingRating, ratedUserId, raterUserId, rating, res);
        }
      });
  });
});

async function processUserRating(isNewRating, existingRating, ratedUserId, raterUserId, rating, res) {
    try {
        await dbAsync.run('BEGIN TRANSACTION');
        if (isNewRating) {
            await dbAsync.run(`INSERT INTO user_ratings (rated_user_id, rater_user_id, rating, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [ratedUserId, raterUserId, rating]);
        } else {
            await dbAsync.run(`UPDATE user_ratings SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [rating, existingRating.id]);
        }

        // Check and apply restrictions based on dislikes
        const { dislike_count } = await dbAsync.get(`SELECT COUNT(*) as dislike_count FROM user_ratings WHERE rated_user_id = ? AND rating = -1`, [ratedUserId]);
        const restrictionReason = `Automatic editing ban due to ${dislike_count} dislikes.`;
        const restrictionThreshold = 5; // Ban for every 5 dislikes

        if (dislike_count > 0 && dislike_count % restrictionThreshold === 0) {
            const activeRestriction = await dbAsync.get(`
                SELECT * FROM user_restrictions
                WHERE user_id = ? AND restriction_type = 'editing_ban'
                AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP
            `, [ratedUserId]);

            if (!activeRestriction) { // Only apply if no active editing ban exists
                const daysToBan = Math.floor(dislike_count / restrictionThreshold); // e.g., 5 dislikes = 1 day, 10 dislikes = 2 days
                const startDate = new Date().toISOString();
                const endDate = new Date(Date.now() + daysToBan * 24 * 60 * 60 * 1000).toISOString();

                await dbAsync.run(`
                    INSERT INTO user_restrictions (user_id, restriction_type, start_date, end_date, reason)
                    VALUES (?, 'editing_ban', ?, ?, ?)
                `, [ratedUserId, startDate, endDate, restrictionReason]);
                console.log(`User ${ratedUserId} restricted until ${endDate} due to ${dislike_count} dislikes.`);
            }
        }
        await dbAsync.run('COMMIT');
        res.json({ success: true, message: `User rating ${isNewRating ? 'submitted' : 'updated'}.`, dislike_count: dislike_count, isUpdate: !isNewRating });

    } catch (error) {
        await dbAsync.run('ROLLBACK');
        console.error("Error processing user rating:", error);
        res.status(500).json({ error: 'Database error processing user rating.' });
    }
}


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
  if (!contentFilter.getCategories().includes(category)) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  const words = contentFilter.getSensitiveWords(category);
  res.json({ category, words });
});

// Add words to a category
app.post('/api/admin/content-filter/:category/words', authenticateToken, (req, res) => { // Removed validateContent for this specific admin op
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  const category = req.params.category;
  const { words } = req.body;

  if (!contentFilter.getCategories().includes(category)) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  if (!Array.isArray(words) || words.some(w => typeof w !== 'string')) {
    return res.status(400).json({ error: 'Words must be an array of strings.' });
  }
  if (words.length === 0) {
    return res.status(400).json({ error: 'Words array cannot be empty.' });
  }

  // Words for the filter are typically single words or short phrases, no need for complex parsing like tags
  const cleanedWords = words.map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
  if (cleanedWords.length === 0) {
    return res.status(400).json({ error: 'No valid words after cleaning.' });
  }

  try {
    contentFilter.addSensitiveWords(category, cleanedWords);
    const updatedWords = contentFilter.getSensitiveWords(category);

    res.json({
      success: true,
      category,
      addedCount: cleanedWords.length,
      totalInCategory: updatedWords.length
    });
  } catch (error) {
    console.error(`Error adding words to content filter category ${category}:`, error);
    res.status(500).json({ error: 'Failed to add words.' });
  }
});

// Remove words from a category
app.delete('/api/admin/content-filter/:category/words', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  const category = req.params.category;
  const { words } = req.body;

  if (!contentFilter.getCategories().includes(category)) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  if (!Array.isArray(words) || words.some(w => typeof w !== 'string')) {
    return res.status(400).json({ error: 'Words must be an array of strings.' });
  }
  if (words.length === 0) {
    return res.status(400).json({ error: 'Words array cannot be empty.' });
  }

  const wordsToRemove = words.map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

  try {
    contentFilter.removeSensitiveWords(category, wordsToRemove);
    const updatedWords = contentFilter.getSensitiveWords(category);

    res.json({
      success: true,
      category,
      removedAttemptCount: wordsToRemove.length,
      totalInCategory: updatedWords.length
    });
  } catch (error) {
    console.error(`Error removing words from content filter category ${category}:`, error);
    res.status(500).json({ error: 'Failed to remove words.' });
  }
});

// Test content against filter
app.post('/api/admin/content-filter/test', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  const { text } = req.body;

  if (text === undefined || typeof text !== 'string') { // Allow empty string for testing
    return res.status(400).json({ error: 'Text (string) is required.' });
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
    res.status(409).json({ error: 'Email is already in the blocked list.' }); // 409 Conflict
  }
});

// Remove email from blocked list
app.delete('/api/admin/blocked-emails', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  const { email } = req.body; // Using body for DELETE, alternative is query param

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
    res.status(404).json({ error: 'Email is not in the blocked list.' }); // 404 Not Found
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

  if (enabled === undefined || typeof enabled !== 'boolean') { // enabled is mandatory
    return res.status(400).json({ error: 'enabled (boolean) is a required field.' });
  }

  if (allowedDomains !== undefined) { // Optional, but if provided, must be valid
    if (!Array.isArray(allowedDomains) || allowedDomains.some(d => typeof d !== 'string' || !d.startsWith('.'))) {
      return res.status(400).json({ error: 'allowedDomains must be an array of strings, each starting with a dot (e.g., ".edu").' });
    }
  }

  if (message !== undefined && (message !== null && typeof message !== 'string')) { // Optional, but if provided, must be string or null
    return res.status(400).json({ error: 'message must be a string or null.' });
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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }


  const domainCheck = isEmailDomainAllowed(email);
  const settings = getDomainRestrictionStatus();

  res.json({
    email: email.toLowerCase(),
    allowed: domainCheck.allowed,
    message: domainCheck.message || (domainCheck.allowed ? 'Email domain is allowed' : 'Email domain is not allowed by current restrictions.'),
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
if (availableConfigs.length > 0) {
    console.log(`Available email configs (${availableConfigs.length}):`);
    availableConfigs.forEach((config, index) => {
    console.log(`${index + 1}. ${config.name} - Host: ${config.host || config.service}, Port: ${config.port || 'default'}, User: ${config.auth.user}`);
    });
} else {
    console.log('No email configurations are currently available. Email sending will be disabled.');
}

if (process.env.EMAIL_PASSWORD) {
  console.log('163.com email password (auth code): ✓ Set');
} else {
  console.log('163.com email password (auth code): ✗ Not set (163.com config will be unavailable)');
}
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  console.log('Gmail credentials: ✓ Set');
} else {
  console.log('Gmail credentials: ✗ Not set (Gmail config will be unavailable)');
}
// Add similar checks for Outlook if you use it.

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
  let sql = `
      SELECT DISTINCT t.id, t.name, t.creator_id, t.created_at, u.username as creator_username,
                      (SELECT COUNT(*) FROM objects WHERE topic_id = t.id) as object_count
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
  `;
  let countSql = 'SELECT COUNT(DISTINCT t.id) as total FROM topics t';

  let whereConditions = [];
  let params = []; // For data query
  let countParams = []; // For count query, might be slightly different if JOINs are only for filtering

  // Text search
  if (query && query.trim()) {
    whereConditions.push('t.name LIKE ? COLLATE NOCASE'); // Added COLLATE NOCASE
    const searchTerm = `%${query.trim()}%`;
    params.push(searchTerm);
    countParams.push(searchTerm);
  }

  // Tag search
  if (tags && tags.trim()) {
    const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag); // lowercased
    if (tagArray.length > 0) {
      sql += ` LEFT JOIN topic_tags tt_join ON t.id = tt_join.topic_id
               LEFT JOIN tags tag_join ON tt_join.tag_id = tag_join.id`;
      // For countSql, the join is only needed if it's part of the WHERE condition.
      // If we use subqueries for tags, the main count query doesn't need the join directly.

      if (tagLogic === 'and') {
        const placeholders = tagArray.map(() => '?').join(',');
        whereConditions.push(`
            t.id IN (
                SELECT tt.topic_id
                FROM topic_tags tt
                JOIN tags ta ON tt.tag_id = ta.id
                WHERE LOWER(ta.name) IN (${placeholders})
                GROUP BY tt.topic_id
                HAVING COUNT(DISTINCT LOWER(ta.name)) = ?
            )
        `);
        params.push(...tagArray, tagArray.length);
        countParams.push(...tagArray, tagArray.length); // This makes countParams potentially complex
      } else { // 'or' logic
        const placeholders = tagArray.map(() => '?').join(',');
        whereConditions.push(`EXISTS (
            SELECT 1
            FROM topic_tags tt
            JOIN tags ta ON tt.tag_id = ta.id
            WHERE tt.topic_id = t.id AND LOWER(ta.name) IN (${placeholders})
        )`);
        params.push(...tagArray);
        countParams.push(...tagArray);
      }
       // Adjust countSql if joins are only for filtering in whereConditions
       if (!countSql.includes('topic_tags')) { // Add joins to countSql if not already present and needed for tag filtering.
        countSql += ` LEFT JOIN topic_tags tt_join_count ON t.id = tt_join_count.topic_id
                      LEFT JOIN tags tag_join_count ON tt_join_count.tag_id = tag_join_count.id`;
      }
    }
  }

  // Build WHERE clause
  if (whereConditions.length > 0) {
    const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
    sql += whereClause;
    countSql += whereClause; // Apply same conditions to count
  }

  sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?'; // Consider making sort configurable
  params.push(parseInt(limit), offset);

  try {
    const countResult = await dbAsync.get(countSql, countParams);
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    const rows = await dbAsync.all(sql, params);

    return {
      items: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    };
  } catch (err) {
    console.error("Error in searchTopicsOptimized:", err);
    throw err; // Re-throw to be caught by the route handler
  }
}

async function searchObjectsOptimized(query, tags, tagLogic, limit, offset, page) {
  let sql = `
      SELECT DISTINCT o.id, o.name, o.creator_id, o.topic_id, o.created_at,
                      u.username as creator_username, top.name as topic_name,
                      COALESCE(AVG(r.rating), 0) as avg_rating,
                      COUNT(DISTINCT r.id) as rating_count
      FROM objects o
      LEFT JOIN users u ON o.creator_id = u.id
      LEFT JOIN topics top ON o.topic_id = top.id
      LEFT JOIN ratings r ON o.id = r.object_id
  `;
  let countSql = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM objects o
      LEFT JOIN topics top_count ON o.topic_id = top_count.id
  `; // Simpler count base

  let whereConditions = [];
  let params = [];
  let countParams = [];


  // Text search (object name or topic name)
  if (query && query.trim()) {
    whereConditions.push('(o.name LIKE ? COLLATE NOCASE OR top.name LIKE ? COLLATE NOCASE)');
    const searchTerm = `%${query.trim()}%`;
    params.push(searchTerm, searchTerm);
    countParams.push(searchTerm, searchTerm);
  }

  // Tag search
  if (tags && tags.trim()) {
    const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
    if (tagArray.length > 0) {
      sql += ` LEFT JOIN object_tags ot_join ON o.id = ot_join.object_id
               LEFT JOIN tags tag_join ON ot_join.tag_id = tag_join.id`;
      // Add to countSql if not using subquery for WHERE
      if (!countSql.includes('object_tags')) {
         countSql += ` LEFT JOIN object_tags ot_join_count ON o.id = ot_join_count.object_id
                       LEFT JOIN tags tag_join_count ON ot_join_count.tag_id = tag_join_count.id`;
      }


      if (tagLogic === 'and') {
        const placeholders = tagArray.map(() => '?').join(',');
        whereConditions.push(`
            o.id IN (
                SELECT ot.object_id
                FROM object_tags ot
                JOIN tags ta ON ot.tag_id = ta.id
                WHERE LOWER(ta.name) IN (${placeholders})
                GROUP BY ot.object_id
                HAVING COUNT(DISTINCT LOWER(ta.name)) = ?
            )
        `);
        params.push(...tagArray, tagArray.length);
        countParams.push(...tagArray, tagArray.length);
      } else { // 'or' logic
        const placeholders = tagArray.map(() => '?').join(',');
        whereConditions.push(`EXISTS (
            SELECT 1
            FROM object_tags ot
            JOIN tags ta ON ot.tag_id = ta.id
            WHERE ot.object_id = o.id AND LOWER(ta.name) IN (${placeholders})
        )`);
        params.push(...tagArray);
        countParams.push(...tagArray);
      }
    }
  }

  if (whereConditions.length > 0) {
    const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
    sql += whereClause;
    countSql += whereClause;
  }

  sql += ' GROUP BY o.id ORDER BY avg_rating DESC, o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  try {
    const countResult = await dbAsync.get(countSql, countParams);
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    const rows = await dbAsync.all(sql, params);
    return {
      items: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    };
  } catch (err) {
    console.error("Error in searchObjectsOptimized:", err);
    throw err;
  }
}


// Cache control headers middleware for better performance
app.use((req, res, next) => {
  // Set cache headers for static data
  if (req.method === 'GET') {
    const path = req.path.toLowerCase();
    if (path.startsWith('/api/topics') ||
        path.startsWith('/api/objects') || // Be careful with object listings if ratings change often
        path.startsWith('/api/tags') && !path.includes('/objects')) { // Cache general tag list
      res.set('Cache-Control', 'public, max-age=120'); // 2 minutes cache
    } else if (path.startsWith('/api/search')) {
      res.set('Cache-Control', 'public, max-age=60'); // 1 minute cache for search
    } else if (path.includes('/ratings') || path.includes('/my-rating') || path.startsWith('/api/users/') && path.endsWith('/profile')) {
      res.set('Cache-Control', 'public, max-age=30'); // Shorter cache for dynamic content
    } else if (path === '/api/health' || path === '/api/email-status' || path === '/api/domain-restrictions') {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // No cache for status endpoints
    }
  }
  next();
});

// Add database indexing on startup for better query performance
const addDatabaseIndexes = () => {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_topics_creator_id ON topics(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_objects_topic_id ON objects(topic_id)',
    'CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_objects_created_at ON objects(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_objects_creator_id ON objects(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_object_id ON ratings(object_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_topic_tags_topic_id_tag_id ON topic_tags(topic_id, tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_topic_tags_tag_id ON topic_tags(tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_object_tags_object_id_tag_id ON object_tags(object_id, tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_object_tags_tag_id ON object_tags(tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_edit_history_target ON edit_history(target_type, target_id)',
    'CREATE INDEX IF NOT EXISTS idx_edit_history_editor_id ON edit_history(editor_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON pending_registrations(email)',
    'CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at ON pending_registrations(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_user_ratings_rated_user_id ON user_ratings(rated_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_ratings_rater_user_id ON user_ratings(rater_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_restrictions_user_id_type ON user_restrictions(user_id, restriction_type)',
    'CREATE INDEX IF NOT EXISTS idx_user_restrictions_end_date ON user_restrictions(end_date)',
    'CREATE INDEX IF NOT EXISTS idx_moderation_proposals_status ON moderation_proposals(status)',
    'CREATE INDEX IF NOT EXISTS idx_votes_proposal_id_user_id ON votes(proposal_id, user_id)'
  ];

  db.serialize(() => {
    indexes.forEach(indexSql => {
        db.run(indexSql, (err) => {
        if (err) {
            // It's common for "index already exists" to be a warning rather than an error if using "IF NOT EXISTS"
            // but other errors should be logged seriously.
            if (!err.message.includes("already exists")) {
                 console.warn(`Index creation warning/error: ${err.message} for SQL: ${indexSql}`);
            }
        }
        });
    });
    console.log('Database indexes processed (created if not exist).');
  });
};

// Development endpoint to get verification codes (remove in production)
app.get('/api/dev/pending-registrations', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found in production.' });
  }

  db.all('SELECT id, username, email, verification_code, created_at, expires_at FROM pending_registrations ORDER BY created_at DESC LIMIT 10', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

// Development endpoint to manually verify a user
app.post('/api/dev/verify-user', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found in production.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Find pending registration
  db.get('SELECT * FROM pending_registrations WHERE email = ?', [email], (err, pendingReg) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!pendingReg) return res.status(404).json({ error: 'Pending registration not found for this email.' });

    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', [pendingReg.email, pendingReg.username], (err, existingUser) => {
        if (err) return res.status(500).json({ error: 'Database error checking existing user.' });
        if (existingUser) {
            db.run('DELETE FROM pending_registrations WHERE id = ?', [pendingReg.id]);
            return res.status(400).json({ error: 'User with this email or username already exists.' });
        }

        // Create user account
        db.run('INSERT INTO users (username, email, password, email_verified) VALUES (?, ?, ?, ?)',
            [pendingReg.username, pendingReg.email, pendingReg.password_hash, 1], function(err) {
            if (err) return res.status(500).json({ error: 'Database error creating user.' });

            const userId = this.lastID;

            // Clean up pending registration
            db.run('DELETE FROM pending_registrations WHERE id = ?', [pendingReg.id]);

            // Generate JWT token
            const token = jwt.sign({
                id: userId,
                username: pendingReg.username,
                email: pendingReg.email,
                isAdmin: false // Newly verified users are not admins by default
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
                message: 'User verified successfully via dev endpoint!'
            });
            });
    });
  });
});