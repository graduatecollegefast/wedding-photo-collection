// Usage: npm run hash-password -- "the dashboard password"
// Prints the value to paste into the DASHBOARD_PASSWORD_HASH environment variable in Netlify.

import { hashPassword } from '../netlify/lib/session.mjs';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Give a password of at least 10 characters:  npm run hash-password -- "your password"');
  process.exit(1);
}
console.log(hashPassword(password));
