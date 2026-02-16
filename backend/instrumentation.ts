import { config } from 'dotenv';
import { resolve } from 'path';

export async function register() {
  // Load .env file
  const result = config({ path: resolve(process.cwd(), '.env') });
  
  if (result.error) {
    console.error('Error loading .env file:', result.error);
  } else {
    console.log('✓ Loaded environment variables from .env');
    console.log('✓ DATABASE_URL exists:', !!process.env.DATABASE_URL);
  }
}
