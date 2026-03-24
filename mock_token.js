const jwt = require('jsonwebtoken'); console.log(jwt.sign({ id: 1, name: 'Manager', role: 'manager' }, 'super_secret_key_change_me_in_production'));
