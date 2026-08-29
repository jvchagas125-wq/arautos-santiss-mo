const { isValidSession, getAllBookingsFull } = require('../../lib/firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    if (!(await isValidSession(body.token))) {
      res.status(401).json({ ok: false, error: 'not_authorized' });
      return;
    }
    const bookings = await getAllBookingsFull();
    res.status(200).json({ ok: true, bookings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
};
