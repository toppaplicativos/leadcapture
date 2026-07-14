#!/bin/bash
set -e
cat > /tmp/ig-webhook-test.json << 'EOF'
{"object":"instagram","entry":[{"id":"17841476365227201","time":1710000000,"messaging":[{"sender":{"id":"TEST_SENDER_999"},"recipient":{"id":"17841476365227201"},"timestamp":1710000000000,"message":{"mid":"mid.sim.ola.2","text":"ola tem alguem ai?"}}]}]}
EOF

# Bypass HMAC by temporarily... actually server requires valid HMAC if secret set.
# Use internal path: call dispatcher via node script instead if signature fails.

echo "=== POST webhook ==="
curl -sS -w "\nHTTP %{http_code}\n" -X POST http://127.0.0.1:3001/api/meta/webhook \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/ig-webhook-test.json || true

echo "=== Recent logs ==="
pm2 logs leadcapture-api --lines 60 --nostream 2>&1 | tail -40
