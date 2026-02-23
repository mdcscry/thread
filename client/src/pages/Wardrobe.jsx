import React, { useState, useEffect } from 'react'

const API_BASE = ''

// Category options for clothing items
const CATEGORIES = [
  // Tops
  'T-Shirt',
  'Button-Up', 
  'Knitwear',
  'Hoodie',
  'Jacket',
  // Bottoms
  'Jeans',
  'Pants',
  'Shorts',
  // Footwear
  'Boots',
  'Sneakers',
  'Shoes',
  'Sandals',
  // Accessories
  'Belt',
  'Hat',
  'Socks',
  // Other
  'Other'
]
const COLORS = ['black', 'white', 'gray', 'navy', 'blue', 'red', 'green', 'brown', 'beige', 'pink', 'purple', 'orange', 'yellow']
const PATTERNS = ['solid', 'striped', 'plaid', 'floral', 'geometric', 'animal', 'textured', 'graphic']
const MATERIALS = ['cotton', 'wool', 'silk', 'linen', 'polyester', 'denim', 'leather', 'knit', 'synthetic', 'cashmere']
const SEASONS = ['spring', 'summer', 'fall', 'winter']
const OCCASIONS = ['casual', 'work', 'evening', 'sporty', 'boho', 'edgy', 'classic', 'romantic']

