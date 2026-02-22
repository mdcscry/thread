import React, { useState, useEffect } from 'react'

const API_BASE = ''

export default function OutfitStudio({ apiKey }) {
  const [prompt, setPrompt] = useState('')
  const [outfits, setOutfits] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [weather, setWeather] = useState(null)
  const [context, setContext] = useState(null)

  // New state for "Build from item" feature
  const [mode, setMode] = useState('prompt') // 'prompt' or 'from-item'
  const [showItemPicker, setShowItemPicker] = useState(false)
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [suggestions, setSuggestions] = useState([])

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

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/items?limit=100`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setItems(data.items || [])
    } catch (err) {
      console.error('Items error:', err)
    }
  }

  const openItemPicker = async () => {
    setShowItemPicker(true)
    await fetchItems()
  }

  const selectItem = async (item) => {
    setSelectedItem(item)
    setShowItemPicker(false)
    await buildOutfitFromItem(item.id)
  }

  const buildOutfitFromItem = async (itemId) => {
    setMode('from-item')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfits/from-item`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemId })
      })
      
      const data = await res.json()
      setSelectedItem(data.item)
      setSuggestions(data.suggestions || [])
    } catch (err) {
      console.error('Build from item error:', err)
    }
    setLoading(false)
  }

  const generateOutfits = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    setMode('prompt')
    setSelectedItem(null)
    setSuggestions([])
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

  const clearAndStartOver = () => {
    setMode('prompt')
    setPrompt('')
    setOutfits([])
    setSelectedItem(null)
    setSuggestions([])
    setCurrentIndex(0)
  }

  const currentOutfit = outfits[currentIndex]

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>✨ Outfit Studio</h1>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button 
          className={`btn ${mode === 'prompt' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setMode('prompt'); setSelectedItem(null); setSuggestions([]) }}
        >
          💬 Describe outfit
        </button>
        <button 
          className={`btn ${mode === 'from-item' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={openItemPicker}
        >
          👕 Start with an item
        </button>
      </div>

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

      {/* Chat Input (Prompt Mode) */}
      {mode === 'prompt' && (
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
      )}

      {/* Selected Item Display (From-Item Mode) */}
      {mode === 'from-item' && selectedItem && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img 
              src={selectedItem.primary_image?.path_thumb || selectedItem.path_thumb 
                ? `/images/${selectedItem.primary_image?.path_thumb?.replace('./data/images/', '') || selectedItem.path_thumb?.replace('./data/images/', '')}` 
                : '/placeholder.jpg'}
              alt={selectedItem.name}
              style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }}
              onError={(e) => e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23252540" width="80" height="80"/></svg>'}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Starting with:</div>
              <div>{selectedItem.name || selectedItem.subcategory}</div>
              <button 
                className="btn btn-secondary" 
                style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                onClick={openItemPicker}
              >
                Change item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading" style={{ marginTop: '2rem' }}>
          <div className="spinner"></div>
          <span style={{ marginLeft: '0.5rem' }}>Finding complementary pieces...</span>
        </div>
      )}

      {/* Suggestions (From-Item Mode) */}
      {!loading && mode === 'from-item' && suggestions.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Suggested pieces to pair:</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
            gap: '1rem' 
          }}>
            {/* Selected item */}
            <div className="card" style={{ padding: '0.75rem', border: '2px solid var(--color-primary)' }}>
              <img 
                src={selectedItem.primary_image?.path_thumb || selectedItem.path_thumb 
                  ? `/images/${selectedItem.primary_image?.path_thumb?.replace('./data/images/', '') || selectedItem.path_thumb?.replace('./data/images/', '')}` 
                  : '/placeholder.jpg'}
                alt={selectedItem.name}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }}
                onError={(e) => e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23252540" width="100" height="100"/></svg>'}
              />
              <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 500 }}>
                {selectedItem.name || selectedItem.subcategory}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                Your choice
              </div>
            </div>

            {/* Suggestions */}
            {suggestions.map((item, idx) => (
              <div key={item.id} className="card" style={{ padding: '0.75rem' }}>
                <img 
                  src={item.primary_image?.path_thumb || item.path_thumb 
                    ? `/images/${item.primary_image?.path_thumb?.replace('./data/images/', '') || item.path_thumb?.replace('./data/images/', '')}` 
                    : '/placeholder.jpg'}
                  alt={item.name}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }}
                  onError={(e) => e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23252540" width="100" height="100"/></svg>'}
                />
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 500 }}>
                  {item.name || item.subcategory}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  {item.matchReason}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginTop: '0.25rem' }}>
                  {Math.round(item.score * 100)}% match
                </div>
              </div>
            ))}
          </div>

          <button 
            className="btn btn-secondary" 
            style={{ marginTop: '1.5rem' }}
            onClick={clearAndStartOver}
          >
            ← Start over
          </button>
        </div>
      )}

      {/* No suggestions */}
      {!loading && mode === 'from-item' && selectedItem && suggestions.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">🤔</div>
          <p>No matching items found in your wardrobe. Try picking a different item!</p>
          <button className="btn btn-secondary" onClick={openItemPicker}>
            Pick another item
          </button>
        </div>
      )}

      {/* Results (Prompt Mode) */}
      {!loading && mode === 'prompt' && outfits.length > 0 && currentOutfit && (
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

      {!loading && mode === 'prompt' && outfits.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">✨</div>
          <p>Describe what you want to wear and I'll generate some options!</p>
        </div>
      )}

      {/* Item Picker Modal */}
      {showItemPicker && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'var(--color-bg)',
            borderRadius: '12px',
            padding: '1.5rem',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Select an item to build an outfit from</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
              Pick one item from your wardrobe and I'll suggest complementary pieces.
            </p>
            
            {items.length === 0 ? (
              <p>No items found. Add clothes to your wardrobe first!</p>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                gap: '1rem' 
              }}>
                {items.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => selectItem(item)}
                    style={{
                      cursor: 'pointer',
                      border: '2px solid transparent',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <img 
                      src={item.primary_image?.path_thumb || item.path_thumb 
                        ? `/images/${item.primary_image?.path_thumb?.replace('./data/images/', '') || item.path_thumb?.replace('./data/images/', '')}` 
                        : '/placeholder.jpg'}
                      alt={item.name}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }}
                      onError={(e) => e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23252540" width="100" height="100"/></svg>'}
                    />
                    <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', textAlign: 'center' }}>
                      {item.name || item.subcategory || item.category}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button 
              className="btn btn-secondary" 
              style={{ marginTop: '1.5rem' }}
              onClick={() => setShowItemPicker(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
