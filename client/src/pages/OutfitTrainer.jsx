import React, { useState, useEffect } from 'react'

const API_BASE = ''

// Category options for outfit slots
const TOP_CATEGORIES = ['', 'T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket', 'Blouse', 'Dress', 'Tank']
const BOTTOM_CATEGORIES = ['', 'Jeans', 'Pants', 'Shorts', 'Skirts', 'Leggings']
const FOOTWEAR_CATEGORIES = ['', 'Boots', 'Sneakers', 'Shoes', 'Sandals', 'Heels', 'Flats']
const ACCESSORY_CATEGORIES = ['', 'Belt', 'Hat', 'Socks', 'Scarf', 'Necklace', 'Earrings', 'Bracelet', 'Handbag']

export default function OutfitTrainer({ apiKey, currentUser }) {
  const [loading, setLoading] = useState(false)
  const [outfits, setOutfits] = useState([])
  const [feedback, setFeedback] = useState({})  // { itemId: 'thumbs_up' | 'thumbs_down' | 'neutral' }
  const [pendingCount, setPendingCount] = useState(0)
  const [stats, setStats] = useState({})
  
  // Category selections
  const [filters, setFilters] = useState({
    top: '',
    bottom: '',
    footwear: '',
    accessory: '',
    style: 'all'
  })
  
  const [count, setCount] = useState(5)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/stats`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setStats(data)
      setPendingCount(data.pendingFeedback || 0)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  async function generateOutfits() {
    setLoading(true)
    setOutfits([])
    setFeedback({})
    
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          categories: filters,
          count: count
        })
      })
      const data = await res.json()
      setOutfits(data.outfits || [])
    } catch (e) {
      console.error('Failed to generate:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleFeedback(itemId, type) {
    setFeedback(prev => ({
      ...prev,
      [itemId]: type
    }))
  }

  async function submitFeedback() {
    const feedbackList = Object.entries(feedback).map(([itemId, type]) => ({
      itemId: parseInt(itemId),
      feedbackType: type
    }))
    
    try {
      await fetch(`${API_BASE}/api/v1/outfit-trainer/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedbackList)
      })
      
      setFeedback({})
      loadStats()
    } catch (e) {
      console.error('Failed to submit feedback:', e)
    }
  }

  async function trainModel() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/train`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      const data = await res.json()
      alert(`Trained! Updated ${data.itemsUpdated} items. Model version: ${data.newModelVersion}`)
      loadStats()
    } catch (e) {
      console.error('Failed to train:', e)
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>🧠 Outfit Trainer</h1>
      
      {/* Category Selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>🎨 Build Your Outfit</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Top</label>
            <select 
              value={filters.top}
              onChange={e => setFilters(f => ({ ...f, top: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              {TOP_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat || 'Any'}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Bottom</label>
            <select 
              value={filters.bottom}
              onChange={e => setFilters(f => ({ ...f, bottom: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              {BOTTOM_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat || 'Any'}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Footwear</label>
            <select 
              value={filters.footwear}
              onChange={e => setFilters(f => ({ ...f, footwear: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              {FOOTWEAR_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat || 'Any'}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Accessory</label>
            <select 
              value={filters.accessory}
              onChange={e => setFilters(f => ({ ...f, accessory: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              {ACCESSORY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat || 'Any'}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ marginRight: '0.5rem' }}>Outfits:</label>
            <input 
              type="number" 
              min="1" 
              max="20" 
              value={count}
              onChange={e => setCount(parseInt(e.target.value) || 5)}
              style={{ width: '60px', padding: '0.5rem' }}
            />
          </div>
          
          <button 
            onClick={generateOutfits}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Generating...' : '🔄 Generate'}
          </button>
          
          {pendingCount > 0 && (
            <span style={{ color: 'var(--color-accent)', marginLeft: 'auto' }}>
              {pendingCount} feedback pending
            </span>
          )}
        </div>
      </div>
      
      {/* Outfit Grid */}
      {outfits.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {outfits.map((outfit, idx) => (
            <OutfitCard 
              key={idx} 
              outfit={outfit} 
              feedback={feedback}
              onFeedback={handleFeedback}
            />
          ))}
        </div>
      )}
      
      {/* Feedback Actions */}
      {Object.keys(feedback).length > 0 && (
        <div className="card" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1rem' }}>
          <button onClick={submitFeedback} className="btn btn-primary">
            👍 Submit Feedback ({Object.keys(feedback).length} items)
          </button>
        </div>
      )}
      
      {/* Training Section */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>🧠 Model Training</h3>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>Pending Feedback:</strong> {pendingCount}
          </div>
          <div>
            <strong>Model Version:</strong> {stats.modelVersion || 'v1.0 (EMA)'}
          </div>
          <div>
            <strong>Times Trained:</strong> {stats.trainingCount || 0}
          </div>
          
          <button 
            onClick={trainModel}
            disabled={pendingCount < 3}
            className="btn btn-secondary"
            style={{ marginLeft: 'auto' }}
          >
            🧠 Train Model
          </button>
        </div>
        
        {pendingCount < 3 && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Need at least 3 feedback items to train
          </p>
        )}
      </div>
    </div>
  )
}

function OutfitCard({ outfit, feedback, onFeedback }) {
  const slots = [
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'footwear', label: 'Footwear' },
    { key: 'accessory', label: 'Accessory' }
  ]
  
  return (
    <div className="card" style={{ padding: '0.75rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {slots.map(slot => {
          const item = outfit.items?.[slot.key]
          if (!item) return null
          
          const itemFeedback = feedback[item.id]
          
          return (
            <div key={slot.key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '4px',
                overflow: 'hidden',
                flexShrink: 0,
                backgroundColor: 'var(--color-bg-secondary)'
              }}>
                {item.primary_image ? (
                  <img 
                    src={item.primary_image} 
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                    👕
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {item.category}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button 
                  onClick={() => onFeedback(item.id, 'thumbs_up')}
                  style={{ 
                    padding: '0.25rem', 
                    fontSize: '1rem',
                    opacity: itemFeedback === 'thumbs_up' ? 1 : 0.5,
                    background: itemFeedback === 'thumbs_up' ? 'var(--color-success)' : 'transparent'
                  }}
                >
                  👍
                </button>
                <button 
                  onClick={() => onFeedback(item.id, 'thumbs_down')}
                  style={{ 
                    padding: '0.25rem', 
                    fontSize: '1rem',
                    opacity: itemFeedback === 'thumbs_down' ? 1 : 0.5,
                    background: itemFeedback === 'thumbs_down' ? 'var(--color-error)' : 'transparent'
                  }}
                >
                  👎
                </button>
                <button 
                  onClick={() => onFeedback(item.id, 'neutral')}
                  style={{ 
                    padding: '0.25rem', 
                    fontSize: '1rem',
                    opacity: itemFeedback === 'neutral' ? 1 : 0.5
                  }}
                >
                  😐
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
