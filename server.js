require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const Stripe = require("stripe");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Stripe ────────────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// ── Constants ─────────────────────────────────────────────────────────────────
const FREE_LIMIT = 3;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const BASE_URL =
  process.env.BASE_URL || "https://meal-plan-app-2nn3.onrender.com";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysUntilReset(resetAt) {
  const next = (resetAt || Date.now()) + MONTH_MS;
  return Math.max(1, Math.ceil((next - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function logEmailLead({ email, name, source }) {
  console.log(
    JSON.stringify({ type: "email_lead", email, name, source, ts: new Date().toISOString() })
  );
}

function buildMealPrompt({ budget, days, diet, goal, cuisines }) {
  const dayCount = Math.min(parseInt(days) || 7, 14);
  const budgetAmount = parseFloat(budget) || 50;
  const perDay = (budgetAmount / dayCount).toFixed(2);
  const dietLabel = diet || "balanced";
  const goalLabel = goal || "general health";
  const cuisineLabel =
    Array.isArray(cuisines) && cuisines.length
      ? cuisines.join(", ")
      : "any cuisine";

  return `Create a ${dayCount}-day ${dietLabel} meal plan. Total budget: €${budgetAmount} (€${perDay}/day). Goal: ${goalLabel}. Cuisine: ${cuisineLabel}.

Format EXACTLY like this:

## DAY-BY-DAY PLAN

**Day 1**
- Breakfast: [meal name] | Ingredients: [list with weights] | Cost: €X.XX | Prep: Xmin
- Lunch: [meal name] | Ingredients: [list with weights] | Cost: €X.XX | Prep: Xmin
- Dinner: [meal name] | Ingredients: [list with weights] | Cost: €X.XX | Prep: Xmin
- Snack: [snack name] | Cost: €X.XX

[repeat for all ${dayCount} days]

## GROCERY LIST

**Produce**
- [item]: [total qty needed] | ~€X.XX

**Protein**
- [item]: [total qty needed] | ~€X.XX

**Dairy**
- [item]: [total qty needed] | ~€X.XX

**Pantry**
- [item]: [total qty needed] | ~€X.XX

## NUTRITION SUMMARY
- Daily average: ~XXXX kcal | Protein: XXg | Carbs: XXg | Fat: XXg
- Total estimated cost: ~€${budgetAmount}

Be specific with quantities (grams, ml, pieces). Keep total within the €${budgetAmount} budget. Use realistic European supermarket prices.`;
}

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));

// ── Stripe webhook — MUST be before express.json() ───────────────────────────
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      if (process.env.STRIPE_WEBHOOK_SECRET && stripe) {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } else {
        event = JSON.parse(req.body.toString());
      }
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const email =
        event.data.object.customer_email ||
        event.data.object.customer_details?.email;
      if (email) {
        await db
          .query("UPDATE users SET premium = true WHERE email = $1", [email])
          .catch(console.error);
      }
    }

    res.sendStatus(200);
  }
);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "mealzy-change-before-deploying",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── DB init ───────────────────────────────────────────────────────────────────
app.get("/api/init-db", async (_req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        usage INT DEFAULT 0,
        premium BOOLEAN DEFAULT false,
        reset_at BIGINT DEFAULT 0,
        reset_token TEXT,
        reset_token_expiry BIGINT,
        created_at BIGINT DEFAULT 0
      )
    `);
    const newCols = [
      "name TEXT",
      "reset_at BIGINT DEFAULT 0",
      "reset_token TEXT",
      "reset_token_expiry BIGINT",
      "created_at BIGINT DEFAULT 0",
    ];
    for (const col of newCols) {
      await db
        .query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`)
        .catch(() => {});
    }
    res.json({ success: true, message: "Database ready" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email leads ───────────────────────────────────────────────────────────────
app.post("/api/email-leads", async (req, res) => {
  const { email, name, source } = req.body;
  await logEmailLead({ email, name, source });
  res.json({ success: true });
});

// ── Register ──────────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = name?.trim() || email.split("@")[0];

    await db.query(
      "INSERT INTO users (name, email, password, created_at) VALUES ($1, $2, $3, $4)",
      [displayName, email.toLowerCase().trim(), hashedPassword, Date.now()]
    );

    await logEmailLead({ email, name: displayName, source: "welcome" });

    res.json({ success: true });
  } catch (err) {
    if (err.code === "23505")
      return res.json({ error: "An account with this email already exists" });
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];

    if (!user)
      return res.json({ error: "No account found with that email" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ error: "Incorrect password" });

    req.session.user = user.email;
    res.json({ success: true, name: user.name, premium: user.premium });
  } catch (err) {
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Me ────────────────────────────────────────────────────────────────────────
app.get("/api/me", async (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });

  try {
    const result = await db.query(
      "SELECT id, name, email, usage, premium, reset_at FROM users WHERE email = $1",
      [req.session.user]
    );
    const user = result.rows[0];
    if (!user) return res.json({ loggedIn: false });

    if (Date.now() - (user.reset_at || 0) > MONTH_MS) {
      await db.query(
        "UPDATE users SET usage = 0, reset_at = $1 WHERE email = $2",
        [Date.now(), user.email]
      );
      user.usage = 0;
      user.reset_at = Date.now();
    }

    res.json({
      loggedIn: true,
      email: user.email,
      name: user.name,
      usage: user.usage,
      premium: user.premium,
      freeLimit: FREE_LIMIT,
      remaining: Math.max(0, FREE_LIMIT - user.usage),
      daysUntilReset: getDaysUntilReset(user.reset_at),
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Generate meal plan ────────────────────────────────────────────────────────
app.post("/api/generate-meal", async (req, res) => {
  const email = req.session.user;
  if (!email)
    return res.status(401).json({ error: "Please log in first" });

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];

    if (Date.now() - (user.reset_at || 0) > MONTH_MS) {
      await db.query(
        "UPDATE users SET usage = 0, reset_at = $1 WHERE email = $2",
        [Date.now(), email]
      );
      user.usage = 0;
      user.reset_at = Date.now();
    }

    if (!user.premium && user.usage >= FREE_LIMIT) {
      const days = getDaysUntilReset(user.reset_at);
      return res.json({
        error: "free_limit_reached",
        message: `You've used all ${FREE_LIMIT} free plans this month. Your limit resets in ${days} day${days !== 1 ? "s" : ""}.`,
        daysUntilReset: days,
      });
    }

    const { budget, days, diet, goal, cuisines } = req.body;
    const prompt = buildMealPrompt({ budget, days, diet, goal, cuisines });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok)
      throw new Error(aiData.error?.message || "AI service error");

    const text = aiData.content?.[0]?.text;
    if (!text) throw new Error("Empty response from AI");

    await db.query(
      "UPDATE users SET usage = usage + 1 WHERE email = $1",
      [email]
    );

    const newUsage = user.usage + 1;

    res.json({
      result: text,
      usage: newUsage,
      remaining: Math.max(0, FREE_LIMIT - newUsage),
      premium: user.premium,
      freeLimit: FREE_LIMIT,
    });
  } catch (err) {
    console.error("Generate error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to generate meal plan. Please try again." });
  }
});

