import {
  scrypt,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise(
    (resolve, reject) => {
      scrypt(
        password,
        salt,
        keylen,
        params,
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            derivedKey as Buffer
          );
        }
      );
    }
  );
}

export async function hashPassword(
  password: string
): Promise<string> {
  const salt =
    randomBytes(16);

  const derivedKey =
    await scryptAsync(
      password,
      salt,
      SCRYPT_KEYLEN,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P
      }
    );

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derivedKey.toString("hex")
  ].join(":");
}

export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const parts =
    encoded.split(":");

  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt"
  ) {
    return false;
  }

  const [
    ,
    nRaw,
    rRaw,
    pRaw,
    saltHex,
    hashHex
  ] = parts;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (
    !Number.isFinite(N) ||
    !Number.isFinite(r) ||
    !Number.isFinite(p)
  ) {
    return false;
  }

  const salt =
    Buffer.from(
      saltHex,
      "hex"
    );

  const expected =
    Buffer.from(
      hashHex,
      "hex"
    );

  const derivedKey =
    await scryptAsync(
      password,
      salt,
      expected.length,
      { N, r, p }
    );

  if (
    derivedKey.length !==
    expected.length
  ) {
    return false;
  }

  return timingSafeEqual(
    derivedKey,
    expected
  );
}
