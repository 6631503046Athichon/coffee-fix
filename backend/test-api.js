// Quick test script to check if API and database are working
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api';

async function testAPI() {
  console.log('🧪 Testing Backend API...\n');

  // Test 1: Login
  console.log('1. Testing Login API...');
  try {
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@coffee.com',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    if (loginResponse.ok) {
      console.log('✅ Login successful!');
      console.log('   User:', loginData.user.name);
      console.log('   Roles:', loginData.user.roles);
    } else {
      console.log('❌ Login failed:', loginData.error);
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
  }

  // Test 2: Get Users (requires auth)
  console.log('\n2. Testing Get Users API...');
  try {
    const usersResponse = await fetch(`${API_URL}/users`, {
      headers: {
        'Cookie': 'auth-token=test' // This won't work, but shows the endpoint
      }
    });
    console.log('   Status:', usersResponse.status);
  } catch (error) {
    console.log('   Note: Requires authentication');
  }

  console.log('\n✅ API test completed!');
}

testAPI();

