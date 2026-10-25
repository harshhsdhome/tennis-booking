import { Request, Response, NextFunction } from 'express';
import * as courtsService from '../services/courts.service';

export async function listCourtsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const courts = await courtsService.listCourts();
    res.json(courts);
  } catch (err) {
    next(err);
  }
}

export async function getAvailabilityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const courtId = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(courtId)) {
      res.status(404).json({ error: 'Court not found', code: 'COURT_NOT_FOUND', details: {} });
      return;
    }
    const date = req.query['date'] as string | undefined;
    if (!date) {
      res.status(400).json({ error: 'date query parameter is required', code: 'VALIDATION_ERROR', details: {} });
      return;
    }
    const result = await courtsService.getAvailability(courtId, date);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
