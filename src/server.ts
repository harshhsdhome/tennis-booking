import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import courtsRoutes from './routes/courts.routes';
import bookingsRoutes from './routes/bookings.routes';

const app = express();

app.use(express.json());

// Health check — public, no auth
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/courts', courtsRoutes);
app.use('/bookings', bookingsRoutes);

// Must be registered last
app.use(errorHandler);

export default app;
