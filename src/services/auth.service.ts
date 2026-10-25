import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { findUserByEmail, createUser } from '../repositories/users.repository';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegistrationInput(email: string, name: string, password: string): void {
  if (!email || !name || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email, name, and password are required');
  }
  if (password.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must not be empty or whitespace');
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid email format');
  }
}

function signToken(userId: number, email: string): string {
  return jwt.sign({ id: userId, email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as unknown as number,
  });
}

export async function register(
  rawEmail: string,
  name: string,
  password: string
): Promise<{ token: string; user: { id: number; email: string; name: string } }> {
  validateRegistrationInput(rawEmail, name, password);

  const email = normaliseEmail(rawEmail);
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);
  const user = await createUser(email, name, hashedPassword);
  const token = signToken(user.id, user.email);

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

export async function login(
  rawEmail: string,
  password: string
): Promise<{ token: string; user: { id: number; email: string; name: string } }> {
  if (!rawEmail || !password || password.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'email and password are required');
  }

  const email = normaliseEmail(rawEmail);
  const user = await findUserByEmail(email);

  // Always compare to avoid timing attacks — use dummy hash if user not found
  const hashToCompare = user?.password ?? '$2b$10$invalidhashforcomparison000000000000000000000';
  const match = await bcrypt.compare(password, hashToCompare);

  if (!user || !match) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = signToken(user.id, user.email);
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}