export default function Wardrobe({ apiKey }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/items`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setItems(data)
    } catch (err) {
      console.error('Failed to load items:', err)
    }
    setLoading(false)
  }

  const toggleLove = async (itemId) => {
    try {
      await fetch(`${API_BASE}/api/v1/items/${itemId}/love`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      loadItems()
    } catch (err) {
      console.error('Failed to toggle love:', err)
    }
  }

  const deleteItem = async (itemId) => {
    if (!confirm('Delete this item?')) return
    try {
      await fetch(`${API_BASE}/api/v1/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      loadItems()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const openEdit = (item) => {
    setEditingItem({
      ...item,
      colors: Array.isArray(item.colors) ? item.colors : [],
      style_tags: Array.isArray(item.style_tags) ? item.style_tags : [],
      occasion: Array.isArray(item.occasion) ? item.occasion : [],
      season: Array.isArray(item.season) ? item.season : []
    })
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/items/${editingItem.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editingItem.name,
          category: editingItem.category,
          subcategory: editingItem.subcategory,
          primary_color: editingItem.primary_color,
          secondary_color: editingItem.secondary_color,
          weft_color: editingItem.weft_color,
          colors: editingItem.colors,
          pattern: editingItem.pattern,
          material: editingItem.material,
          season: editingItem.season,
          formality: editingItem.formality,
          occasion: editingItem.occasion
        })
      })
      if (res.ok) {
        setEditingItem(null)
        loadItems()
      } else {
        alert('Failed to save')
      }
    } catch (err) {
      console.error('Failed to save:', err)
    }
    setSaving(false)
  }

  const filteredItems = items.filter(item => {
    if (filter !== 'all' && item.category !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!item.name?.toLowerCase().includes(s) && 
          !item.primary_color?.toLowerCase().includes(s)) {
        return false
      }
    }
    return true
  })

  const categories = ['all', ...CATEGORIES]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>👗 Your Wardrobe</h1>
        <span style={{ color: 'var(--color-text-muted)' }}>{items.length} items</span>
      </div>

      {/* Search and Filter */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input 
          type="text" 
          placeholder="Search..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        
        <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`tab ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👗</div>
          <p>No items yet. Import some clothes to get started!</p>
        </div>
      ) : (
        <div className="item-grid">
          {filteredItems.map(item => (
            <div key={item.id} className="item-card" onClick={() => openEdit(item)} style={{ cursor: 'pointer' }}>
              {item.primary_image ? (
                <img 
                  src={item.primary_image.path_thumb ? `/images/${item.primary_image.path_thumb}` : '/placeholder.jpg'} 
                  alt={item.name}
                  onError={(e) => e.target.style.display = 'none'}
                />
              ) : (
                <div style={{
                  width: '100%', aspectRatio: '3/4',
                  background: 'var(--color-surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)'
                }}>📷</div>
              )}
              <div className="item-card-actions" onClick={e => e.stopPropagation()}>
                <button className={`icon-btn ${item.is_loved ? 'active' : ''}`} onClick={() => toggleLove(item.id)}>
                  {item.is_loved ? '❤️' : '🤍'}
                </button>
                <button className="icon-btn" onClick={() => deleteItem(item.id)} style={{ background: 'rgba(255,0,0,0.5)' }}>🗑️</button>
                {item.ai_flagged && <span className="badge badge-warning" style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none' }}>⚑</span>}
              </div>
              <div className="item-card-info">
                <div className="item-card-name">{item.name || item.category || 'Uncategorized'}</div>
                <div className="item-card-meta">{item.primary_color || 'No color'} · {item.subcategory || item.category || 'uncategorized'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Edit Item</h2>
              <button className="icon-btn" onClick={() => setEditingItem(null)}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editingItem.name || ''}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g., Blue Oxford Shirt"
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={editingItem.category || ''}
                  onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                >
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Subcategory</label>
                <input
                  type="text"
                  value={editingItem.subcategory || ''}
                  onChange={e => setEditingItem({ ...editingItem, subcategory: e.target.value })}
                  placeholder="e.g., button-down, cardigan"
                />
              </div>

              <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                <div className="form-group">
                  <label>Primary Color</label>
                  <select
                    value={editingItem.primary_color || ''}
                    onChange={e => setEditingItem({ ...editingItem, primary_color: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Secondary Color</label>
                  <select
                    value={editingItem.secondary_color || ''}
                    onChange={e => setEditingItem({ ...editingItem, secondary_color: e.target.value })}
                  >
                    <option value="">None</option>
                    {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Weft Color (inner)</label>
                <select
                  value={editingItem.weft_color || ''}
                  onChange={e => setEditingItem({ ...editingItem, weft_color: e.target.value })}
                >
                  <option value="">None</option>
                  {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Pattern</label>
                <select
                  value={editingItem.pattern || ''}
                  onChange={e => setEditingItem({ ...editingItem, pattern: e.target.value })}
                >
                  <option value="">Select...</option>
                  {PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Material</label>
                <select
                  value={editingItem.material || ''}
                  onChange={e => setEditingItem({ ...editingItem, material: e.target.value })}
                >
                  <option value="">Select...</option>
                  {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Formality (1-10)</label>
                <input
                  type="range"
                  min="1" max="10"
                  value={editingItem.formality || 5}
                  onChange={e => setEditingItem({ ...editingItem, formality: parseInt(e.target.value) })}
                />
                <span style={{ fontSize: '0.8rem' }}>{editingItem.formality || 5} - {editingItem.formality <= 3 ? 'Casual' : editingItem.formality <= 7 ? 'Business Casual' : 'Formal'}</span>
              </div>

              <div className="form-group">
                <label>Seasons</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {SEASONS.map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="checkbox"
                        checked={editingItem.season?.includes(s)}
                        onChange={e => {
                          const seasons = editingItem.season || []
                          if (e.target.checked) {
                            setEditingItem({ ...editingItem, season: [...seasons, s] })
                          } else {
                            setEditingItem({ ...editingItem, season: seasons.filter(x => x !== s) })
                          }
                        }}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Occasions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {OCCASIONS.map(o => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="checkbox"
                        checked={editingItem.occasion?.includes(o)}
                        onChange={e => {
                          const occasions = editingItem.occasion || []
                          if (e.target.checked) {
                            setEditingItem({ ...editingItem, occasion: [...occasions, o] })
                          } else {
                            setEditingItem({ ...editingItem, occasion: occasions.filter(x => x !== o) })
                          }
                        }}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn" onClick={() => setEditingItem(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
