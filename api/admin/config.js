const { isValidSession, updateConfig } = require('../../lib/firebase');

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

    const patch = body.patch || {};
    const startDate = String(patch.startDate || '');
    const endDate = String(patch.endDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
      res.status(400).json({ ok: false, error: 'bad_dates' });
      return;
    }
    const activeHours = Array.isArray(patch.activeHours)
      ? patch.activeHours.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
      : [];
    const capacity = Math.max(1, Math.min(20, Number(patch.capacity) || 1));
    const churchName = String(patch.churchName || '').trim().slice(0, 120) || 'Adoração ao Santíssimo Sacramento';
    const subtitle = String(patch.subtitle || '').trim().slice(0, 200);
    const contactPhone = String(patch.contactPhone || '').trim().slice(0, 30);

    await updateConfig({ churchName, subtitle, contactPhone, startDate, endDate, activeHours, capacity });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
};
