# User Profile & Authentication Design

*Created: 2026-02-23*

## Overview

Three related features:
1. **Login/Sign-up** — Real auth for outerfit.net as a public website
2. **Expanded User Profiles** — Rich identity, style, and body data
3. **Wardrobe Style Indicator** — Visual presentation badge on wardrobe items

---

## 1. Authentication System

### Current State
- API key-based auth (single-user, key stored in localStorage)
- No user accounts, passwords, or session management

### Target State
- Email + password registration and login
- JWT-based session management
- Persistent sessions across devices
- Profile data tied to user account

### Database Schema

```sql
-- Users table (extends/renames current users table)
ALTER TABLE users RENAME TO user_accounts;

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY REFERENCES user_accounts(id),
  first_name TEXT,
  gender_identity TEXT,
  self_describe TEXT,
  style_presentation TEXT,
  height_value INTEGER,
  height_unit TEXT,
  body_description TEXT,
  preferred_fit TEXT,
  areas_to_highlight TEXT, -- JSON array
  areas_to_minimize TEXT,  -- JSON array
  primary_use_cases TEXT,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Login/session tracking
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY, -- JWT-style token ID
  user_id INTEGER REFERENCES user_accounts(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | None | Create account (email, password, firstName) |
| POST | /auth/login | None | Login (email, password) → JWT |
| POST | /auth/logout | JWT | Invalidate session |
| GET | /auth/me | JWT | Get current user profile |
| POST | /auth/refresh | JWT | Refresh token |

### Password Requirements
- Min 8 characters
- Stored with bcrypt (cost factor 10)
- No special chars required (keep it simple)

### Bot Protection (Anti-Spam)
- **Cloudflare Turnstile** (recommended) — Free, invisible to users, works with Cloudflare DNS
  - Add Turnstile widget to sign-up form
  - Verify token server-side before account creation
- **Honeypot fallback** — Hidden field (`website_url`) that bots fill out but humans don't see
  - If filled, reject as bot
- **Rate limiting** — Max 5 registration attempts per IP per minute

### JWT Configuration
- Access token: 7 days expiry
- Token stored in httpOnly cookie (not localStorage — more secure)
- CSRF protection via SameSite=Strict

### UI Flow

**Landing Page (unauthenticated):**
- Hero: "Your AI Wardrobe Stylist" + CTA
- Features: "Upload clothes → Get outfits → Learn your style"
- "Sign Up Free" / "Log In" buttons in nav

**Sign Up Page:**
- Email input
- Password input (+ confirm)
- First name input
- Optional: quick style quiz (see profile section)
- Terms acceptance checkbox

**Login Page:**
- Email input
- Password input
- "Remember me" checkbox
- "Forgot password" (future)

**Post-login:**
- Redirect to wardrobe
- Existing wardrobe items migrated to user account (or kept if same device)

---

## 2. Expanded User Profiles

### Profile Fields (from YAML)

```yaml
user_profile:
  identity:
    gender_identity:
      type: select
      options: [Man, Woman, Non-binary, Genderqueer, Agender, Prefer not to say, Self-describe]
    self_describe: string  # visible if gender_identity == "Self-describe"

  style_presentation:
    type: select
    options: [Feminine, Masculine, Androgynous, Fluid]

  build:
    height:
      value: integer
      unit: [cm, inches]
    body_description:
      type: free_text
      placeholder: "Describe your build in your own words (e.g. tall and lean, curvy, broad shoulders)"

  fit_preferences:
    preferred_fit: [Relaxed, Regular, Fitted]
    areas_to_highlight: multi_select [Shoulders, Chest, Waist, Hips, Legs, Arms, None]
    areas_to_minimize: multi_select [Shoulders, Chest, Waist, Hips, Legs, Arms, None]

  style_context:
    primary_use_cases: multi_select [Everyday casual, Work/office, Formal events, Active/athletic, Night out, Travel]

  metadata:
    all_fields_optional: true
    last_updated: timestamp
