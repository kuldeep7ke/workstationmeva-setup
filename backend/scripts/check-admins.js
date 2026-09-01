const { initDatabase, prepare } = require('../dist/database/schema');

(async () => {
  try {
    console.log('Calling initDatabase...');
    await initDatabase();
    console.log('initDatabase completed');
    
    // Check total user count first
    console.log('Preparing count statement...');
    const countStmt = prepare(`SELECT COUNT(*) as cnt FROM users`);
    console.log('Executing count query...');
    const countResult = countStmt.all();
    console.log(`Total users in database: ${countResult[0].cnt}`);
    
    // Check all users
    const allStmt = prepare(`SELECT id, username, email, role, access_level FROM users`);
    const allUsers = allStmt.all();
    console.log('\nAll Users:');
    allUsers.forEach(user => {
      console.log(`ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Role: ${user.role}, Access Level: ${user.access_level}`);
    });
    
    // Check admin users specifically
    const adminStmt = prepare(`SELECT id, username, email, role, access_level FROM users WHERE access_level = 1 OR role = 'admin'`);
    const adminUsers = adminStmt.all();
    console.log('\nAdmin Users in System:');
    console.log('======================');
    if (adminUsers.length === 0) {
      console.log('No admin users found!');
    } else {
      adminUsers.forEach(user => {
        console.log(`ID: ${user.id}`);
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`Access Level: ${user.access_level}`);
        console.log('-------------------');
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();