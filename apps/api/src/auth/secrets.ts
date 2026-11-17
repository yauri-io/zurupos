import argon2 from 'argon2'

// argon2id for passwords and PINs (SPEC §2).
export const hashSecret = (secret: string): Promise<string> => argon2.hash(secret, { type: argon2.argon2id })

export const verifySecret = async (hash: string, secret: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, secret)
  } catch {
    return false
  }
}

// Verified against when an account doesn't exist, so a login for an unknown
// email takes as long as one with a wrong password.
let dummyHash: Promise<string> | undefined
export const burnVerify = async (secret: string): Promise<false> => {
  dummyHash ??= hashSecret('zurupos-timing-equaliser')
  await verifySecret(await dummyHash, secret)
  return false
}
