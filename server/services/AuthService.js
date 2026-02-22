import { prepare as db } from '../db/client.js'
import bcrypt from 'bcrypt'

// Simple login with email/password
export async function loginUser(email, password) {
  const user = db('SELECT * FROM users WHERE email = ?').get(email)
  
  if (!user) {
    return { error: 'Invalid email or password' }
  }
  
  const valid = await bcrypt.compare(password, user.password)
  
  if (!valid) {
    return { error: 'Invalid email or password' }
  }
  
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    apiKey: user.api_key
  }
}
