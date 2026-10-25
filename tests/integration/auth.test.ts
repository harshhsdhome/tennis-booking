import request from 'supertest';
import app from '../../src/server';
import { pool } from '../../src/db/pool';
import jwt from 'jsonwebtoken';

// Clean users table before each test so emails don't conflict
beforeEach(async () => {
  await pool.query('DELETE FROM users');
});

afterAll(async () => {
  await pool.end();
});

const validUser = { email: 'test@example.com', name: 'Test User', password: 'password123' };

// ---------------------------------------------------------------------------
// POST /auth/register — AC-1
// ---------------------------------------------------------------------------
describe('POST /auth/register', () => {
  it('creates a user and returns 201 with token and user info', async () => {
    const res = await request(app).post('/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.password).toBeUndefined(); // never returned
  });

  it('normalises email to lowercase and trims whitespace', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: '  TEST@EXAMPLE.COM  ', name: 'User', password: 'pass123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('returns 409 when email already exists', async () => {
    await request(app).post('/auth/register').send(validUser);
    const res = await request(app).post('/auth/register').send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('returns 409 case-insensitively for duplicate email', async () => {
    await request(app).post('/auth/register').send(validUser);
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validUser, email: 'TEST@EXAMPLE.COM' });
    expect(res.status).toBe(409);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid email format', async () => {
    for (const email of ['invalid-email', '@domain.com', 'user@']) {
      const res = await request(app)
        .post('/auth/register')
        .send({ email, name: 'User', password: 'pass123' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 400 for empty or whitespace-only password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', name: 'User', password: '   ' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login — AC-2
// ---------------------------------------------------------------------------
describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send(validUser);
  });

  it('returns 200 with token on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
  });

  it('matches email case-insensitively', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'TEST@EXAMPLE.COM', password: validUser.password });
    expect(res.status).toBe(200);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for non-existent email without revealing which is wrong', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 for missing credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: validUser.email });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// authenticate middleware — AC-3
// ---------------------------------------------------------------------------
describe('authenticate middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/bookings/mine');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when scheme is not Bearer', async () => {
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', 'Basic sometoken');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed/tampered token', async () => {
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', 'Bearer this.is.notvalid');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with wrong secret', async () => {
    const badToken = jwt.sign({ id: 1, email: 'x@x.com' }, 'wrong_secret');
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });
});
