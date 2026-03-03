import React, { useState, useRef, useEffect, useCallback } from 'react'

function parseOutfitIntent(transcript) {
  const t = transcript.toLowerCase()
  // Order matters — more specific first
  const occasionMap = [
    ['outdoor', ['hiking','gym','athletic','sport','active','workout','run','trail']],
    ['date',    ['date night','dinner date','romantic','evening out','night out','restaurant','first date']],
    ['work',    ['work','office','professional','business','meeting','interview']],
    ['formal',  ['formal','gala','black tie','fancy','elegant','black-tie']],
    ['date',    ['dinner','date']],
    ['casual',  ['casual','relaxed','chill','everyday','weekend','lounge']],
  ]
  let occasion = 'casual'
  for (const [occ, words] of occasionMap) {
    if (words.some(w => t.includes(w))) { occasion = occ; break }
  }
  const countMatch = t.match(/(\d+)\s*(outfit|look|option)/i)
  const count = countMatch ? Math.min(parseInt(countMatch[1]), 10) : 5
  const styleWords = []
  const styleHints = ['colorful','dark','light','minimal','bold','classic','trendy','vintage','modern','cozy','layered']
  styleHints.forEach(w => { if (t.includes(w)) styleWords.push(w) })
  return { occasion, count, styleWords, transcript }
}

export default function VoiceButton({ onResult, disabled, placeholder }) {
  const [state, setState] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [intent, setIntent] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const recognitionRef = useRef(null)
  const timeoutRef = useRef(null)

  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!supported) { setErrorMsg('Voice not supported in this browser'); setState('error'); return }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      setTranscript(text)
      setIntent(parseOutfitIntent(text))
      setState('confirm')
    }
    rec.onerror = (e) => {
      setErrorMsg(e.error === 'not-allowed' ? 'Mic access denied' : `Error: ${e.error}`)
      setState('error')
    }
    rec.onend = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setState(s => s === 'listening' ? 'idle' : s)
    }
    recognitionRef.current = rec
    rec.start()
    setState('listening')
    timeoutRef.current = setTimeout(() => { rec.stop() }, 10000)
  }, [supported])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) recognitionRef.current.stop()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setState('idle')
  }, [])

  const confirm = () => { if (intent) { onResult(intent); setState('idle'); setTranscript(''); setIntent(null) } }
  const retry = () => { setState('idle'); setTranscript(''); setIntent(null); setTimeout(startListening, 100) }
  const cancel = () => { setState('idle'); setTranscript(''); setIntent(null) }

  useEffect(() => () => {
    if (recognitionRef.current) recognitionRef.current.abort()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  if (!supported) return null

  if (state === 'confirm' && intent) {
    return (
      <div style={{ background: 'var(--color-bg-secondary,#f5f5f5)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>You said:</div>
        <div style={{ fontStyle: 'italic', marginBottom: '0.75rem' }}>"{transcript}"</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem' }}>Generating:</span>
          <span style={{ background: 'var(--color-accent,#6366f1)', color: 'white', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', textTransform: 'capitalize' }}>{intent.occasion}</span>
          <span style={{ background: 'var(--color-bg,#eee)', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}>{intent.count} outfits</span>
          {intent.styleWords.map(w => <span key={w} style={{ background: 'var(--color-bg,#eee)', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}>{w}</span>)}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={confirm} className="btn btn-primary" style={{ flex: 1 }}>✓ Generate</button>
          <button onClick={retry} className="btn btn-secondary">🎤 Retry</button>
          <button onClick={cancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0 0.5rem' }}>✕</button>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ color: 'var(--color-error,#ef4444)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span>⚠️ {errorMsg}</span>
        <button onClick={cancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>dismiss</button>
      </div>
    )
  }

  const isListening = state === 'listening'
  return (
    <button
      onClick={isListening ? stopListening : startListening}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        width: '100%', padding: '0.9rem 1.25rem',
        background: isListening ? '#ef4444' : 'var(--color-bg-secondary,#f5f5f5)',
        border: isListening ? '2px solid #ef4444' : '2px dashed var(--color-border,#ddd)',
        borderRadius: '12px', cursor: 'pointer',
        color: isListening ? 'white' : 'var(--color-text-muted)',
        fontSize: '0.95rem', transition: 'all 0.2s ease',
        fontWeight: isListening ? 'bold' : 'normal',
      }}
    >
      <span style={{ fontSize: '1.4rem', animation: isListening ? 'vb-pulse 1s infinite' : 'none' }}>
        {isListening ? '🔴' : '🎤'}
      </span>
      <span>{isListening ? 'Listening... (tap to stop)' : placeholder || "Tap to describe what you're looking for"}</span>
      <style>{`@keyframes vb-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </button>
  )
}