// ── AI Coach ──────────────────────────────────────────────────────────────────
app.post("/api/coach", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Please log in first" });

  const { message } = req.body;
  if (!message?.trim())
    return res.status(400).json({ error: "Message required" });

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:
          "You are a helpful nutrition and meal planning coach. Give concise, practical advice. Keep answers under 120 words.",
        messages: [{ role: "user", content: message }],
      }),
    });

    const aiData = await aiRes.json();
    const reply =
      aiData.content?.[0]?.text ||
      "I could not process that. Please try again.";
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Coach is unavailable right now." });
  }
});

// ── Password reset request ────────────────────────────────────────────────────
app.post("/api/reset-password-request", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const generic = {
    success: true,
    message: "If that email is registered you will receive a reset link.",
  };

  try {
    const result = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    if (!result.rows[0]) return res.json(generic);

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = Date.now() + 3_600_000;

    await db.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3",
      [token, expiry, email.toLowerCase().trim()]
    );

    const resetLink = `${BASE_URL}/reset-password?token=${token}`;
    // In production: send resetLink by email. For now returned so user can test.
    res.json({ ...generic, resetLink });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Password reset ────────────────────────────────────────────────────────────
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ error: "Token and password are required" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > $2",
      [token, Date.now()]
    );

    if (!result.rows[0])
      return res
        .status(400)
        .json({ error: "This reset link is invalid or has expired" });

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = $2",
      [hashed, token]
    );

    res.json({ success: true, message: "Password updated. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Stripe checkout ───────────────────────────────────────────────────────────
app.post("/api/create-checkout-session", async (req, res) => {
  const email = req.session.user;
  if (!email)
    return res.status(401).json({ error: "Please log in first" });
  if (!stripe)
    return res.status(503).json({ error: "Payment system is not configured" });

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Mealzy Pro",
              description: "Unlimited AI meal plans every month",
            },
            unit_amount: 999,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing`,
    });

    res.json({ url: checkoutSession.url });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not create checkout session. Please try again." });
  }
});

// ── Static page clean URLs ────────────────────────────────────────────────────
const pages = [
  "dashboard",
  "pricing",
  "login",
  "privacy",
  "terms",
  "success",
  "reset-password",
];
pages.forEach((page) => {
  app.get(`/${page}`, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", `${page}.html`));
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mealzy running on port ${PORT}`));
