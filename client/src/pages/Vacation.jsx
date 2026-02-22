import React, { useState } from 'react'

const API_BASE = ''

export default function Vacation({ apiKey }) {
  const [trips, setTrips] = useState([])
  const [planning, setPlanning] = useState(false)
  const [form, setForm] = useState({
    name: '',
    destination: '',
    startDate: '',
    endDate: '',
    climate: 'mild',
    maxItems: 12,
    activities: []
  })
  const [result, setResult] = useState(null)

  const activityOptions = ['beach', 'casual', 'dining', 'hiking', 'sightseeing', 'nightlife', 'business']

  const toggleActivity = (activity) => {
    setForm(prev => ({
      ...prev,
      activities: prev.activities.includes(activity)
        ? prev.activities.filter(a => a !== activity)
        : [...prev.activities, activity]
    }))
  }

  const planTrip = async () => {
    if (form.activities.length === 0) {
      alert('Select at least one activity')
      return
    }

    setPlanning(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/vacation/plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: form.name,
          destination: form.destination,
          startDate: form.startDate,
          endDate: form.endDate,
          climate: form.climate,
          maxItems: form.maxItems,
          activities: form.activities,
          numDays: form.startDate && form.endDate 
            ? Math.ceil((new Date(form.endDate) - new Date(form.startDate)) / (1000 * 60 * 60 * 24))
            : 7
        })
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      console.error('Planning error:', err)
    }
    setPlanning(false)
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>✈️ Vacation Packer</h1>

      <div className="grid grid-2" style={{ gap: '2rem' }}>
        {/* Planning Form */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Plan Your Trip</h3>

          <div className="form-group">
            <label>Trip Name</label>
            <input
              type="text"
              placeholder="Paris Summer Trip"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Destination</label>
            <input
              type="text"
              placeholder="Paris, France"
              value={form.destination}
              onChange={e => setForm({ ...form, destination: e.target.value })}
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Climate</label>
            <select value={form.climate} onChange={e => setForm({ ...form, climate: e.target.value })}>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="mild">Mild</option>
              <option value="cold">Cold</option>
              <option value="variable">Variable</option>
            </select>
          </div>

          <div className="form-group">
            <label>Max Items to Pack</label>
            <input
              type="number"
              min="5"
              max="20"
              value={form.maxItems}
              onChange={e => setForm({ ...form, maxItems: parseInt(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label>Activities</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {activityOptions.map(activity => (
                <button
                  key={activity}
                  className={`btn ${form.activities.includes(activity) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleActivity(activity)}
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  {activity}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={planTrip}
            disabled={planning}
            style={{ width: '100%' }}
          >
            {planning ? 'Optimizing...' : '🎯 Optimize Packing List'}
          </button>
        </div>

        {/* Results */}
        <div>
          {result ? (
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>📦 Pack These {result.items?.length} Items</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Creates {result.totalOutfits} outfits • Versatility: {result.versatilityScore?.toFixed(1)}
              </p>

              <div className="item-grid">
                {result.items?.map(item => (
                  <div key={item.id} className="item-card">
                    <img
                      src={item.image_thumbnail ? `/images/${item.image_thumbnail.replace('./data/images/', '')}` : '/placeholder.jpg'}
                      alt={item.name}
                    />
                    <div className="item-card-info">
                      <div className="item-card-name">{item.name || item.category}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn btn-secondary" style={{ marginTop: '1rem', width: '100%' }}>
                📄 Export Packing List
              </button>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✈️</div>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Tell us about your trip and we'll optimize your packing list for maximum outfit variety!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
