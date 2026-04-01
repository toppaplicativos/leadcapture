const http = require('http');

const data = JSON.stringify({
  email: 'wallacebertozzi16@gmail.com',
  password: '142536He@',
  brand: 'alhopronto'
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/auth/stock-login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.write(data);
req.end();
