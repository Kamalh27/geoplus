const http = require('http');

const cookieName = "sessionid";
// Mock a token for test, ideally I'd want the user's actual token but I can't get it easily.
// I will just check if the backend rejects it properly.

const req = http.request({
  hostname: 'api.spadace.local',
  port: 8000,
  path: '/api/v1/users/me',
  method: 'GET',
  headers: {
    'Cookie': `${cookieName}=dummy_token`
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(`Status: ${res.statusCode}\nBody: ${data}`));
});

req.on('error', (e) => console.error(e));
req.end();
