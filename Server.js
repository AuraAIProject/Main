import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// Dev CORS: allow any local file server (e.g., VS Code Live Server at http://localhost:5500)
app.use(cors({ origin: true }));

// --- OpenAI client ---
// Keep your API key in .env as OPENAI_API_KEY
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// A helper JSON schema for structured output from the model
const playlistSchema = {
  name: "playlist",
  schema: {
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
          required: ["title", "artist"]
        }
      }
    },
    required: ["tracks"]
  }
};

// POST /ai  { seedTracks: [{title,artist}], howMany, vibe }
app.post("/ai", async (req, res) => {
  try {
    const { seedTracks = [], howMany = 15, vibe = "" } = req.body;

    const instructions = `
You are a music curator. Based on the seed songs, suggest ${howMany} *distinct* songs that fit the same vibe.
- Keep a broad mainstream catalog so iTunes can find them.
- Prefer the same or adjacent genres/eras unless "vibe" says otherwise.
- Avoid duplicates of the seeds.
- If the user provided a "vibe/constraints", respect it (e.g., "no explicit lyrics", "only 2010s").
Return ONLY JSON that matches the provided JSON schema.
Seeds: ${JSON.stringify(seedTracks, null, 2)}
User vibe/constraints: ${vibe || "(none)"}.
`;

    // Use a small, smart, inexpensive model by default. You can change the model if you like.
    // (Model availability/names: see OpenAI model docs.) 
    const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: instructions,
  text: {
    format: "json_schema",
    schema: playlistSchema
  }
});

    // The official SDK exposes a convenience accessor for plain text;
    // but with json_schema, the primary output is JSON.
    let text = response.output_text || "";
    let parsed;

    // If the SDK already parsed JSON in tool outputs, fall back to extracting from text.
    try {
      parsed = JSON.parse(text);
    } catch {
      // Attempt to extract the first {...} block if model included surrounding text (shouldn't happen with schema)
      const m = text.match(/\\{[\\s\\S]*\\}/);
      parsed = m ? JSON.parse(m[0]) : { tracks: [] };
    }

    res.json(parsed);
  }  catch (err) {
  console.error("❌ OpenAI error:", err.response?.data || err.message || err);
  res.status(500).json({ error: "OpenAI request failed.", details: err.response?.data || err.message });
}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("AI proxy listening on http://localhost:" + PORT);
});