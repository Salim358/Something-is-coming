require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const sqlite3    = require('better-sqlite3');
const cors       = require('cors');
const path       = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ═══════════════════════════════════════════════
   DATABASE SETUP — SQLite (file-based, zero config)
   Creates waitlist.db automatically on first run.
   ═══════════════════════════════════════════════ */
const db = new sqlite3('waitlist.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT    NOT NULL UNIQUE,
    source    TEXT    DEFAULT 'Coming Soon Page',
    signed_up TEXT    DEFAULT (datetime('now'))
  )
`);

/* ═══════════════════════════════════════════════
   EMAIL TRANSPORTER — Nodemailer via Gmail SMTP
   ═══════════════════════════════════════════════ */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,   // your Gmail address
    pass: process.env.GMAIL_PASS    // your Gmail App Password (not your real password)
  }
});

/* ═══════════════════════════════════════════════
   MIDDLEWARE
   ═══════════════════════════════════════════════ */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves index.html

/* ═══════════════════════════════════════════════
   POST /api/signup
   1. Validate email
   2. Save to SQLite
   3. Send owner notification
   4. Send user confirmation
   ═══════════════════════════════════════════════ */
app.post('/api/signup', async (req, res) => {
  const { email } = req.body;

  // 1 — Validate
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // 2 — Save to database (handle duplicate gracefully)
  try {
    const insert = db.prepare(
      'INSERT INTO subscribers (email) VALUES (?)'
    );
    insert.run(email);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This email is already on the list.' });
    }
    console.error('DB error:', err.message);
    return res.status(500).json({ error: 'Database error. Please try again.' });
  }

  // 3 — Notify the owner
  try {
    await transporter.sendMail({
      from:    `"Something Is Coming" <${process.env.GMAIL_USER}>`,
      to:      process.env.OWNER_EMAIL,
      subject: '🔔 New Signup — Something Is Coming',
      html: `
        <div style="font-family:monospace;padding:24px;background:#080808;color:#f5f0e8;border-radius:6px;">
          <p style="color:#c9a84c;font-size:11px;letter-spacing:3px;text-transform:uppercase;">New Subscriber</p>
          <h2 style="font-size:22px;margin:8px 0 4px;">${email}</h2>
          <p style="color:#888;font-size:12px;">Signed up on ${new Date().toLocaleString()}</p>
          <p style="color:#888;font-size:12px;">Source: Coming Soon Page</p>
        </div>
      `
    });
  } catch (err) {
    // Non-fatal — email failure shouldn't block the response
    console.error('Owner notification failed:', err.message);
  }

  // 4 — Confirm to the subscriber
  try {
    await transporter.sendMail({
      from:    `"Something Is Coming" <${process.env.GMAIL_USER}>`,
      to:      email,
      subject: "You're on the list.",
      html: `
        <div style="font-family:'Georgia',serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#080808;color:#f5f0e8;">
          <p style="font-family:monospace;font-size:10px;letter-spacing:4px;color:#c9a84c;text-transform:uppercase;margin-bottom:32px;">
            — Something Is Coming —
          </p>
          <h1 style="font-size:28px;font-weight:300;line-height:1.3;margin-bottom:20px;">
            You're on the list.
          </h1>
          <p style="font-size:15px;line-height:1.8;color:rgba(245,240,232,0.75);margin-bottom:16px;">
            We'll reach out the moment the doors open — before anyone else.
            The first run is small, and you're already ahead.
          </p>
          <p style="font-size:15px;line-height:1.8;color:rgba(245,240,232,0.75);margin-bottom:40px;">
            Sit tight. It's almost here.
          </p>
          <p style="font-family:monospace;font-size:10px;letter-spacing:2px;color:rgba(245,240,232,0.25);text-transform:uppercase;">
            You can unsubscribe anytime — no hard feelings.
          </p>
        </div>
      `
    });
  } catch (err) {
    console.error('User confirmation failed:', err.message);
  }

  return res.status(200).json({ message: 'Success' });
});

/* ═══════════════════════════════════════════════
   GET /api/subscribers  (admin — protect this!)
   View all subscribers in JSON format.
   ═══════════════════════════════════════════════ */
app.get('/api/subscribers', (req, res) => {
  // ⚠ Add password protection before going live!
  // e.g. if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).end();
  const rows = db.prepare('SELECT * FROM subscribers ORDER BY signed_up DESC').all();
  res.json({ total: rows.length, subscribers: rows });
});

/* ═══════════════════════════════════════════════
   START SERVER
   ═══════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}`);
  console.log(`  → Waitlist page: http://localhost:${PORT}`);
  console.log(`  → View list:     http://localhost:${PORT}/api/subscribers\n`);
});
