import fetch from 'node-fetch'
import sharp from 'sharp'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

export class OllamaService {
  constructor(model = null) {
    this.model = model || process.env.DEFAULT_VISION_MODEL || 'llava:7b'
    this.textModel = process.env.DEFAULT_TEXT_MODEL || 'llama3.2:3b'
  }

  async checkHealth() {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  async listModels() {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      const data = await response.json()
      return data.models || []
    } catch {
      return []
    }
  }

  async analyzeImage(imagePath, prompt) {
    // Read image and compress it before sending to AI
    // Compress to 70% quality to reduce timeout issues with large images
    const fs = await import('fs')
    
    let imageBuffer
    try {
      // Get image metadata to check size
      const metadata = await sharp(imagePath).metadata()
      console.log(`Original image: ${metadata.width}x${metadata.height}, ${metadata.format}`)
      
      // Compress the image - resize to max 1024px and reduce quality to 70%
      // This significantly reduces base64 size while keeping enough detail for AI analysis
      imageBuffer = await sharp(imagePath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70, mozjpeg: true })
        .toBuffer()
      
      console.log(`Compressed image: ${Math.round(imageBuffer.length / 1024)}KB`)
    } catch (err) {
      // Fallback: read original file if sharp fails
      console.warn('Compression failed, using original:', err.message)
      imageBuffer = fs.readFileSync(imagePath)
    }
    
    const imageBase64 = imageBuffer.toString('base64')

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        images: [imageBase64],
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`)
    }

    return response.json()
  }

  async analyzeImageStructured(imagePath) {
    const stage1Prompt = `You are a professional fashion analyst. Examine this clothing item carefully.
Describe what you see in detail: the type of garment, its color(s), pattern,
material if you can determine it, texture, approximate weight/thickness,
how it would fit on a body, and any notable design details.
Be precise and factual. If you are uncertain about something, say so explicitly.`

    const stage2Prompt = `Based on your description, output a JSON object with exactly these fields.
Use null for any field you cannot determine confidently. Use "uncertain" for
fields where you're making an educated guess.

{
  "category": "top|bottom|dress|outerwear|shoes|bag|accessory|activewear",
  "subcategory": "specific type",
  "primary_color": "single dominant color name",
  "secondary_color": "second color if present, else null",
  "weft_color": "inner/weft color for denim/fabrics with visible texture, else null",
  "colors": ["all colors present"],
  "pattern": "solid|striped|floral|plaid|geometric|animal|graphic|textured|other",
  "material": "cotton|wool|silk|linen|polyester|denim|leather|knit|synthetic|unknown",
  "texture": "smooth|ribbed|knit|woven|sheer|velvet|terry|denim|leather|other",
  "silhouette": "fitted|relaxed|oversized|structured|flowy|boxy",
  "fit": "tight|slim|regular|relaxed|loose|oversized",
  "length": "crop|short|regular|midi|maxi|null",
  "style_tags": ["casual","office","evening","sporty","boho","edgy","classic","romantic"],
  "season": ["spring","summer","fall","winter"],
  "weight": "lightweight|medium|heavyweight",
  "temp_min_f": 45,
  "temp_max_f": 85,
  "formality": 5,
  "confidence": 0.85,
  "uncertain_fields": []
}

Output only valid JSON. No explanation, no markdown.`

    try {
      // Stage 1: Raw description
      const stage1Result = await this.analyzeImage(imagePath, stage1Prompt)
      const rawDescription = stage1Result.response

      // Stage 2: Structured extraction
      const stage2Result = await this.analyzeImage(imagePath, stage2Prompt)
      
      // Parse JSON from response
      let structured
      try {
        structured = JSON.parse(stage2Result.response)
      } catch {
        // Try to extract JSON from text
        const jsonMatch = stage2Result.response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          structured = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('Failed to parse structured response')
        }
      }

      return {
        rawDescription,
        structured,
        model: this.model
      }
    } catch (error) {
      console.error('Analysis error:', error)
      throw error
    }
  }

  async generateText(prompt) {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.textModel,
        prompt: prompt,
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.response
  }

  async extractOutfitParams(userPrompt) {
    const extractionPrompt = `Extract outfit parameters from this request. Return JSON only.
{
  "occasion": "dinner|work|gym|casual|wedding|beach|date|brunch|formal",
  "formality_target": 5,
  "time_of_day": "morning|afternoon|evening|night",
  "weather_override": null,
  "style_words": [],
  "mood": "confident|playful|professional|relaxed|romantic",
  "day_of_week": null
}

Request: "${userPrompt}"

Output only valid JSON.`

    const response = await this.generateText(extractionPrompt)
    
    try {
      return JSON.parse(response)
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('Failed to extract outfit parameters')
    }
  }
}

export default OllamaService
