import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import Groq from "groq-sdk";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "sapc_super_secret_jwt_key_2026";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "831508871993-j7egn200ai4uvbqabkuka6s66juaikes.apps.googleusercontent.com";

// --- CLIENT INITIALIZATIONS ---
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const groqGeneral = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groqMath = new Groq({ apiKey: process.env.GROQ_API_KEY_MATH || process.env.GROQ_API_KEY });
const groqFilipino = new Groq({ apiKey: process.env.GROQ_API_KEY_FILIPINO || process.env.GROQ_API_KEY });

function getGroqClient(subjectMode) {
  if (subjectMode === "math") return groqMath;
  if (subjectMode === "filipino") return groqFilipino;
  return groqGeneral;
}

// --- SQLITE DATABASE SETUP ---
const dbFile = path.join(__dirname, "sapc_flashcards.db");
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("SQLite Connection Error:", err.message);
  } else {
    console.log("Connected to local SQLite database successfully.");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      googleId TEXT,
      picture TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      subjectMode TEXT DEFAULT 'general',
      gradeLevel TEXT DEFAULT 'Grade 11',
      academicStrand TEXT DEFAULT 'Section 1',
      cards TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);
});

// --- EXPRESS MIDDLEWARE ---
app.use(cors());

// Required security headers to allow Google popup communication
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const publicDir = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : __dirname;
app.use(express.static(publicDir));

// --- JWT AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
}

function isPasswordComplex(password) {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    if (!isPasswordComplex(password)) {
      return res.status(400).json({ 
        error: "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character." 
      });
    }

    db.get("SELECT id FROM users WHERE username = ?", [username.trim()], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Database error during registration." });
      }
      if (row) {
        return res.status(400).json({ error: "Username is already taken." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      db.run(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username.trim(), hashedPassword],
        function(insertErr) {
          if (insertErr) {
            return res.status(500).json({ error: "Failed to create user account." });
          }
          return res.status(201).json({ message: "User registered successfully!" });
        }
      );
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ error: "Internal server error during registration." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username.trim()], async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Invalid username or password." });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid username or password." });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        token,
        username: user.username,
        picture: user.picture
      });
    });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Internal server error during login." });
  }
});

// Google Authentication Route
app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Google credential token required." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    db.get("SELECT * FROM users WHERE googleId = ? OR email = ?", [googleId, email], async (err, user) => {
      if (err) return res.status(500).json({ error: "Database error during Google login." });

      if (!user) {
        const dummyPassword = await bcrypt.hash(googleId + JWT_SECRET, 10);
        const username = name || email.split("@")[0];
        db.run(
          "INSERT INTO users (username, email, password, googleId, picture) VALUES (?, ?, ?, ?, ?)",
          [username, email, dummyPassword, googleId, picture],
          function(insertErr) {
            if (insertErr) return res.status(500).json({ error: "Failed to create Google user." });
            const newUserId = this.lastID;
            const token = jwt.sign({ userId: newUserId, username }, JWT_SECRET, { expiresIn: "7d" });
            return res.json({ token, username, picture });
          }
        );
      } else {
        if (!user.googleId) {
          db.run("UPDATE users SET googleId = ?, picture = ? WHERE id = ?", [googleId, picture, user.id]);
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
        return res.json({ token, username: user.username, picture: user.picture || picture });
      }
    });

  } catch (err) {
    console.error("Google Auth Error:", err);
    return res.status(401).json({ error: "Google authentication failed." });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  db.get("SELECT id, username, email, picture, createdAt FROM users WHERE id = ?", [req.user.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json(user);
  });
});

// ==========================================
// GROQ AI FLASHCARD GENERATION ROUTE
// ==========================================

