#!/bin/bash
sed -i 's|http://127.0.0.1:3003|https://app.leadcapture.online|g' /home/leadcapture/app.leadcapture.online/.env
grep -E 'FRONTEND_URL|CHECKOUT_BASE|FRONTEND_PUBLIC' /home/leadcapture/app.leadcapture.online/.env
pm2 restart leadcapture
echo "DONE"
