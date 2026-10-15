// Usage: npm run create-admin -- email@domain.com "password" "Nama" [admin|member]
import { createUser } from '../src/auth.js';
const [email, password, name, role = 'admin'] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run create-admin -- <email> <password> [name] [admin|member]'); process.exit(1); }
try { console.log(createUser({ email, password, name, role })); }
catch (e) { console.error(e.message); process.exit(1); }
