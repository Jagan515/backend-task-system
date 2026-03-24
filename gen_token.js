const jwt = require('jsonwebtoken');
const secret = 'super_secret_key_change_me_in_production';
const payload = {
  id: 1,
  name: 'Admin User',
  role: 'ADMIN',
};
const token = jwt.sign(payload, secret);
console.log(token);
