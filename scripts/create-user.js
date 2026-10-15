// Usage: npm run create-admin -- email@domain.com "password" "Nama" [owner|rep]
import { createUser } from '../src/auth.js';
const [email, password, name, role = 'owner'] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run create-admin -- <email> <password> [name] [owner|rep]'); process.exit(1); }
try { console.log(createUser({ email, password, name, role })); }
catch (e) { console.error(e.message); process.exit(1); }
