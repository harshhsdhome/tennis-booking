CREATE TYPE booking_status AS ENUM ('active', 'cancelled', 'completed');

CREATE TABLE bookings (
  id         SERIAL         PRIMARY KEY,
  user_id    INTEGER        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  court_id   INTEGER        NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date       DATE           NOT NULL,
  start_time TEXT           NOT NULL,
  end_time   TEXT           NOT NULL,
  status     booking_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_court_date  ON bookings (court_id, date);
CREATE INDEX idx_bookings_user_status ON bookings (user_id, status);
