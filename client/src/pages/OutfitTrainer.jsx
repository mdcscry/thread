import React, { useState, useEffect, useRef, useCallback } from 'react'
import VoiceButton from '../components/VoiceButton'

const API_BASE = ''

const TOP_CATEGORIES = ['', 'T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket', 'Blouse', 'Dress', 'Tank']
const BOTTOM_CATEGORIES = ['', 'Jeans', 'Pants', 'Shorts', 'Skirts', 'Leggings']
const FOOTWEAR_CATEGORIES = ['', 'Boots', 'Sneakers', 'Shoes', 'Sandals', 'Heels', 'Flats']
const ACCESSORY_CATEGORIES = ['', 'Belt', 'Hat', 'Socks', 'Scarf', 'Necklace', 'Earrings', 'Bracelet', 'Handbag']
const OCCASIONS = ['casual', 'work', 'formal', 'date', 'outdoor']

function SwipeCard({ outfit, onSwipe }) {
  const startX = useRef(null)
  const currentX = useRef(0)
  const isDragging = useRef(false)
  const [dragX, setDragX] = useState(0)
  const [dismissed, setDismissed] = useState(null)

  const THRESHOLD = 80

  const handleStart = (x) => { startX.current = x; isDragging.current = true }
  const handleMove = (x) => {
    if (!isDragging.current || startX.current === null) return
    const dx = x - startX.current
    currentX.current = dx
    setDragX(dx)
  }
  const handleEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    const dx = currentX.current
    if (Math.abs(dx) >= THRESHOLD) {
      const dir = dx > 0 ? 'right' : 'left'
      setDismissed(dir)
      setTimeout(() => onSwipe(dir), 300)
    } else {
      setDragX(0)
      currentX.current = 0
    }
    startX.current = null
  }, [onSwipe])

  const onTouchStart = (e) => handleStart(e.touches[0].clientX)
  const onTouchMove = (e) => handleMove(e.touches[0].clientX)
  const onMouseDown = (e) => { e.preventDefault(); handleStart(e.clientX) }
  const onMouseMove = (e) => { if (isDragging.current) handleMove(e.clientX) }

  const rotate = dragX / 20
  const translateX = dismissed === 'right' ? 400 : dismissed === 'left' ? -400 : dragX
  const opacity = dismissed ? 0 : 1
  const overlayOpacity = Math.min(Math.abs(dragX) / THRESHOLD, 1)
  const slots = ['top', 'bottom', 'footwear', 'accessory']

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={handleEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
      style={{
        position: 'relative', background: 'var(--color-bg, #fff)', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '1.25rem',
        cursor: 'grab', userSelect: 'none',
        transform: `translateX(${translateX}px) rotate(${rotate}deg)`,
        opacity, transition: dismissed ? 'transform 0.3s ease, opacity 0.3s ease' : dragX === 0 ? 'transform 0.3s ease' : 'none',
        touchAction: 'none', width: '100%', boxSizing: 'border-box',
      }}
    >
      {dragX > 20 && (
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'rgba(34,197,94,0.85)', color: '#fff', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '1.5rem', fontWeight: 'bold', opacity: overlayOpacity, border: '3px solid #22c55e', zIndex: 10 }}>✓ LIKE</div>
      )}
      {dragX < -20 && (
        <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(239,68,68,0.85)', color: '#fff', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '1.5rem', fontWeight: 'bold', opacity: overlayOpacity, border: '3px solid #ef4444', zIndex: 10 }}>✗ NOPE</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {slots.map(slot => {
          const item = outfit.items?.[slot]
          if (!item) return null
          return (
            <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-secondary, #f5f5f5)' }}>
                {item.primary_image
                  ? <img src={item.primary_image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>👕</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{slot} · {item.category}</div>
              </div>
            </div>
          )
        })}
      </div>
      {outfit.finalScore != null && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>Score: {outfit.finalScore.toFixed(2)}</div>
      )}
    </div>
  )
}

