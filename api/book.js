const { getConfig, addBookingAtomic } = require('../lib/firebase');
const crypto = require('crypto');

const SLOT_RE = /^(\d{4}-\d{2}-\d{2})\|(\d{2})$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const slotKey = String(body.slotKey || '');
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();

    const m = SLOT_RE.exec(slotKey);
    if (!m) { res.status(400).json({ ok: false, reason: 'bad_slot' }); return; }
    const dateKey = m[1];
    const hour = Number(m[2]);

    if (name.length < 3) { res.status(400).json({ ok: false, reason: 'bad_name' }); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) { res.status(400).json({ ok: false, reason: 'bad_phone' }); return; }

    const config = await getConfig();

    if (dateKey < config.startDate || dateKey > config.endDate) {
      res.status(400).json({ ok: false, reason: 'out_of_range' });
      return;
    }
    if (!(config.activeHours || []).includes(hour)) {
      res.status(400).json({ ok: false, reason: 'hour_closed' });
      return;
    }
    // Reject slots that have already elapsed (server clock, UTC date compare).
    const now = new Date();
    const todayKey = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + String(now.getUTCDate()).padStart(2, '0');
    if (dateKey < todayKey || (dateKey === todayKey && hour < now.getUTCHours())) {
      res.status(400).json({ ok: false, reason: 'past' });
      return;
    }

    const booking = {
      id: crypto.randomBytes(12).toString('hex'),
      name: name.slice(0, 80),
      phone: phone.slice(0, 20),
      ts: Date.now()
    };

    const result = await addBookingAtomic(slotKey, booking, config.capacity || 1);
    if (!result.ok) {
      res.status(409).json({ ok: false, reason: 'full' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, reason: 'server_error', message: String(err && err.message || err) });
  }
};
