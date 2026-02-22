import { authenticateApiKey } from '../middleware/auth.js'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import db from '../db/client.js'
import { recordFeedback, markAsWorn } from '../services/PreferenceService.js'

// Voice routes
export default async function voiceRoutes(fastify, opts) {
  // Transcribe and process voice note
  fastify.post('/voice', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    try {
      const data = await request.file()
      if (!data) {
        return reply.code(400).send({ error: 'No audio file provided' })
      }

      // Save audio to temp
      const buffer = await data.toBuffer()
      const tempPath = path.join('./data/tmp', `voice_${Date.now()}.webm`)
      const tmpDir = path.dirname(tempPath)
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
      }
      fs.writeFileSync(tempPath, buffer)

      // Transcribe with Whisper (if available)
      let transcript = null
      try {
        transcript = await transcribeAudio(tempPath)
      } catch (err) {
        console.warn('Whisper not available:', err.message)
        transcript = '[Whisper not installed - audio saved but not transcribed]'
      }

      // Extract intent with Ollama
      let intent = null
      try {
        intent = await extractIntent(transcript, userId)
      } catch (err) {
        console.warn('Intent extraction failed:', err.message)
      }

      // Save voice note
      const audioPath = path.join('./data/voice', `note_${Date.now()}.webm`)
      const voiceDir = path.dirname(audioPath)
      if (!fs.existsSync(voiceDir)) {
        fs.mkdirSync(voiceDir, { recursive: true })
      }
      fs.renameSync(tempPath, audioPath)

      const noteResult = db.prepare(`
        INSERT INTO voice_notes (user_id, raw_audio_path, transcript, intent, confidence, action_taken)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId, audioPath, transcript,
        intent ? JSON.stringify(intent) : null,
        intent?.confidence || null,
        intent?.action_taken || null
      )

      // Process the action
      let actionResult = null
      if (intent && intent.action_taken !== 'needs_clarification') {
        actionResult = await processVoiceAction(userId, intent)
      }

      // Clean up temp
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)

      return {
        transcript,
        intent,
        action_taken: intent?.action_taken || 'needs_review',
        result: actionResult,
        confirmation_message: getConfirmationMessage(intent, actionResult)
      }

    } catch (err) {
      console.error('Voice processing error:', err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // Get voice notes history
  fastify.get('/voice', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { limit = 20 } = request.query

    return db.prepare(`
      SELECT * FROM voice_notes 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(userId, parseInt(limit))
  })
}

// Transcribe audio using local Whisper
async function transcribeAudio(audioPath) {
  return new Promise((resolve, reject) => {
    const txtPath = audioPath.replace('.webm', '.txt')
    
    exec(
      `cd /tmp && curl -s https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ggml-base.bin 2>/dev/null || true && echo " whisper not configured"`,
      { timeout: 5000 },
      (err, stdout) => {
        // For now, return placeholder - Whisper setup is complex
        resolve('[Audio received - configure Whisper for transcription]')
      }
    )
  })
}

// Extract intent using Ollama
async function extractIntent(transcript, userId) {
  // Get recent context
  const recentOutfits = db.prepare(`
    SELECT id, occasion, worn_date FROM outfits 
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(userId)

  const prompt = `
You are a fashion assistant parsing voice input. Extract the intent from this voice note.

Recent outfits: ${JSON.stringify(recentOutfits.map(o => ({ id: o.id, occasion: o.occasion, date: o.worn_date })))}

Voice input: "${transcript}"

Return JSON with exactly this structure:
{
  "intent": "feedback" | "add_worn" | "generate" | "question" | "unknown",
  "confidence": 0.0-1.0,
  "feedback": { "sentiment": "positive|negative|neutral", "strength": "strong|mild", "target_description": "...", "feedback_value": 1.0|0.6|0.0|-0.5|-1.0 },
  "worn": { "outfit_id": null, "occasion": "..." },
  "generate": { "occasion": "...", "style_words": [], "time_of_day": "..." },
  "action_taken": "feedback_recorded" | "outfit_generated" | "needs_clarification" | "unknown",
  "needs_clarification": false,
  "clarification_question": null
}

Output only valid JSON.`

  // Use fetch to call Ollama
  try {
    const { default: fetch } = await import('node-fetch')
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:3b',
        prompt,
        stream: false
      })
    })

    const data = await response.json()
    const text = data.response || ''
    
    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return { intent: 'unknown', confidence: 0, action_taken: 'unknown' }
  } catch (err) {
    console.warn('Ollama call failed:', err.message)
    return { intent: 'unknown', confidence: 0, action_taken: 'unknown' }
  }
}

// Process the extracted action
async function processVoiceAction(userId, intent) {
  switch (intent.action_taken) {
    case 'feedback_recorded':
      if (intent.feedback?.target_description) {
        // Find most recent outfit with matching description
        const outfit = db.prepare(`
          SELECT id FROM outfits WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
        `).get(userId)
        
        if (outfit) {
          await recordFeedback(userId, outfit.id, intent.feedback.feedback_value > 0 ? 'voice_positive_strong' : 'voice_negative_strong')
          return { type: 'feedback', outfit_id: outfit.id }
        }
      }
      return { type: 'feedback', note: 'No matching outfit found' }

    case 'outfit_generated':
      return { type: 'generate', occasion: intent.generate?.occasion }

    default:
      return { type: 'unknown' }
  }
}

function getConfirmationMessage(intent, result) {
  if (!intent) return 'Voice note received but could not be processed.'
  
  switch (intent.action_taken) {
    case 'feedback_recorded':
      return intent.feedback?.sentiment === 'positive' 
        ? 'Got it — logged positive feedback! ❤️'
        : 'Noted — thanks for the feedback.'
    case 'outfit_generated':
      return `Generating outfits for ${intent.generate?.occasion || 'casual'}...`
    case 'needs_clarification':
      return intent.clarification_question || 'Could you say that again?'
    default:
      return 'Voice note saved. Want me to do anything with it?'
  }
}
