const { initDatabase, prepare } = require('../dist/database/schema');

console.log('Testing database with user check...');

(async () => {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    // Check if we can see the users
    const countStmt = prepare('SELECT COUNT(*) as cnt FROM users');
    const countResult = countStmt.all();
    console.log(`User count: ${countResult[0].cnt}`);
    
    if (countResult[0].cnt > 0) {
      const usersStmt = prepare('SELECT id, username, email, access_level FROM users');
      const usersResult = usersStmt.all();
      console.log('Users:');
      usersResult.forEach(u => {
        console.log(`  ID: ${u.id}, Username: ${u.username}, Email: ${u.email}, Access Level: ${u.access_level}`);
      });
    } else {
      console.log('No users found in database');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
})();