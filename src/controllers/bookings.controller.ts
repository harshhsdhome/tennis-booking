import { Request, Response, NextFunction } from 'express';
import * as bookingsService from '../services/bookings.service';

export async function createBookingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { courtId, date, startTime, endTime } = req.body as {
      courtId: number;
      date: string;
      startTime: string;
      endTime: string;
    };
    const booking = await bookingsService.createBooking(userId, { courtId, date, startTime, endTime });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

export async function getMyBookingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const bookings = await bookingsService.getMyBookings(userId);
    res.json(bookings);
  } catch (err) {
    next(err);
  }
}

export async function cancelBookingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const bookingId = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(bookingId)) {
      res.status(404).json({ error: 'Booking not found', code: 'BOOKING_NOT_FOUND', details: {} });
      return;
    }
    const booking = await bookingsService.cancelBooking(userId, bookingId);
    res.json(booking);
  } catch (err) {
    next(err);
  }
}
