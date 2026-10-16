require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173' // Vite default port
}));
app.use(express.json());

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * POST /api/analyze-complaint
 * Analyzes a complaint description and returns a summary and category.
 */
app.post('/api/analyze-complaint', async (req, res) => {
  const { description } = req.body;

  // 1. Validation
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'Description is required and must be a string.' });
  }

  if (description.length < 10) {
    return res.status(400).json({ error: 'Description must be at least 10 characters long.' });
  }

  if (description.length > 1000) {
    return res.status(400).json({ error: 'Description must not exceed 1000 characters.' });
  }

  try {
    // 2. AI Prompt
    const prompt = `You are a campus facilities maintenance expert.
Analyze the following issue description and provide a concise summary and a category.

Categories allowed: 'Computer', 'Projector', 'Fan', 'Light', 'Wi-Fi', 'Other'.

Return ONLY a JSON object in this format:
{
  "summary": "A concise 1-sentence summary of the issue",
  "category": "The chosen category from the allowed list"
}

Issue description: "${description}"`;

    // Using the stable model gemini-3.8-flash and correct SDK syntax
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;

    // 3. Parse and return
    const analysis = JSON.parse(text);
    res.json(analysis);

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({
      error: 'Failed to analyze complaint. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Gemini Proxy Server running at http://localhost:${port}`);
  console.log(`💡 POST /api/analyze-complaint is active`);
});
