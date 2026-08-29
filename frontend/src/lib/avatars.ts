/**
 * Fixed set of avatar choices for the guest "Me" page (F2.2). Deliberately
 * simple single-codepoint emoji only (no skin-tone modifiers, no ZWJ
 * sequences) so they render identically across devices/fonts. A mix of
 * people/animals/objects, chosen for variety with no two entries reading as
 * near-duplicates.
 */
export const AVATAR_PALETTE: string[] = [
  '🐱', '🐶', '🦊', '🐼', '🐸',
  '🐵', '🦁', '🐨', '🐯', '🐙',
  '🎸', '🎧', '🎹', '⚡', '🌟',
  '🍕', '🌵', '🚀', '🎲', '👑',
]
