import { AppError } from '../../src/errors/AppError';
import { errorHandler } from '../../src/middleware/errorHandler';
import { Request, Response, NextFunction } from 'express';

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockReq = {} as Request;
const mockNext = jest.fn() as NextFunction;

describe('AppError', () => {
  it('preserves httpStatus, code, message, and details', () => {
    const err = new AppError(400, 'VALIDATION_ERROR', 'Bad input', { field: 'email' });
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Bad input');
    expect(err.details).toEqual({ field: 'email' });
    expect(err instanceof Error).toBe(true);
  });
});

describe('errorHandler', () => {
  it('serialises AppError to correct shape and status', () => {
    const res = mockRes();
    const err = new AppError(409, 'COURT_DOUBLE_BOOKING', 'Time slot already booked');
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Time slot already booked',
      code: 'COURT_DOUBLE_BOOKING',
      details: {},
    });
  });

  it('returns 500 INTERNAL_SERVER_ERROR for unknown errors', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR',
      details: {},
    });
  });

  it('includes details when provided', () => {
    const res = mockRes();
    const err = new AppError(400, 'VALIDATION_ERROR', 'Invalid', { field: 'date' });
    errorHandler(err, mockReq, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { field: 'date' } })
    );
  });
});
