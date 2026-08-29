const { getConfig, sha256Hex, createSession } = require('../../lib/firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const password = String((req.body || {}).password || '');
    const config = await getConfig();
    if (sha256Hex(password) !== config.adminPasswordHash) {
      res.status(401).json({ ok: false, error: 'invalid_password' });
      return;
    }
    const token = await createSession();
    res.status(200).json({ ok: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
};
