/**
 * GeminiVisionService.js — Clothing analysis via Google Gemini Flash
 * 
 * Free tier: 15 RPM, 1M tokens/day, 1500 requests/day
 * Paid tier: $0.10/1M input tokens (~$0.0001 per clothing image)
 * 
 * Set GEMINI_API_KEY in .env or environment.
 */

import fetch from 'node-fetch'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const ANALYSIS_PROMPT = `You are a clothing analysis AI. Analyze this clothing item photo and return ONLY valid JSON with no markdown or extra text.

{
  "name": "short descriptive name (e.g. 'Navy Cotton Crew Neck T-Shirt')",
  "category": "one of: T-Shirt, Button-Up, Knitwear, Hoodie, Jacket, Blouse, Dress, Tank, Camisole, Jeans, Pants, Shorts, Skirts, Leggings, Boots, Sneakers, Shoes, Sandals, Heels, Flats, Belt, Hat, Socks, Scarf, Necklace, Earrings, Bracelet, Handbag, Other",
  "subcategory": "more specific type (e.g. 'crew neck', 'slim fit', 'chelsea boot')",
  "primary_color": "hex color code (e.g. '#001f3f')",
  "secondary_color": "hex color code or null",
  "weft_color": "hex color for woven/knit items or null",
  "colors": ["list", "of", "color", "names"],
  "pattern": "one of: solid, striped, plaid, floral, geometric, camo, animal, abstract, textured, other",
  "material": "one of: cotton, denim, leather, wool, polyester, silk, linen, knit, fleece, nylon, synthetic, other",
  "texture": "description (e.g. 'smooth', 'ribbed', 'brushed')",
  "silhouette": "description (e.g. 'straight', 'tapered', 'a-line')",
  "fit": "one of: tight, slim, regular, relaxed, loose, oversized",
  "length": "description (e.g. 'hip length', 'knee length', 'ankle')",
  "style_tags": ["casual", "streetwear", "minimal", "etc"],
  "occasion": ["casual", "work", "formal", "date", "outdoor"],
  "formality": 5,
  "season": ["spring", "summer", "fall", "winter"],
  "weight": "one of: ultralight, light, medium, heavy",
  "temp_min_f": 50,
  "temp_max_f": 85,
  "waterproof": false,
  "layering_role": "one of: base, mid, outer, standalone",
  "confidence": 0.85,
  "uncertain_fields": ["fields you are less sure about"]
}

Be precise with hex colors. Estimate temperature range based on material/weight. Return ONLY the JSON object.`

export class GeminiVisionService {
  constructor() {
    // Read at construction time (after dotenv.config() has run)
    this.apiKey = process.env.GEMINI_API_KEY || ''
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  }

  isAvailable() {
    return !!this.apiKey
  }

  /**
   * Analyze a clothing image with Gemini Flash.
   * Returns { rawDescription, structured, model } matching OllamaService interface.
   */
  async analyzeImageStructured(imagePath) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/apikey')
    }

    // Compress image for API (same as existing pipeline)
    let imageBuffer
    try {
      imageBuffer = await sharp(imagePath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75, mozjpeg: true })
        .toBuffer()
      console.log(`Gemini: compressed image to ${Math.round(imageBuffer.length / 1024)}KB`)
    } catch {
      imageBuffer = readFileSync(imagePath)
    }

    const imageBase64 = imageBuffer.toString('base64')
    const mimeType = 'image/jpeg'

    // Call Gemini API
    const url = `${GEMINI_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: ANALYSIS_PROMPT },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,       // Low temp for structured output
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',  // Force JSON response
        }
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      if (response.status === 429) {
        throw new Error('Gemini rate limit hit (15 RPM free tier). Wait a moment.')
      }
      throw new Error(`Gemini API error ${response.status}: ${errBody.slice(0, 200)}`)
    }

    const data = await response.json()

    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('Gemini returned empty response')
    }

    // Parse JSON (Gemini with responseMimeType should return clean JSON)
    let structured
    try {
      structured = JSON.parse(text)
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[1] || jsonMatch[0])
      } else {
        throw new Error(`Gemini returned non-JSON: ${text.slice(0, 100)}`)
      }
    }

    // Normalize fields to match expected schema
    return {
      rawDescription: text,
      structured: {
        name: structured.name || 'Unknown Item',
        category: structured.category || 'Other',
        subcategory: structured.subcategory || null,
        primary_color: structured.primary_color || '#808080',
        secondary_color: structured.secondary_color || null,
        weft_color: structured.weft_color || null,
        colors: structured.colors || [],
        pattern: structured.pattern || 'solid',
        material: structured.material || 'unknown',
        texture: structured.texture || null,
        silhouette: structured.silhouette || null,
        fit: structured.fit || 'regular',
        length: structured.length || null,
        style_tags: structured.style_tags || [],
        occasion: structured.occasion || ['casual'],
        formality: structured.formality ?? 5,
        season: structured.season || ['spring', 'summer', 'fall', 'winter'],
        weight: structured.weight || 'medium',
        temp_min_f: structured.temp_min_f ?? 40,
        temp_max_f: structured.temp_max_f ?? 90,
        waterproof: structured.waterproof ? 1 : 0,
        layering_role: structured.layering_role || 'standalone',
        confidence: structured.confidence ?? 0.8,
        uncertain_fields: structured.uncertain_fields || [],
      },
      model: `gemini-${this.model}`
    }
  }
}

export default GeminiVisionService
