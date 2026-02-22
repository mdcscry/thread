import React, { useState } from 'react'

const API_BASE = ''

export default function Profiles({ apiKey, currentUser, onSwitchUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editGender, setEditGender] = useState('')
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
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setEditingId(null)
  }

  const saveProfile = async (e, userId) => {
    e.stopPropagation()
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: editName, gender: editGender })
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
      <h1 style={{ marginBottom: '1.5rem' }}>👥 Profiles</h1>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        {users.map(user => (
          <div
            key={user.id}
            className="card"
            style={{
              cursor: 'pointer',
              border: currentUser?.id === user.id ? '2px solid var(--color-accent)' : '1px solid var(--color-border)'
            }}
            onClick={() => onSwitchUser(user)}
          >
            {/* Avatar + header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', flexShrink: 0
              }}>
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} style={{ width: 60, height: 60, borderRadius: '50%' }} />
                  : (user.name || '?').charAt(0).toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>{user.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.2rem 0 0' }}>
                  {user.email}
                </p>
                {currentUser?.id === user.id && (
                  <span className="badge badge-success" style={{ marginTop: '0.25rem' }}>Active</span>
                )}
              </div>
            </div>

            {/* Edit form */}
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              {editingId === user.id ? (
                <div onClick={e => e.stopPropagation()}>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Name</label>
                    <input
                      data-testid={`name-input-${user.id}`}
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Your name"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>Gender</label>
                    <select
                      data-testid={`gender-select-${user.id}`}
                      value={editGender}
                      onChange={e => setEditGender(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Select gender...</option>
                      <option value="man">Man</option>
                      <option value="woman">Woman</option>
                      <option value="nonbinary">Non-binary</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      data-testid={`save-profile-${user.id}`}
                      className="btn btn-primary"
                      onClick={e => saveProfile(e, user.id)}
                      disabled={saving}
                      style={{ flex: 1 }}
                    >
                      {saving ? 'Saving...' : 'Save'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {user.gender
                      ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
                      : 'No gender set'}
                  </span>
                  <button
                    data-testid={`edit-profile-${user.id}`}
                    className="btn"
                    onClick={e => startEdit(e, user)}
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>👔 Couple Coordination</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        Generate outfits for both of you together — optimized for coordination at shared events.
      </p>
      <CoupleGenerator apiKey={apiKey} users={users} currentUser={currentUser} />
    </div>
  )
}

function CoupleGenerator({ apiKey, users, currentUser }) {
  const [user1Id, setUser1Id] = useState(users[0]?.id || 1)
  const [user2Id, setUser2Id] = useState(users[1]?.id || 2)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [outfits, setOutfits] = useState([])

  const generateCouple = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/outfits/generate-couple`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user1Id, user2Id, chatPrompt: prompt })
      })
      const data = await res.json()
      setOutfits(data.pairs || [])
    } catch (err) {
      console.error('Generate couple error:', err)
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <div className="form-group">
        <label>Person 1</label>
        <select value={user1Id} onChange={e => setUser1Id(parseInt(e.target.value))}>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.gender ? `(${u.gender})` : ''}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Person 2</label>
        <select value={user2Id} onChange={e => setUser2Id(parseInt(e.target.value))}>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.gender ? `(${u.gender})` : ''}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>What are you doing?</label>
        <input
          type="text"
          placeholder="Date night, friend's wedding, Colorado hiking..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={generateCouple}
        disabled={loading || !prompt.trim()}
        style={{ width: '100%' }}
      >
        {loading ? 'Generating...' : '👔 Generate Couple Outfits'}
      </button>
      {outfits.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          {outfits.map((pair, i) => (
            <div key={i} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{users.find(u => u.id === user1Id)?.name}</h4>
                  {pair.outfit1?.items?.map((item, idx) => <div key={idx} style={{ fontSize: '0.9rem' }}>{item.name || item.subcategory}</div>)}
                </div>
                <div>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{users.find(u => u.id === user2Id)?.name}</h4>
                  {pair.outfit2?.items?.map((item, idx) => <div key={idx} style={{ fontSize: '0.9rem' }}>{item.name || item.subcategory}</div>)}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-accent)' }}>
                Coordination: {Math.round((pair.score || 0) * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
