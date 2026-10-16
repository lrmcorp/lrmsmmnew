// Private stdin only: never put the password in command arguments or logs.
import fs from 'node:fs';
import { createUser, userCount } from '../src/auth.js';
if (userCount() !== 0) {
  console.error('Owner already exists. No account was changed.');
  process.exit(1);
}
try {
  const { email, password, name } = JSON.parse(fs.readFileSync(0, 'utf8'));
  createUser({ email, password, name, role: 'owner' });
  console.log('Owner created.');
} catch {
  console.error('Owner creation failed; check email and password (minimum 8 characters).');
  process.exitCode = 1;
}
