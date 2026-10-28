// OllaSieve - Agent proxy server
// Sits between OpenChamber and OpenCode, with optional provider dashboard and classifier proxy.

const express = require('express');

const app = express();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'olla-sieve' });
});

// Proxy endpoint for agent requests
app.use('/api/proxy', (req, res) => {
  // Forward to upstream agent platform
  res.json({ proxying: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`OllaSieve agent proxy listening on port ${PORT}`);
});
