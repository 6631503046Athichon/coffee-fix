// Simple API test
const http = require('http');

const testLogin = () => {
  const data = JSON.stringify({
    email: 'admin@coffee.com',
    password: 'admin123'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\n🌐 API Test - Login Endpoint`);
    console.log(`Status Code: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      try {
        const json = JSON.parse(responseData);
        if (res.statusCode === 200) {
          console.log('✅ Login API working!');
          console.log('User:', json.user.name);
          console.log('Roles:', json.user.roles);
        } else {
          console.log('❌ Login failed:', json.error || responseData);
        }
      } catch (e) {
        console.log('Response:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ Backend server is not running!');
    console.log('   Error:', error.message);
    console.log('\n💡 Start backend server with:');
    console.log('   cd backend');
    console.log('   npm run dev');
  });

  req.write(data);
  req.end();
};

console.log('🧪 Testing Backend API...');
testLogin();

