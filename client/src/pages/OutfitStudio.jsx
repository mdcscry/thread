import React, { useState, useEffect } from 'react'

const API_BASE = ''

export default function OutfitStudio({ apiKey }) {
  const [prompt, setPrompt] = useState('')
  const [outfits, setOutfits] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [weather, setWeather] = useState(null)
  const [context, setContext] = useState(null)

  // Load weather on mount
  useEffect(() => {
    fetchWeather()
  }, [])

  const fetchWeather = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/weather`)
      const data = await res.json()
      setWeather(data)
    } catch (err) {
      console.error('Weather error:', err)
    }
  }

  const generateOutfits = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    try {
      // Extract params from prompt using the API
      const res = await fetch(`${API_BASE}/api/v1/outfits/generate`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatPrompt: prompt,
          occasion: extractOccasion(prompt),
          timeOfDay: getTimeOfDay(),
          formalityTarget: extractFormality(prompt),
          location: 'Boulder, CO',
          numToGenerate: 15
        })
      })
      
      const data = await res.json()
      setOutfits(data.outfits || [])
      setContext(data.context)
      setCurrentIndex(0)
    } catch (err) {
      console.error('Generate error:', err)
    }
    setLoading(false)
  }

  const extractOccasion = (text) => {
    const occasions = ['dinner', 'work', 'casual', 'date', 'brunch', 'gym', 'beach', 'formal']
    const lower = text.toLowerCase()
    for (const o of occasions) {
      if (lower.includes(o)) return o
    }
    return 'casual'
  }

  const getTimeOfDay = () => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 17) return 'afternoon'
    return 'evening'
  }

  const extractFormality = (text) => {
    const match = text.match(/(\d+)\s*(\/|out of)?\s*10/)
    if (match) return parseInt(match[1])
    if (text.toLowerCase().includes('formal') || text.toLowerCase().includes('fancy')) return 7
    if (text.toLowerCase().includes('casual')) return 3
    return 5
  }

  const submitFeedback = async (feedback) => {
    const outfit = outfits[currentIndex]
    if (!outfit?.id) return

    try {
      await fetch(`${API_BASE}/api/v1/outfits/${outfit.id}/feedback`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ feedback })
      })
    } catch (err) {
      console.error('Feedback error:', err)
    }

    // Move to next
    if (currentIndex < outfits.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const currentOutfit = outfits[currentIndex]

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>✨ Outfit Studio</h1>

      {/* Weather Badge */}
      {weather && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>
              {weather.condition_code === 0 ? '☀️' : 
               weather.condition_code < 3 ? '⛅' :
               weather.condition_code < 50 ? '🌫️' : '🌧️'}
            </span>
            <div>
              <div style={{ fontWeight: 500 }}>{weather.temp_f}°F</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {weather.condition}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Input */}
      <div className="card chat-input">
        <textarea
          placeholder="What do you want to wear? e.g., 'Something cute for brunch with my girls, it's going to be warm'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              generateOutfits()
            }
          }}
        />
        <div className="chat-input-actions">
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            💡 Try: "Dinner date, 60s vibe" or "Work meeting but make it fashion"
          </div>
          <button 
            className="btn btn-primary" 
            onClick={generateOutfits}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Generating...' : '✨ Generate'}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="loading" style={{ marginTop: '2rem' }}>
          <div className="spinner"></div>
          <span style={{ marginLeft: '0.5rem' }}>Curating outfits...</span>
        </div>
      )}

      {!loading && outfits.length > 0 && currentOutfit && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span>Outfit {currentIndex + 1} of {outfits.length}</span>
            <div>
              <button 
                className="btn btn-secondary" 
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                style={{ marginRight: '0.5rem' }}
              >
                ←
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setCurrentIndex(Math.min(outfits.length - 1, currentIndex + 1))}
                disabled={currentIndex === outfits.length - 1}
              >
                →
              </button>
            </div>
          </div>

          {/* Outfit Display */}
          <div className="outfit-card">
            <div className="outfit-items">
              {Object.entries(currentOutfit.items || {}).map(([slot, item]) => {
                if (!item) return null
                // Get primary image for item
                const imgPath = item.primary_image?.path_thumb || item.path_thumb
                return (
                  <div key={slot} className="outfit-item">
                    <img 
                      src={imgPath ? `/images/${imgPath.replace('./data/images/', '')}` : '/placeholder.jpg'}
                      alt={item.name}
                      onError={(e) => e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23252540" width="100" height="100"/></svg>'}
                    />
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {item.name || item.subcategory || slot}
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="outfit-info">
              <div className="outfit-score">
                <span>AI Match</span>
                <div className="score-bar">
                  <div 
                    className="score-fill" 
                    style={{ width: `${(currentOutfit.ruleScore || 0) * 100}%` }}
                  />
                </div>
                <span>{Math.round((currentOutfit.ruleScore || 0) * 100)}%</span>
              </div>
              
              {currentOutfit.weatherMatch && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  🌡️ {currentOutfit.weatherMatch} for {context?.weather?.temp_f}°F
                </div>
              )}
            </div>
          </div>

          {/* Feedback Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
            <button 
              className="btn btn-secondary"
              onClick={() => submitFeedback(-1)}
            >
              👎 Pass
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => submitFeedback(1)}
            >
              ❤️ Love it
            </button>
          </div>
        </div>
      )}

      {!loading && outfits.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">✨</div>
          <p>Describe what you want to wear and I'll generate some options!</p>
        </div>
      )}
    </div>
  )
}