app.post("/api/flashcards", async (req, res) => {
  try {
    const {
      notes = "",
      count = 10,
      images = [],
      gradeLevel = "Grade 11",
      academicStrand = "General",
      difficulty = "medium",
      subjectMode = "general"
    } = req.body;

    const hasImages = Array.isArray(images) && images.length > 0;

    if (!notes.trim() && !hasImages) {
      return res.status(400).json({ error: "Please provide study notes or attached files." });
    }

    const systemPrompt = `
You are an expert educational reviewer generator tailored for Senior High School students in the Philippines (${gradeLevel} - ${academicStrand}).
Generate ${count} flashcards based strictly on the provided study material.

STRICT JSON OUTPUT FORMAT:
Output ONLY raw valid JSON with key "cards" containing an array of objects. Do not include markdown formatting or backticks.

CARD TYPE SCHEMAS:
1. Identification ("type": "identification"):
   - "question": Clean, direct question asking to identify a key term or concept.
   - "answer": Clean, exact term, phrase, or acronym (e.g., "Presentation Layer" or "DNA"). NEVER include "Answer:", "Key:", numbers, or definitions inside "answer".
   - "explanation": Brief supporting explanation of the answer.

2. Multiple Choice ("type": "multiple-choice"):
   - "question": Question followed by choice options on new lines formatted as:
     Question text here?
     A. Option 1
     B. Option 2
     C. Option 3
     D. Option 4
   - "answer": "A. Option 1"
   - "explanation": Why the choice is correct.

3. Enumeration ("type": "enumeration"):
   - Use ONLY when asking to list 2 or more distinct items.
   - "question": "List the layers of..."
   - "answer": Multi-line string with items numbered (e.g., "1. Item A\\n2. Item B").

4. True or False ("type": "true-false"):
   - "question": Direct statement text.
   - "answer": "True" or "False" (or "Tama" / "Mali" if subjectMode is filipino).
   - "explanation": Brief explanation.

CRITICAL RULES FOR QUESTIONS:
- NEVER leak internal prompts, hints, rephrasings, or meta-instructions inside parentheses inside the question string.
- Return clean, direct questions only.
`;

    const textInstruction = `
Subject Focus: ${subjectMode.toUpperCase()}
Target Difficulty: ${difficulty}
${notes.trim() ? `Study Notes Material:\n${notes}` : "Extract all study material from the attached file(s) and generate the flashcards."}
`;

    const activeGroqClient = getGroqClient(subjectMode);
    const modelName = hasImages ? "llama-3.2-11b-vision-preview" : "openai/gpt-oss-20b";
    let messages;

    if (hasImages) {
      const userContent = [{ type: "text", text: systemPrompt + "\n\n" + textInstruction }];

      images.slice(0, 5).forEach((img) => {
        if (img.data && img.mimeType) {
          userContent.push({
            type: "image_url",
            image_url: {
              url: `data:${img.mimeType};base64,${img.data}`
            }
          });
        }
      });

      messages = [{ role: "user", content: userContent }];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: textInstruction }
      ];
    }

    const response = await activeGroqClient.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const rawContent = response.choices[0]?.message?.content || "{}";
    const cleanedJson = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsedData = JSON.parse(cleanedJson);

    if (!parsedData.cards || !Array.isArray(parsedData.cards)) {
      throw new Error("Invalid card structure returned from AI model.");
    }

    return res.json({ cards: parsedData.cards });

  } catch (err) {
    console.error("AI Generation Route Error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate flashcards." });
  }
});

// ==========================================
// SAVED DECKS MANAGEMENT ROUTES (CRUD)
// ==========================================

app.get("/api/decks", authenticateToken, (req, res) => {
  db.all("SELECT * FROM decks WHERE userId = ? ORDER BY updatedAt DESC", [req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch saved decks." });
    const parsedDecks = rows.map(row => ({
      ...row,
      cards: JSON.parse(row.cards)
    }));
    return res.json(parsedDecks);
  });
});

app.post("/api/decks", authenticateToken, (req, res) => {
  const { title, subjectMode, gradeLevel, academicStrand, cards } = req.body;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "Deck must contain at least one card." });
  }

  const cardsJson = JSON.stringify(cards);
  db.run(
    `INSERT INTO decks (userId, title, subjectMode, gradeLevel, academicStrand, cards) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.userId, title || "Saved Reviewer Deck", subjectMode || "general", gradeLevel || "Grade 11", academicStrand || "Section 1", cardsJson],
    function(err) {
      if (err) return res.status(500).json({ error: "Failed to save flashcard deck." });
      return res.status(201).json({
        id: this.lastID,
        userId: req.user.userId,
        title: title || "Saved Reviewer Deck",
        subjectMode, gradeLevel, academicStrand, cards
      });
    }
  );
});

app.get("/api/decks/:id", authenticateToken, (req, res) => {
  db.get("SELECT * FROM decks WHERE id = ? AND userId = ?", [req.params.id, req.user.userId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Flashcard deck not found." });
    row.cards = JSON.parse(row.cards);
    return res.json(row);
  });
});

app.put("/api/decks/:id", authenticateToken, (req, res) => {
  const { title, cards } = req.body;
  db.get("SELECT * FROM decks WHERE id = ? AND userId = ?", [req.params.id, req.user.userId], (err, deck) => {
    if (err || !deck) return res.status(404).json({ error: "Deck not found or unauthorized." });

    const newTitle = title || deck.title;
    const newCardsJson = cards && Array.isArray(cards) ? JSON.stringify(cards) : deck.cards;

    db.run(
      "UPDATE decks SET title = ?, cards = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?",
      [newTitle, newCardsJson, req.params.id, req.user.userId],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: "Failed to update flashcard deck." });
        return res.json({ message: "Deck updated successfully", title: newTitle, cards: JSON.parse(newCardsJson) });
      }
    );
  });
});

app.delete("/api/decks/:id", authenticateToken, (req, res) => {
  db.run("DELETE FROM decks WHERE id = ? AND userId = ?", [req.params.id, req.user.userId], function(err) {
    if (err || this.changes === 0) return res.status(404).json({ error: "Deck not found or unauthorized." });
    return res.json({ message: "Flashcard deck deleted successfully." });
  });
});

// --- WILDCARD CATCH-ALL ROUTE ---
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// --- GLOBAL ERROR HANDLERS ---
app.use((err, req, res, next) => {
  console.error("Global Server Error:", err.stack);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

process.on("unhandledRejection", (reason) => {
  console.error("Caught unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Caught uncaught exception:", error);
});

// --- SERVER LISTEN ---
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`===========================================`);
});