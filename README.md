# a1-database

Zero installation, zero dependencies, multi-key, persistent, JSON database.

## Installation

```bash
npm install a1-database
```

No external database installation is required because all data is stored in one single file. Perfect for development!.

## Usage

The objects to be stored are just JSON-like objects.

Instead of assigning an \_id fied to each element, multiple keys are allowed by using the appropriate filter function.

To use unique IDs, use always a filter (e.g: `el=>el.id===$id`) when saving an element.

Portable. Each database is one file. Easy to backup and to dump data.

```javascript
const database = require('../lib/database')

async function test() {
  try {
    // connect to database (file location is process.pwd() + file)
    const db = await database.connect('test.db')
    // the elements are just JSON objects
    const item = { name: 'juan', age: 31 }
    // function to filter data
    const filter = el => el.name === item.name
    // find objects
    console.log(await db.find(filter))
    // store object
    console.log(await db.save(item))
    item.age = 32
    // this time, save but also delete old objects
    console.log(await db.save(item, filter))
    // delete all the elements in the db
    console.log(await db.delete(() => true))
    // disconnect is optional
    database.disconnect(db)
  } catch (err) {
    console.error(err)
  }
}

test()
```

## API

Db:
- **find(filter: function) : Array** -> return list of items based on a function
- **save(item(s):Array|Object [,filter: function]) : number** -> save items, optionally delete old items by using a function, return the number of added - deleted items
- **delete(filter: function) : number** -> return list of deleted items based on a function

### Why filters instead of objects for finding?

Other databases use SQL or JSON models to perform queries. When queries are simple, things are nice (`{id:28}` vs `el => el.id === 28`), but when queries are complex, you need to learn the query syntax "tricky parts", or perform several steps. By using functions (filters) instead, you can create the query the same way you would do when using a plain javascript array. Besides, the query is already sanitied. 
