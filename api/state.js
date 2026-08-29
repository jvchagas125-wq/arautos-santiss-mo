const { getConfig, getAllBookingCounts, getAllBookingNames } = require('../lib/firebase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const [config, counts, names] = await Promise.all([getConfig(), getAllBookingCounts(), getAllBookingNames()]);
    // Never expose adminPasswordHash or phone numbers on the public endpoint — only names.
    const { adminPasswordHash, ...publicConfig } = config;
    res.status(200).json({ config: publicConfig, counts, names });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: String(err && err.message || err) });
  }
};