function SwipeMode({ outfits, onFeedbackComplete, onGenerateMore }) {
  const [index, setIndex] = useState(0)
  const [swipeFeedback, setSwipeFeedback] = useState([])
  const [done, setDone] = useState(false)

  const handleSwipe = useCallback((dir) => {
    setSwipeFeedback(prev => [...prev, { outfitIndex: index, direction: dir }])
    if (index + 1 >= outfits.length) setDone(true)
    else setIndex(i => i + 1)
  }, [index, outfits.length])

  const handleSubmit = () => {
    const items = []
    swipeFeedback.forEach(({ outfitIndex, direction }) => {
      const outfit = outfits[outfitIndex]
      if (!outfit) return
      const feedbackType = direction === 'right' ? 'thumbs_up' : 'thumbs_down'
      Object.values(outfit.items || {}).forEach(item => { if (item?.id) items.push({ itemId: item.id, feedback: feedbackType }) })
    })
    onFeedbackComplete(items)
  }

  if (done) {
    const likes = swipeFeedback.filter(f => f.direction === 'right').length
    const nopes = swipeFeedback.filter(f => f.direction === 'left').length
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
        <h3 style={{ marginBottom: '0.5rem' }}>All done!</h3>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>👍 {likes} liked · 👎 {nopes} noped</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleSubmit} className="btn btn-primary">💾 Submit Feedback</button>
          <button onClick={onGenerateMore} className="btn btn-secondary">🔄 Generate More</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{index + 1} / {outfits.length}</div>
      <div style={{ height: '6px', background: 'var(--color-bg-secondary, #eee)', borderRadius: '3px', marginBottom: '1.5rem' }}>
        <div style={{ height: '100%', borderRadius: '3px', background: 'var(--color-accent, #6366f1)', width: `${(index / outfits.length) * 100}%`, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <SwipeCard key={index} outfit={outfits[index]} onSwipe={handleSwipe} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
        <button onClick={() => handleSwipe('left')} style={{ width: 60, height: 60, borderRadius: '50%', fontSize: '1.5rem', background: '#fef2f2', border: '2px solid #ef4444', cursor: 'pointer' }} title="Nope">👎</button>
        <button onClick={() => handleSwipe('right')} style={{ width: 60, height: 60, borderRadius: '50%', fontSize: '1.5rem', background: '#f0fdf4', border: '2px solid #22c55e', cursor: 'pointer' }} title="Like">👍</button>
      </div>
    </div>
  )
}

export default function OutfitTrainer({ apiKey, currentUser }) {
  const [loading, setLoading] = useState(false)
  const [outfits, setOutfits] = useState([])
  const [feedback, setFeedback] = useState({})
  const [excludedOutfits, setExcludedOutfits] = useState(new Set())
  const [pendingCount, setPendingCount] = useState(0)
  const [stats, setStats] = useState({})
  const [viewMode, setViewMode] = useState(() => window.innerWidth < 768 ? 'swipe' : 'grid')
  const [filters, setFilters] = useState({ top: '', bottom: '', footwear: '', accessory: '' })
  const [occasion, setOccasion] = useState('casual')
  const [count, setCount] = useState(5)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/stats`, { headers: { 'Authorization': `Bearer ${apiKey}` } })
      const data = await res.json()
      setStats(data)
      setPendingCount(data.pendingFeedback || 0)
    } catch (e) { console.error('Failed to load stats:', e) }
  }

  function handleVoiceResult() {
    // Trainer mode: ignore intent, just pick a random occasion and generate
    const randomOccasion = OCCASIONS[Math.floor(Math.random() * OCCASIONS.length)]
    setOccasion(randomOccasion)
    setCount(5)
    setTimeout(() => generateOutfits(), 50)
  }

  async function generateOutfits() {
    setLoading(true); setOutfits([]); setFeedback({}); setExcludedOutfits(new Set())
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/generate`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: filters, occasion, count })
      })
      const data = await res.json()
      setOutfits(data.outfits || [])
    } catch (e) { console.error('Failed to generate:', e) }
    finally { setLoading(false) }
  }

  function handleFeedback(itemId, type) { setFeedback(prev => ({ ...prev, [itemId]: type })) }

  async function submitFeedback(itemsOverride) {
    const feedbackItems = itemsOverride || Object.entries(feedback).map(([itemId, feedbackType]) => ({ itemId: parseInt(itemId), feedback: feedbackType }))
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/feedback`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: feedbackItems, outfitId: null, context: { occasion, season: null, timeOfDay: null } })
      })
      const data = await res.json()
      setFeedback({}); setPendingCount(data.pendingCount || 0); loadStats()
    } catch (e) { console.error('Failed to submit feedback:', e) }
  }

  async function excludeOutfit(outfitId) {
    const outfit = outfits[outfitId - 1]; if (!outfit) return
    try {
      for (const item of Object.values(outfit.items)) {
        await fetch(`${API_BASE}/api/v1/outfit-trainer/exclude`, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id }) })
      }
      setExcludedOutfits(prev => new Set([...prev, outfitId])); loadStats()
    } catch (e) { console.error('Failed to exclude:', e) }
  }

  async function trainModel() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfit-trainer/train`, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` } })
      const data = await res.json()
      if (data.error) { alert(data.error) } else {
        alert([`✅ Model trained!`, `Samples: ${data.samples}`, `Loss: ${data.validationLoss}`, data.validationMAE ? `MAE: ${data.validationMAE}` : null, `Epochs: ${data.epochs}`, `Time: ${data.trainingTimeMs}ms`, `NN Weight: ${Math.round((data.nnWeight||0)*100)}%`, `Params: ${data.paramCount}`].filter(Boolean).join('\n'))
      }
      loadStats()
    } catch (e) { console.error('Failed to train:', e) }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>🧠 Outfit Trainer</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>🎨 Build Your Outfit</h3>
        <VoiceButton onResult={handleVoiceResult} disabled={loading} placeholder="🎲 Tap to generate a random outfit" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {[{label:'Top',key:'top',cats:TOP_CATEGORIES},{label:'Bottom',key:'bottom',cats:BOTTOM_CATEGORIES},{label:'Footwear',key:'footwear',cats:FOOTWEAR_CATEGORIES},{label:'Accessory',key:'accessory',cats:ACCESSORY_CATEGORIES}].map(({label,key,cats}) => (
            <div key={key}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>{label}</label>
              <select value={filters[key]} onChange={e => setFilters(f => ({...f,[key]:e.target.value}))} style={{ width: '100%', padding: '0.5rem' }}>
                {cats.map(cat => <option key={cat} value={cat}>{cat||'Any'}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Occasion</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {OCCASIONS.map(occ => (
              <button key={occ} onClick={() => setOccasion(occ)} style={{ padding: '0.5rem 1rem', background: occasion===occ?'var(--color-accent)':'var(--color-bg-secondary)', color: occasion===occ?'white':'var(--color-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize' }}>{occ}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ marginRight: '0.5rem' }}>Outfits:</label>
            <input type="number" min="1" max="20" value={count} onChange={e => setCount(parseInt(e.target.value)||5)} style={{ width: '60px', padding: '0.5rem' }} />
          </div>
          <button onClick={generateOutfits} disabled={loading} className="btn btn-primary">{loading?'Generating...':'🔄 Generate'}</button>
          {pendingCount > 0 && <span style={{ color: 'var(--color-accent)', marginLeft: 'auto' }}>{pendingCount} feedback pending</span>}
        </div>
      </div>

      {outfits.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>View:</span>
            {['grid','swipe'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '0.4rem 1rem', background: viewMode===mode?'var(--color-accent)':'var(--color-bg-secondary)', color: viewMode===mode?'white':'var(--color-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                {mode==='swipe'?'👆 Swipe':'⊞ Grid'}
              </button>
            ))}
          </div>

          {viewMode === 'swipe' ? (
            <SwipeMode outfits={outfits} onFeedbackComplete={submitFeedback} onGenerateMore={generateOutfits} />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {outfits.map((outfit, idx) => (
                  <OutfitCard key={idx} outfit={outfit} feedback={feedback} onFeedback={handleFeedback} onExclude={() => excludeOutfit(outfit.id)} isExcluded={excludedOutfits.has(outfit.id)} />
                ))}
              </div>
              {Object.keys(feedback).length > 0 && (
                <div className="card" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1rem' }}>
                  <button onClick={() => submitFeedback()} className="btn btn-primary">💾 Save Feedback ({Object.keys(feedback).length} items)</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>🧠 Neural Network</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[{label:'Total Samples',value:stats.totalSamples||0},{label:'Pending',value:pendingCount},{label:'Val Loss',value:stats.validationLoss!=null?stats.validationLoss.toFixed(3):'—'},{label:'NN Weight',value:`${Math.round((stats.nnWeight||0)*100)}%`,highlight:stats.nnWeight>0},{label:'Train Runs',value:stats.trainingRuns||0},{label:'Excluded',value:stats.excludedItems||0}].map(({label,value,highlight}) => (
            <div key={label} style={{ padding: '0.5rem', background: 'var(--color-bg-secondary, #f5f5f5)', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: highlight?'var(--color-success, #22c55e)':'inherit' }}>{value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={trainModel} disabled={(stats.totalSamples||0)<50} className="btn btn-secondary">🧠 Train Model</button>
          {(stats.totalSamples||0)<50 && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Need 50+ samples to train ({stats.totalSamples||0}/50)</span>}
          {stats.nnWeight>0 && <span style={{ fontSize: '0.85rem', marginLeft: 'auto' }}>Scoring: {Math.round((1-stats.nnWeight)*100)}% EMA + {Math.round(stats.nnWeight*100)}% NN</span>}
        </div>
      </div>
    </div>
  )
}

function OutfitCard({ outfit, feedback, onFeedback, onExclude, isExcluded }) {
  const slots = [{key:'top',label:'Top'},{key:'bottom',label:'Bottom'},{key:'footwear',label:'Footwear'},{key:'accessory',label:'Accessory'}]
  return (
    <div className="card" style={{ padding: '0.75rem', opacity: isExcluded?0.5:1 }}>
      {outfit.finalScore!=null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          <span>Score: {outfit.finalScore.toFixed(2)}</span>
          <span style={{ opacity:0.7 }}>{outfit.scoringMethod==='blend'?`EMA ${outfit.emaScore?.toFixed(2)} + NN ${outfit.nnScore?.toFixed(2)}`:outfit.scoringMethod||'ema'}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {slots.map(slot => {
          const item = outfit.items?.[slot.key]; if (!item) return null
          const itemFeedback = feedback[item.id]
          return (
            <div key={slot.key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ width:'50px',height:'50px',borderRadius:'4px',overflow:'hidden',flexShrink:0,backgroundColor:'var(--color-bg-secondary)' }}>
                {item.primary_image?<img src={item.primary_image} alt={item.name} style={{ width:'100%',height:'100%',objectFit:'cover' }} />:<div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem' }}>👕</div>}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'0.85rem',fontWeight:'bold',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.name}</div>
                <div style={{ fontSize:'0.75rem',color:'var(--color-text-muted)' }}>{item.category}</div>
              </div>
              <div style={{ display:'flex',gap:'0.25rem' }}>
                <button onClick={() => onFeedback(item.id,'thumbs_up')} style={{ padding:'0.25rem',fontSize:'1rem',opacity:itemFeedback==='thumbs_up'?1:0.5,background:itemFeedback==='thumbs_up'?'var(--color-success)':'transparent',border:'none',cursor:'pointer' }}>👍</button>
                <button onClick={() => onFeedback(item.id,'thumbs_down')} style={{ padding:'0.25rem',fontSize:'1rem',opacity:itemFeedback==='thumbs_down'?1:0.5,background:itemFeedback==='thumbs_down'?'var(--color-error)':'transparent',border:'none',cursor:'pointer' }}>👎</button>
              </div>
            </div>
          )
        })}
        <button onClick={onExclude} disabled={isExcluded} style={{ marginTop:'0.5rem',padding:'0.5rem',fontSize:'0.85rem',background:isExcluded?'var(--color-bg-secondary)':'transparent',border:'1px solid var(--color-border)',borderRadius:'4px',cursor:isExcluded?'default':'pointer',opacity:isExcluded?0.5:1 }}>
          {isExcluded?'🚫 Excluded':'🚫 Exclude Outfit'}
        </button>
      </div>
    </div>
  )
}
