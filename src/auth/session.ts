/**
 * Authentication and access control.
 *
 * Security concept:
 *
 * 1. Passwords are NEVER stored or transmitted in plaintext.
 *    Instead: SHA-256(password + game_id) hash stored in Supabase.
 *
 * 2. The Supabase anon key only allows Row-Level-Security (RLS) access.
 *    Each group can only write its own rows.
 *    Reading is restricted for authenticated groups (passwords not visible).
 *
 * 3. Origin check: Supabase RLS verifies the request comes from a known domain
 *    (GitHub Pages URL or localhost).
 *    Configurable under Supabase → Authentication → URL Configuration.
 *
 * 4. Session token: After successful login a random token
 *    (SHA-256 based) is stored in sessionStorage.
 *    No token = no access to protected pages.
 *
 * Why SHA-256 and not bcrypt?
 *   WebCrypto (SHA-256) is available in the browser, but not bcrypt.
 *   For a simulation game (not a production system) SHA-256 + salt
 *   (game_id as salt) is sufficient.
 */

/** Computes SHA-256 hash – uses the Web Crypto API (no dependency) */
export async function sha256(input: string): Promise<string> {
  const encoder  = new TextEncoder()
  const data     = encoder.encode(input)
  const hashBuf  = await crypto.subtle.digest('SHA-256', data)
  const hashArr  = Array.from(new Uint8Array(hashBuf))
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Hash for admin password: SHA-256(password + ':admin:' + game_id) */
export async function hashAdminPw(password: string, gameId: string): Promise<string> {
  return sha256(`${password}:admin:${gameId}`)
}

/** Hash for group password: SHA-256(groupname + ':' + password + ':' + game_id) */
export async function hashGroupPw(
  groupname: string,
  password:  string,
  gameId:    string,
): Promise<string> {
  return sha256(`${groupname}:${password}:${gameId}`)
}

// ── Session ────────────────────────────────────────────────────────────────

export type LoginAs = 'admin' | 'groupadmin' | 'viewer' | ''

export interface Session {
  login_as:  LoginAs
  gruppe:    string
  token:     string   // SHA-256 based session token
  spiel_id:  string
}

const SESSION_KEY = 'planspiel_session'

export function getSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function setSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function isLoggedIn(): boolean {
  return getSession()?.login_as !== '' && getSession() !== null
}

export function isAdmin(): boolean {
  return getSession()?.login_as === 'admin'
}

export function isGroupAdmin(): boolean {
  return getSession()?.login_as === 'groupadmin'
}

/** Generates a random session token */
export async function generateSessionToken(
  login_as: LoginAs,
  gruppe:   string,
  gameId:   string,
): Promise<string> {
  const rand = crypto.getRandomValues(new Uint8Array(16))
  const randHex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('')
  return sha256(`${randHex}:${login_as}:${gruppe}:${gameId}:${Date.now()}`)
}
