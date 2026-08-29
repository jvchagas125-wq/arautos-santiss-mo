const { getConfig, getAllBookingCounts } = require('../lib/firebase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const [config, counts] = await Promise.all([getConfig(), getAllBookingCounts()]);
    // Never expose adminPasswordHash or booker names/phones on the public endpoint.
    const { adminPasswordHash, ...publicConfig } = config;
    res.status(200).json({ config: publicConfig, counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: String(err && err.message || err) });
  }
};
