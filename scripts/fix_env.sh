#!/bin/bash
sed -i 's|http://127.0.0.1:3003|https://app.leadcapture.online|g' /root/leadcapture/.env
grep -E 'FRONTEND_URL|CHECKOUT_BASE|FRONTEND_PUBLIC' /root/leadcapture/.env
pm2 restart leadcapture-api leadcapture-web
echo "DONE"
