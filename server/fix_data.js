const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
db.serialize(() => {
    db.run("UPDATE transactions SET action='BORROW' WHERE action='GIAO'");
    db.run("UPDATE transactions SET action='RETURN' WHERE action='NHAN'");
});
db.close();
