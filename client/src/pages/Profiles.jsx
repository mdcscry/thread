import React, { useState } from 'react'

const API_BASE = ''

// Profile field options from design spec
const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Genderqueer', 'Agender', 'Prefer not to say', 'Self-describe']
const STYLE_OPTIONS = ['Feminine', 'Masculine', 'Androgynous', 'Fluid']
const FIT_OPTIONS = ['Relaxed', 'Regular', 'Fitted']
const BODY_AREAS = ['Shoulders', 'Chest', 'Waist', 'Hips', 'Legs', 'Arms', 'None']
const USE_CASE_OPTIONS = ['Everyday casual', 'Work/office', 'Formal events', 'Active/athletic', 'Night out', 'Travel']

export default function Profiles({ apiKey, currentUser, onSwitchUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  
  // Basic fields
  const [editName, setEditName] = useState('')
  const [editGender, setEditGender] = useState('')
  
  // New expanded fields
  const [editGenderIdentity, setEditGenderIdentity] = useState('')
  const [editSelfDescribe, setEditSelfDescribe] = useState('')
  const [editStylePresentation, setEditStylePresentation] = useState('')
  const [editHeightValue, setEditHeightValue] = useState('')
  const [editHeightUnit, setEditHeightUnit] = useState('inches')
  const [editBodyDescription, setEditBodyDescription] = useState('')
  const [editPreferredFit, setEditPreferredFit] = useState('')
  const [editAreasHighlight, setEditAreasHighlight] = useState([])
  const [editAreasMinimize, setEditAreasMinimize] = useState([])
  const [editUseCases, setEditUseCases] = useState([])
  
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    loadUsers()
  }, [apiKey])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users:', err)
    }
    setLoading(false)
  }

  const startEdit = (e, user) => {
    e.stopPropagation()
    setEditingId(user.id)
    setEditName(user.name || '')
    setEditGender(user.gender || '')
    
    // Parse preferences JSON for expanded fields
    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences || '{}') : (user.preferences || {})
    
    setEditGenderIdentity(prefs.gender_identity || '')
    setEditSelfDescribe(prefs.self_describe || '')
    setEditStylePresentation(prefs.style_presentation || '')
    setEditHeightValue(prefs.height_value || '')
    setEditHeightUnit(prefs.height_unit || 'inches')
    setEditBodyDescription(prefs.body_description || '')
    setEditPreferredFit(prefs.preferred_fit || '')
    setEditAreasHighlight(prefs.areas_to_highlight || [])
    setEditAreasMinimize(prefs.areas_to_minimize || [])
    setEditUseCases(prefs.primary_use_cases || [])
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setEditingId(null)
  }

  const toggleArrayField = (array, value, setter) => {
    if (array.includes(value)) {
      setter(array.filter(v => v !== value))
    } else {
      setter([...array, value])
    }
  }

  const saveProfile = async (e, userId) => {
    e.stopPropagation()
    setSaving(true)
    
    const preferences = {
      gender_identity: editGenderIdentity,
      self_describe: editGenderIdentity === 'Self-describe' ? editSelfDescribe : '',
      style_presentation: editStylePresentation,
      height_value: editHeightValue ? parseInt(editHeightValue) : null,
      height_unit: editHeightUnit,
      body_description: editBodyDescription,
      preferred_fit: editPreferredFit,
      areas_to_highlight: editAreasHighlight,
      areas_to_minimize: editAreasMinimize,
      primary_use_cases: editUseCases
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: editName, 
          gender: editGender,
          preferences: JSON.stringify(preferences)
        })
      })
      if (!res.ok) {
        const err = await res.json()
        alert('Save failed: ' + (err.error || res.status))
      } else {
        setEditingId(null)
        loadUsers()
      }
    } catch (err) {
      console.error('Failed to update:', err)
    }
    setSaving(false)
  }

  if (loading) return <div className="loading">Loading profiles...</div>

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>👤 My Profile</h1>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        {users.filter(u => currentUser?.id === u.id).map(user => (
          <div
            key={user.id}
            className="card"
            style={{
              cursor: 'default',
              border: '2px solid var(--color-accent)'
            }}
          >
            {/* Avatar + header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', flexShrink: 0
              }}>
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} style={{ width: 80, height: 80, borderRadius: '50%' }} />
                  : (user.name || '?').charAt(0).toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>{user.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.2rem 0 0' }}>
                  {user.email}
                </p>
              </div>
            </div>

            {/* Profile Sections */}
            {editingId === user.id ? (
              <div>
                {/* Basic Info */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-accent)' }}>👤 Identity</h4>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Your name"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Style Identity */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-accent)' }}>🎭 Style Identity</h4>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Gender Identity</label>
                    <select
                      value={editGenderIdentity}
                      onChange={e => setEditGenderIdentity(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Select...</option>
                      {GENDER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  {editGenderIdentity === 'Self-describe' && (
                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={editSelfDescribe}
                        onChange={e => setEditSelfDescribe(e.target.value)}
                        placeholder="Describe your gender identity"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Style Presentation</label>
                    <select
                      value={editStylePresentation}
                      onChange={e => setEditStylePresentation(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Select...</option>
                      {STYLE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {opt === 'Feminine' ? '👗' : opt === 'Masculine' ? '👔' : opt === 'Androgynous' ? '⚥' : '🌊'} {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Build */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-accent)' }}>📐 My Build</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Height</label>
                      <input
                        type="number"
                        value={editHeightValue}
                        onChange={e => setEditHeightValue(e.target.value)}
                        placeholder="70"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="form-group" style={{ width: '100px', marginBottom: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Unit</label>
                      <select
                        value={editHeightUnit}
                        onChange={e => setEditHeightUnit(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="inches">inches</option>
                        <option value="cm">cm</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Body Description</label>
                    <textarea
                      value={editBodyDescription}
                      onChange={e => setEditBodyDescription(e.target.value)}
                      placeholder="e.g. Tall and lean, broad shoulders, athletic build"
                      style={{ width: '100%', minHeight: '60px' }}
                    />
                  </div>
                </div>

                {/* Fit Preferences */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-accent)' }}>✨ Fit Preferences</h4>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Preferred Fit</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {FIT_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setEditPreferredFit(opt === editPreferredFit ? '' : opt)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            border: editPreferredFit === opt ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: editPreferredFit === opt ? 'var(--color-accent)' : 'transparent',
                            color: editPreferredFit === opt ? 'white' : 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Areas to Highlight</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {BODY_AREAS.filter(a => a !== 'None').map(area => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => toggleArrayField(editAreasHighlight, area, setEditAreasHighlight)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            border: editAreasHighlight.includes(area) ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: editAreasHighlight.includes(area) ? 'var(--color-accent)' : 'transparent',
                            color: editAreasHighlight.includes(area) ? 'white' : 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Areas to Minimize</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {BODY_AREAS.map(area => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => toggleArrayField(editAreasMinimize, area, setEditAreasMinimize)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            border: editAreasMinimize.includes(area) ? '1px solid var(--color-error)' : '1px solid var(--color-border)',
                            background: editAreasMinimize.includes(area) ? 'var(--color-error)' : 'transparent',
                            color: editAreasMinimize.includes(area) ? 'white' : 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Style Context */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-accent)' }}>🎯 How I Dress</h4>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem' }}>Primary Use Cases</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {USE_CASE_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayField(editUseCases, opt, setEditUseCases)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            border: editUseCases.includes(opt) ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: editUseCases.includes(opt) ? 'var(--color-accent)' : 'transparent',
                            color: editUseCases.includes(opt) ? 'white' : 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save/Cancel */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={e => saveProfile(e, user.id)}
                    disabled={saving}
                    style={{ flex: 1 }}
                  >
                    {saving ? 'Saving...' : '💾 Save Profile'}
                  </button>
                  <button
                    className="btn"
                    onClick={cancelEdit}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div>
                {/* Style Identity Display */}
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>🎭 Style</h4>
                  {(() => {
                    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences || '{}') : (user.preferences || {})
                    const icon = { Feminine: '👗', Masculine: '👔', Androgynous: '⚥', Fluid: '🌊' }[prefs.style_presentation]
                    return (
                      <div>
                        <span style={{ marginRight: '0.5rem' }}>{icon || '—'}</span>
                        {prefs.style_presentation || 'Not set'}
                        {prefs.gender_identity && <span style={{ color: 'var(--color-text-muted)' }}> · {prefs.gender_identity}</span>}
                      </div>
                    )
                  })()}
                </div>

                {/* Build Display */}
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>📐 Build</h4>
                  {(() => {
                    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences || '{}') : (user.preferences || {})
                    const height = prefs.height_value ? `${prefs.height_value} ${prefs.height_unit || 'inches'}` : null
                    return (
                      <div>
                        {height || '—'}
                        {prefs.body_description && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{prefs.body_description}</div>}
                      </div>
                    )
                  })()}
                </div>

                {/* Fit Preferences Display */}
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>✨ Fit</h4>
                  {(() => {
                    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences || '{}') : (user.preferences || {})
                    return (
                      <div>
                        <div>{prefs.preferred_fit || 'No preference'}</div>
                        {prefs.areas_to_highlight?.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            ↑ {prefs.areas_to_highlight.join(', ')}
                          </div>
                        )}
                        {prefs.areas_to_minimize?.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            ↓ {prefs.areas_to_minimize.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Use Cases Display */}
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>🎯 Dress For</h4>
                  {(() => {
                    const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences || '{}') : (user.preferences || {})
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {prefs.primary_use_cases?.length > 0 
                          ? prefs.primary_use_cases.map(u => (
                              <span key={u} style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', background: 'var(--color-surface-2)', borderRadius: '4px' }}>{u}</span>
                            ))
                          : <span style={{ color: 'var(--color-text-muted)' }}>Not set</span>
                        }
                      </div>
                    )
                  })()}
                </div>

                <button
                  className="btn"
                  onClick={e => startEdit(e, user)}
                  style={{ width: '100%' }}
                >
                  ✏️ Edit Profile
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Other Users */}
      {users.filter(u => currentUser?.id !== u.id).length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>👥 Other Profiles</h2>
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            {users.filter(u => currentUser?.id !== u.id).map(user => (
              <div
                key={user.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => onSwitchUser(user)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'var(--color-surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.25rem'
                  }}>
                    {(user.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div>{user.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{user.email}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
