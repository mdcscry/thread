import fetch from 'node-fetch'
import sharp from 'sharp'
import { execSync } from 'child_process'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

// MiniMax MCP configuration
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || 'sk-cp-gfNN3qGjSMWCHmbDyFs3Mpc4PV48d3RDsf5siq_v_KBGEyR38WMtGaZhZUWLdZLbdBa_pdZiTtcJ5TALzyo1XfeIWM1TOzjNbcQjLqDaU4HgeUbZ0f8qji8'
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimax.io'

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
    // Use MiniMax MCP for faster, better image analysis
    // Just get a description and extract structured data from it
    const prompt = `Analyze this clothing item. Be very specific about: type, color(s), material, pattern, texture, fit (tight/slim/regular/relaxed/loose/oversized), silhouette, style tags.`

    let result
    try {
      // Use MiniMax MCP via mcporter
      result = await this.analyzeImageWithMiniMax(imagePath, prompt)
    } catch (error) {
      console.error('MiniMax analysis failed:', error.message)
      throw error
    }
    
    // Result is text description - store as raw
    const rawDescription = typeof result === 'string' ? result : JSON.stringify(result)
    
    // Extract basic structured data from the description
    const lowerDesc = rawDescription.toLowerCase()
    const structured = {
      category: this.extractCategory(lowerDesc),
      primary_color: this.extractColor(lowerDesc),
      material: this.extractMaterial(lowerDesc),
      fit: this.extractFit(lowerDesc),
      pattern: this.extractPattern(lowerDesc),
    }

    return {
      rawDescription,
      structured,
      model: 'minimax-mcp'
    }
  }
  
  // Helper methods to extract structured data from description
  extractCategory(desc) {
    if (desc.includes('jeans') || desc.includes('denim') || desc.includes('pants')) return 'bottom'
    if (desc.includes('shirt') || desc.includes('blouse') || desc.includes('sweater') || desc.includes('t-shirt') || desc.includes('top')) return 'top'
    if (desc.includes('jacket') || desc.includes('coat') || desc.includes('hoodie')) return 'outerwear'
    if (desc.includes('shoes') || desc.includes('sneakers') || desc.includes('boots')) return 'shoes'
    if (desc.includes('dress')) return 'dress'
    return 'unknown'
  }
  
  extractColor(desc) {
    const colors = ['black', 'white', 'blue', 'navy', 'indigo', 'gray', 'grey', 'brown', 'tan', 'beige', 'red', 'green', 'olive', 'khaki']
    for (const c of colors) {
      if (desc.includes(c)) return c
    }
    return 'unknown'
  }
  
  extractMaterial(desc) {
    const materials = ['cotton', 'wool', 'silk', 'linen', 'polyester', 'denim', 'leather', 'knit', 'synthetic']
    for (const m of materials) {
      if (desc.includes(m)) return m
    }
    return 'unknown'
  }
  
  extractFit(desc) {
    if (desc.includes('tight') || desc.includes('slim')) return 'slim'
    if (desc.includes('relaxed') || desc.includes('loose') || desc.includes('oversized')) return 'loose'
    if (desc.includes('regular')) return 'regular'
    return 'unknown'
  }
  
  extractPattern(desc) {
    if (desc.includes('striped')) return 'striped'
    if (desc.includes('plaid') || desc.includes('check')) return 'plaid'
    if (desc.includes('solid')) return 'solid'
    if (desc.includes('pattern') || desc.includes('textured')) return 'textured'
    return 'solid'
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

  // Use MiniMax MCP via mcporter for image analysis (faster + better than Ollama)
  async analyzeImageWithMiniMax(imagePath, prompt) {
    try {
      const escapedPath = imagePath.replace(/"/g, '\\"')
      const escapedPrompt = prompt.replace(/"/g, '\\"')
      
      // Use shell to export env vars so they're passed to uvx subprocess
      const cmd = `export MINIMAX_API_KEY="${MINIMAX_API_KEY}" && export MINIMAX_API_HOST="${MINIMAX_API_HOST}" && mcporter call minimax.understand_image prompt="${escapedPrompt}" image_source="${escapedPath}"`
      
      const result = execSync(cmd, { 
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
        shell: '/bin/bash'
      })
      
      // MiniMax returns plain text, not JSON - return as-is
      return result
    } catch (err) {
      console.error('MiniMax MCP error:', err.message)
      throw err
    }
  }

  // Fallback: Use direct Ollama instead of MiniMax MCP
  async analyzeWithOllamaDirect(imagePath) {
    const prompt = `Analyze this clothing item. Be very specific about: type, color(s), material, pattern, texture, fit (tight/slim/regular/relaxed/loose/oversized), silhouette, style tags. Provide a detailed description.`

    let result
    try {
      result = await this.analyzeImage(imagePath, prompt)
    } catch (err) {
      console.error('Direct Ollama analysis failed:', err.message)
      throw err
    }
    
    // Result is Ollama response - extract description
    const rawDescription = result.response || ''
    
    // Extract basic structured data from the description
    const lowerDesc = rawDescription.toLowerCase()
    const structured = {
      category: this.extractCategory(lowerDesc),
      primary_color: this.extractColor(lowerDesc),
      material: this.extractMaterial(lowerDesc),
      fit: this.extractFit(lowerDesc),
      pattern: this.extractPattern(lowerDesc),
    }

    return {
      rawDescription,
      structured,
      model: this.model  // e.g., 'llava:7b'
    }
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
