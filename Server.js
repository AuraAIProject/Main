// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";


dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// Allow your Live Server (usually 127.0.0.1:5500) to call this API
app.use(cors({ origin: true }));

// --- Safety check: did we load the key? ---
if (process.env.OPENAI_API_KEY) {
  console.log("✅ OpenAI key loaded. Prefix:", process.env.OPENAI_API_KEY.slice(0, 10));
} else {
  console.error("❌ OPENAI_API_KEY not found. Check your .env file.");
}

// --- OpenAI client ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- JSON Schema for the playlist ---
const playlistJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tracks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          artist: { type: "string" },
          reason: { type: "string" },
          matchScore: { type: "integer", minimum: 0, maximum: 100 }
        },
        // 👇 make ALL properties required when strict: true
        required: ["title", "artist", "reason", "matchScore"]
      }
    }
  },
  required: ["tracks"]
};

// --- POST /ai ---
app.post("/ai", async (req, res) => {
  try {
    const { seedTracks = [], howMany = 15, vibe = "" } = req.body;

    const instructions = `
Based on these seed songs, suggest ${howMany} distinct songs that fit the same vibe.
- Use mainstream catalog so iTunes can find them.
- Prefer same/adjacent genres/eras unless 'vibe' says otherwise.
- Avoid duplicates of the seeds.
- Respect constraints (e.g., "no explicit lyrics", "only 2010s").
Return ONLY JSON that matches the provided JSON schema.
Seeds: ${JSON.stringify(seedTracks, null, 2)}
User vibe/constraints: ${vibe || "(none)"}.
`;

    // ✅ Chat Completions with structured outputs
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a music curator that returns only JSON." },
        { role: "user", content: instructions }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "playlist",
          strict: true,
          schema: playlistJsonSchema
        }
      },
      temperature: 0.7
    });

    const text = completion.choices?.[0]?.message?.content || "{}";

    // Parse strictly; fall back to extracting the first {...} block
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { tracks: [] };
    }

    res.json(parsed);
  } catch (err) {
    console.error("❌ OpenAI error:", err?.response?.data || err?.message || err);
    res.status(500).json({
      error: "OpenAI request failed.",
      details: err?.response?.data || err?.message || "Unknown error"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("AI proxy listening on http://localhost:" + PORT);
});