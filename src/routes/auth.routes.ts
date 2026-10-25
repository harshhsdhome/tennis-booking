import { Router } from 'express';
import { registerHandler, loginHandler } from '../controllers/auth.controller';

const router = Router();

router.post('/register', registerHandler);
router.post('/login', loginHandler);

export default router;