```

### How These Fields Are Used

| Field | Usage in App |
|-------|-------------|
| `gender_identity` | Filter clothing categories (some items gendered) |
| `style_presentation` | Style bias in outfit generation, wardrobe filter |
| `height_value/unit` | Visual sizing context, "how it fits" notes |
| `body_description` | Personal styling notes, fit adjustments |
| `preferred_fit` | Default fit preference when generating outfits |
| `areas_to_highlight` | Emphasize these in outfit suggestions |
| `areas_to_minimize` | De-emphasize these in outfit suggestions |
| `primary_use_cases` | Default occasion filters, quick outfit generation |

### Profile UI

**Profile Page Sections:**

1. **Identity Card**
   - Avatar (upload or Gravatar from email)
   - First name (editable)
   - Email (read-only, change requires password)
   - Member since

2. **Style Identity**
   - Gender identity dropdown
   - Self-describe (conditional: appears if "Self-describe" selected)
   - Style presentation dropdown
   - Visual indicator badge

3. **My Build**
   - Height (value + unit toggle)
   - Body description (free text)

4. **Fit Preferences**
   - Preferred fit (radio: Relaxed/Regular/Fitted)
   - Areas to highlight (checkboxes)
   - Areas to minimize (checkboxes)

5. **Style Context**
   - Primary use cases (checkboxes)

**Edit Mode:**
- Inline editing with "Save" / "Cancel"
- Unsaved changes warning on navigation

---

## 3. Wardrobe Style Presentation Icon

### Current State
- Wardrobe page shows items in grid
- No indication of style presentation per item

### Requirement
- Icon/badge on wardrobe items accounting for style presentation
- Visual indicator that communicates how item presents

### Design

**Icon Options:**
1. **Gendered indicator** — subtle ♂️ / ♀️ / ⚥ icon
2. **Style spectrum** — gradient bar (feminine ←→ masculine)
3. **Presentation badge** — small pill showing presentation type

**Implementation:**

```jsx
// On each item card in Wardrobe.jsx
const StyleBadge = ({ presentation }) => {
  const icons = {
    Feminine: '🌸',
    Masculine: '👔',
    Androgynous: '⚥',
    Fluid: '🌊'
  }
  return (
    <span className="style-badge" title={presentation}>
      {icons[presentation] || '⚪'}
    </span>
  )
}
```

**Placement:**
- Top-right corner of item thumbnail
- Hover shows full label
- Filter dropdown to show only specific presentation

**Data Flow:**
- Gemini vision extracts `presentation_style` from clothing photo
- Stored in items table
- Frontend reads and displays badge

---

## Implementation Phases

### Phase 1: Database & Auth Core
- [ ] Migrate users table to user_accounts
- [ ] Create user_profiles table
- [ ] Create user_sessions table
- [ ] Implement /auth/register endpoint
- [ ] Implement /auth/login endpoint  
- [ ] Implement JWT middleware
- [ ] Update frontend to use JWT (httpOnly cookie)

### Phase 2: Profile UI
- [ ] Expand Profiles.jsx with all new fields
- [ ] Add PATCH /profile endpoint
- [ ] Add conditional logic for self_describe
- [ ] Add height unit conversion
- [ ] Style with existing design system

### Phase 3: Wardrobe Integration
- [ ] Update Gemini vision to extract presentation_style
- [ ] Add style badge to item cards
- [ ] Add filter by presentation
- [ ] Use profile presentation in outfit generation

### Phase 4: Polish
- [ ] Login/Signup pages with existing design
- [ ] Password reset flow (future)
- [ ] Account deletion
- [ ] Session management (view active sessions)

---

## Technical Notes

### Backward Compatibility
- Existing API key users → auto-migrate to accounts on first login
- Keep API key auth as fallback for programmatic access
- Profile fields all optional (metadata.all_fields_optional: true)

### Security
- Bcrypt password hashing (cost 10)
- JWT expiry: 7 days
- Session tokens: UUIDv4, stored in DB
- Rate limit: 5 login attempts per minute per IP

### Future Considerations
- Password reset via email
- OAuth (Google, Apple)
- Invite-only signup (maintain privacy)
- Wardrobe sharing between accounts

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/db/schema.sql` | Add user_profiles, user_sessions tables |
| `server/db/migrations/004_auth_system.js` | Migration script |
| `server/middleware/auth.js` | Add JWT verify middleware |
| `server/routes/auth.js` | New file: register, login, logout, me |
| `server/routes/profile.js` | New file: get/update profile |
| `client/src/App.jsx` | Add auth context, protected routes |
| `client/src/pages/Auth.jsx` | New: Login + Signup combined |
| `client/src/pages/Profiles.jsx` | Expand with all profile fields |
| `client/src/pages/Wardrobe.jsx` | Add style presentation badge |
| `client/src/components/StyleBadge.jsx` | New component |
| `server/services/VisionService.js` | Extract presentation_style |
