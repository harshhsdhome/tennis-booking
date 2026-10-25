import { Router } from 'express';
import { listCourtsHandler, getAvailabilityHandler } from '../controllers/courts.controller';

const router = Router();

// Public — no authenticate middleware
router.get('/', listCourtsHandler);
router.get('/:id/availability', getAvailabilityHandler);

export default router;
