export interface User {
  id: number;
  email: string;
  name: string;
  password: string;
  createdAt: Date;
}

export interface Court {
  id: number;
  name: string;
}

export type BookingStatus = 'active' | 'cancelled' | 'completed';

export interface Booking {
  id: number;
  userId: number;
  courtId: number;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  status: BookingStatus;
  createdAt: Date;
}

export interface BookingWithCourt extends Booking {
  courtName: string;
}
