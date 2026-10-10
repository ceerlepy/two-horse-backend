import type {
  Env
} from "../env";

import {
  isoNow
} from "../shared";

import {
  hashPassword
} from "./passwords";

import {
  issueSessionToken
} from "./jwt";

import {
  getUserByEmail,
  touchLastLogin
} from "./repository";

import {
  PASSWORD_MIN_LENGTH,
  toPublicUser,
  type PublicUser
} from "./service";

/*
 * "Şifremi unuttum": a 6-digit code goes to the account's email and
 * the member types it into the app with a new password. Only a hash
 * of the code is stored; it lives 15 minutes, allows 5 wrong tries,
 * and a new code can be asked for once a minute.
 */
export const RESET_SENDER = "noreply@twohorse.app";

const CODE_TTL_MS = 15 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_ATTEMPTS = 5;
const PASSWORD_MAX_LENGTH = 128;

async function codeHash(
  email: string,
  code: string
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${email}:${code}`
      )
    );

  return [
    ...new Uint8Array(digest)
  ]
    .map(b =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

function newCode(): string {
  const value =
    crypto.getRandomValues(
      new Uint32Array(1)
    )[0] % 1_000_000;

  return String(value).padStart(6, "0");
}

function resetMessage(
  code: string,
  lang: "tr" | "en"
): { subject: string; text: string; html: string } {
  if (lang === "en") {
    const text =
      `Your Two Horse password reset code: ${code}\n\n` +
      "Enter it in the app within 15 minutes. If you did not ask for this, ignore this email; your password stays the same.";

    return {
      subject: "Two Horse password reset code",
      text,
      html:
        `<p>Your Two Horse password reset code:</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
        `<p>Enter it in the app within 15 minutes. If you did not ask for this, ignore this email; your password stays the same.</p>`
    };
  }

  const text =
    `Two Horse şifre sıfırlama kodun: ${code}\n\n` +
    "Kodu 15 dakika içinde uygulamaya gir. Bu isteği sen yapmadıysan bu maili dikkate alma; şifren değişmez.";

  return {
    subject: "Two Horse şifre sıfırlama kodu",
    text,
    html:
      `<p>Two Horse şifre sıfırlama kodun:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>Kodu 15 dakika içinde uygulamaya gir. Bu isteği sen yapmadıysan bu maili dikkate alma; şifren değişmez.</p>`
  };
}

/*
 * Always resolves the same way whether or not the email has an
 * account, so the endpoint cannot be used to find out who is a member.
 */
export async function requestPasswordReset(
  env: Env,
  rawEmail: string,
  lang: "tr" | "en",
  now = new Date()
): Promise<void> {
  const email =
    rawEmail.trim().toLowerCase();

  if (!email) return;

  const user =
    await getUserByEmail(
      env,
      email
    );

  if (!user) return;

  const pending =
    await env.DB.prepare(
      `SELECT created_at FROM password_reset_codes WHERE email = ?`
    )
      .bind(email)
      .first<{ created_at: string }>();

  if (
    pending &&
    now.getTime() - Date.parse(pending.created_at) < RESEND_AFTER_MS
  ) {
    return;
  }

  if (!env.EMAIL) {
    throw new Error(
      "EMAIL_NOT_CONFIGURED"
    );
  }

  const code =
    newCode();

  await env.DB.prepare(
    `INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`
  )
    .bind(
      email,
      await codeHash(email, code),
      new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      now.toISOString()
    )
    .run();

  const message =
    resetMessage(
      code,
      lang
    );

  await env.EMAIL.send({
    from: {
      email: RESET_SENDER,
      name: "Two Horse App"
    },
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

export async function confirmPasswordReset(
  env: Env,
  params: {
    email: string;
    code: string;
    newPassword: string;
  },
  now = new Date()
): Promise<{
  token: string;
  user: PublicUser;
}> {
  const email =
    params.email.trim().toLowerCase();

  const code =
    params.code.replace(/\s+/g, "");

  if (
    params.newPassword.length < PASSWORD_MIN_LENGTH ||
    params.newPassword.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      "WEAK_PASSWORD"
    );
  }

  const pending =
    await env.DB.prepare(
      `SELECT code_hash, expires_at, attempts FROM password_reset_codes WHERE email = ?`
    )
      .bind(email)
      .first<{ code_hash: string; expires_at: string; attempts: number }>();

  if (
    !pending ||
    Date.parse(pending.expires_at) <= now.getTime() ||
    pending.attempts >= MAX_ATTEMPTS
  ) {
    throw new Error(
      "INVALID_RESET_CODE"
    );
  }

  if (await codeHash(email, code) !== pending.code_hash) {
    await env.DB.prepare(
      `UPDATE password_reset_codes SET attempts = attempts + 1 WHERE email = ?`
    )
      .bind(email)
      .run();

    throw new Error(
      "INVALID_RESET_CODE"
    );
  }

  const user =
    await getUserByEmail(
      env,
      email
    );

  if (!user) {
    throw new Error(
      "INVALID_RESET_CODE"
    );
  }

  /* Typing the code proves the member owns the address. */
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?`
    ).bind(
      await hashPassword(params.newPassword),
      isoNow(),
      user.id
    ),
    env.DB.prepare(
      `DELETE FROM password_reset_codes WHERE email = ?`
    ).bind(email)
  ]);

  await touchLastLogin(
    env,
    user.id
  );

  const token =
    await issueSessionToken(
      env,
      user.id
    );

  const updated =
    await getUserByEmail(
      env,
      email
    );

  return {
    token,
    user:
      toPublicUser(
        updated ?? user
      )
  };
}
