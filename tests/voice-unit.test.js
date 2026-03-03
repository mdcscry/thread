/**
 * Voice intent parser — pure JS unit tests (no browser needed)
 * Run with: node tests/voice-unit.test.js
 */

// Inline parser (mirrors VoiceButton.jsx parseOutfitIntent)
function parseOutfitIntent(transcript) {
  const t = transcript.toLowerCase()
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

let passed = 0, failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`)
    failed++
  }
}

function expect(val) {
  return {
    toBe: (expected) => { if (val !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`) },
    toContain: (expected) => { if (!val.includes(expected)) throw new Error(`expected ${JSON.stringify(val)} to contain ${JSON.stringify(expected)}`) },
    toHaveLength: (n) => { if (val.length !== n) throw new Error(`expected length ${n}, got ${val.length}`) },
  }
}

console.log('\nVoice Intent Parser — Unit Tests\n')

// Occasions
test('defaults to casual', () => expect(parseOutfitIntent('something nice').occasion).toBe('casual'))
test('parses casual', () => expect(parseOutfitIntent('something relaxed for the weekend').occasion).toBe('casual'))
test('parses work', () => expect(parseOutfitIntent('I have a work meeting').occasion).toBe('work'))
test('parses work - office', () => expect(parseOutfitIntent('office look tomorrow').occasion).toBe('work'))
test('parses work - interview', () => expect(parseOutfitIntent('job interview outfit').occasion).toBe('work'))
test('parses formal', () => expect(parseOutfitIntent('fancy gala tonight').occasion).toBe('formal'))
test('parses date', () => expect(parseOutfitIntent('dinner date nothing too formal').occasion).toBe('date'))
test('parses date - restaurant', () => expect(parseOutfitIntent('going to a nice restaurant').occasion).toBe('date'))
test('parses outdoor', () => expect(parseOutfitIntent('hiking this weekend').occasion).toBe('outdoor'))
test('parses outdoor - gym', () => expect(parseOutfitIntent('gym outfit for today').occasion).toBe('outdoor'))

// Count
test('defaults count to 5', () => expect(parseOutfitIntent('show me some outfits').count).toBe(5))
test('parses count - outfits', () => expect(parseOutfitIntent('show me 3 outfit options').count).toBe(3))
test('parses count - looks', () => expect(parseOutfitIntent('give me 7 looks').count).toBe(7))
test('caps count at 10', () => expect(parseOutfitIntent('show me 99 outfit options').count).toBe(10))
test('count of 1', () => expect(parseOutfitIntent('just 1 outfit').count).toBe(1))

// Style words
test('parses colorful', () => expect(parseOutfitIntent('something colorful and bold').styleWords).toContain('colorful'))
test('parses multiple styles', () => expect(parseOutfitIntent('dark minimal look').styleWords).toHaveLength(2))
test('no style words = empty array', () => expect(parseOutfitIntent('show me outfits').styleWords).toHaveLength(0))

// Transcript preserved
test('preserves original transcript', () => expect(parseOutfitIntent('hello world').transcript).toBe('hello world'))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
