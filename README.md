# a1-database

Zero installation, zero dependencies, multi-key, persistent, JSON database.

## Installation

```bash
npm install a1-database
```

No external database installation is required because all data is stored in one single file. Perfect for development!.

## Usage

The database uses javascript objects (no ORM needed). The query results are provided as array of objects.

Instead of assigning an \_id field to each element, multiple keys are allowed by using the appropriate filter function (useful for logs or for data series).

To use unique IDs, a filter function (e.g: `el=>el.id===$id`) must be provided when saving an element. This will update the old values and save the new ones.

Portable. Each database is one file. Easy to backup and to dump data.

```javascript
const database = require('a1-database')

async function test() {
  const db = await database.connect('users.db')
  let results = await db.find(el => el.name === 'Juan')
}

test().catch(console.error)
```

## API

**database:**
- **connect(path: string) : Db** -> given a relative path to process.CWD() starts the database connection
- **disconnect(db: Db): void** -> close database and clean resources

**Db:**
- **find(filter)** -> return list of items based on a function. `find(filter: function) : Array`
- **save(item(s)[,filter])** -> save items, optionally delete old items by using a function, return the number of added - deleted items. `save(item(s):Array|Object [,filter: function]) : number`
- **delete(filter)** -> return list of deleted items based on a function. `delete(filter: function) : number`


## Examples

```javascript
const database = require('a1-database')
const assert = require('assert')

async function test() {
  try {
    // connect to database (file location is process.pwd() + file)
    const db = await database.connect('test/test.db')
    // the elements are just JSON objects
    const item = { name: 'juan', age: 31 }
    // function to filter data
    const filter = el => el.name === item.name
    // find
    let results = await db.find(filter)
    assert.equal(results.length, 0, `find returned ${results.length} values`)
    // store object
    for (let r = 0; r < 10000; r++) {
      item.length = r
      await db.save(item)
    }
    let count = await db.save(item)
    assert.equal(count, 1, `save 1 item`)
    const items = [item, item, item]
    count = await db.save(items)
    assert.equal(count > 1, true, `save several items`)
    // this time, save but also delete old objects
    item.age = 33
    count = await db.save(item, filter)
    assert.equal(count < 0, true, `save 1 item while deleting the old elements with the same 'name'`)
    // delete all the elements in the db
    await db.delete(() => true)
    count = await db.find(() => true)
    assert.equal(count, 0, `database clean`)
    // disconnect is optional
    database.disconnect(db)
    console.log('database tests passed!')
  } catch (err) {
    //assert.fail(err.toString()) //assert.fail exits the function, so the rejected promise is not fulfilled
    console.error(err)
  }
}

test()
  .then(() => console.log('\x1b[32m%s\x1b[0m', '✔ TESTS OK'))
  .catch(err => { console.log('\x1b[31m%s\x1b[0m', '✘ TESTS NOT OK'); console.error(err) })
```


### Why filters instead of SELECT/JSON for querying?

Other databases use SQL or JSON models to perform queries. When queries are simple, traditional queries are cleaner (`{id:28}` vs `el => el.id === 28`), but when queries are complex, you need to learn the query syntax "tricky parts", or perform several steps. By using functions (filters) instead, you can create the query the same way you would do when using a javascript array. Besides, the query is already sanitied.

## Database file format

> The format is compatible for reading JSON log files

Format of row:

`[action][|]json`

Example:

Plain JSON file as input for reading only

```
{"id":"1","name","Gordon"}
{"id":"2","name","Ramsay"}
```

General database with some insert, update, delete operations. Note: to allow force shutdown of the database, the file can contain `delete` actions. Once the database is loaded again, a `compact` process remove the delete rows keeping the database clean.

```
{"id":"1","name","Gordon"}
{"id":"2","name","Ramsay"}
delete|{"id":"1","name","Gordon"}
delete|{"id":"2","name","Ramsay"}
{"id":"1","name","Gordon Ramsay"}
```

## Backup, restore and compact

- backup: copy the database file.
- restore: drop the file. 
- compact: either call db._compact() before stopping the app or just start and stop the database. Both operations will invoke the cleaning action.
