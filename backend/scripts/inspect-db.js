const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then((SQL) => {
  const dbPath = './workstation.db';
  const db = new SQL.Database(fs.readFileSync(dbPath));
  
  console.log('=== DATABASE TABLES ===');
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  tables[0].values.forEach(row => {
    console.log(`- ${row[0]}`);
  });
  
  console.log('\n=== TABLE STRUCTURES ===');
  tables[0].values.forEach(row => {
    const tableName = row[0];
    console.log(`\nTable: ${tableName}`);
    const schema = db.exec(`PRAGMA table_info(${tableName})`);
    if (schema[0]) {
      schema[0].values.forEach(col => {
        console.log(`  ${col[1]} (${col[2]})${col[3] ? ' NOT NULL' : ''}${col[4] ? ' DEFAULT ' + col[4] : ''}${col[5] ? ' PK' : ''}`);
      });
    }
  });
  
  console.log('\n=== USERS TABLE DATA ===');
  const users = db.exec(`SELECT id, username, email, full_name, role, access_level, status FROM users`);
  if (users[0]) {
    users[0].values.forEach(row => {
      console.log(`ID: ${row[0]}, Username: ${row[1]}, Email: ${row[2]}, Full Name: ${row[3]}, Role: ${row[4]}, Access Level: ${row[5]}, Status: ${row[6]}`);
    });
  }
  
}).catch(err => {
  console.error('Error:', err);
});