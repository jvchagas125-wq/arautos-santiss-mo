const { isValidSession, removeBooking } = require('../../lib/firebase');

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
    const slotKey = String(body.slotKey || '');
    const bookingId = String(body.bookingId || '');
    if (!slotKey || !bookingId) {
      res.status(400).json({ ok: false, error: 'bad_request' });
      return;
    }
    await removeBooking(slotKey, bookingId);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
};
