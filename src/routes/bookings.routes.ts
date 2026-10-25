import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  createBookingHandler,
  getMyBookingsHandler,
  cancelBookingHandler,
} from '../controllers/bookings.controller';

const router = Router();

// All booking routes are protected — AC-3
router.use(authenticate);

router.post('/', createBookingHandler);
router.get('/mine', getMyBookingsHandler);
router.delete('/:id/cancel', cancelBookingHandler);

export default router;
